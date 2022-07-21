const { getUserIds } = require("../models");
const { FRESH_POP_BUFF, TEN_MINUTE_TIME_DECAY, ALREADY_SEEN_BASE } =
    process.env;
const User = require("../models/user");
const NEWSFEED_PER_PAGE_FOR_WEB_SERVER = 100;
const {
    POP_LIKE_WEIGHT,
    POP_SHARE_WEIGHT,
    POP_COMMENT_WEIGHT,
    ONE_HOUR_TIME_DECAY,
    SIX_HOUR_TIME_DECAY,
    ONE_DAY_TIME_DECAY,
    DAYS_BASE,
} = process.env;

const createUser = async (req, res) => {
    const userId = req.query["user-id"];
    const timestampStart = Date.now();
    try {
        const newUser = new User({
            user_id: +userId,
            newsfeed: [],
            affinity: [],
            affinity_with_self: [],
        });
        await newUser.save();
        console.log(
            `Insertion of user #${userId} complete; took ${
                Date.now() - timestampStart
            }ms`
        );
    } catch (e) {
        console.log(e);
    }
};

const removeUserFromNewsfeed = async (req, res) => {
    const { outgoing_user_id, friend_userid } = req.body;
    const timestampStart = Date.now();
    try {
        await User.updateOne(
            { user_id: outgoing_user_id },
            {
                $pull: {
                    newsfeed: {
                        user_id: friend_userid,
                    },
                },
            }
        );
        console.log(
            `Removal of user #${friend_userid} from user #${outgoing_user_id}'s newsfeed complete; took ${
                Date.now() - timestampStart
            }ms`
        );
    } catch (e) {
        console.log(e);
    }
};

const getNewsfeed = async (req, res) => {
    const userId = +req.query["user-id"];
    const from = +req.query.from;
    const user = await User.findOne(
        { user_id: userId },
        {
            newsfeed: {
                $slice: [from, NEWSFEED_PER_PAGE_FOR_WEB_SERVER],
            },
            affinity: 0,
        }
    );
    if (!user) {
        res.send({ data: [] });
        return;
    }
    const newsfeed = user.newsfeed.map((nf) => {
        return { post_id: nf.post_id };
    });
    res.send({ data: newsfeed });
};

const updateNewsfeed = async (req, res) => {
    const method = req.query.method;
    const userId = +req.query["user-id"];
    const postId = +req.query["post-id"];
    const createdAt = req.query["created-at"];
    const httpMethod = req.method;

    if (method === "write") {
        let followerIds = await getUserIds({
            type: "get_followers",
            user_id: userId,
        });

        followerIds = followerIds.map((id) => id.id);

        // push fresh feed to followers
        if (httpMethod === "POST") {
            const timestampStart = Date.now();

            let affinityWithSelf = {};
            const posterObj = await User.findOne(
                { user_id: userId },
                { affinity_with_self: 1 }
            );

            if (posterObj) {
                posterObj.affinity_with_self.forEach((user) => {
                    affinityWithSelf[user.user_id] = user.affinity_with_self;
                });
            }
            // }
            const bulkWrites = [];
            for (let followerId of followerIds) {
                bulkWrites.push({
                    updateOne: {
                        filter: {
                            user_id: followerId,
                        },
                        update: {
                            $push: {
                                newsfeed: {
                                    $each: [
                                        {
                                            post_id: postId,
                                            user_id: userId,
                                            affinity:
                                                affinityWithSelf[followerId] ||
                                                0,
                                            like_score: 0,
                                            comment_score: 0,
                                            share_score: 0,
                                            fresh_pop_buff: +FRESH_POP_BUFF,
                                            // popularity buff for new posts
                                            popularity: +FRESH_POP_BUFF,
                                            time_decay_factor:
                                                +TEN_MINUTE_TIME_DECAY,
                                            created_at: createdAt,
                                            views: 0,
                                            edge_rank_score:
                                                ((1 +
                                                    (affinityWithSelf[
                                                        followerId
                                                    ] || 0)) *
                                                    +FRESH_POP_BUFF) /
                                                +TEN_MINUTE_TIME_DECAY,
                                            is_new: true,
                                        },
                                    ],
                                    $sort: {
                                        edge_rank_score: -1,
                                    },
                                },
                            },
                        },
                    },
                });
            }

            await User.bulkWrite(bulkWrites);

            console.log(
                `Push of post #${postId} to followers newsfeed complete; took ${
                    Date.now() - timestampStart
                }ms`
            );
        }
        // pull feed from newsfeed
        else if (httpMethod === "DELETE") {
            const timestampStart = Date.now();
            await User.updateMany(
                {
                    user_id: {
                        $in: followerIds,
                    },
                },
                {
                    $pull: {
                        newsfeed: {
                            post_id: postId,
                        },
                    },
                }
            );
            console.log(
                `Removal of post #${postId} from followers newsfeed complete; took ${
                    Date.now() - timestampStart
                }ms`
            );
        }
    }
    res.sendStatus(200);
};

// after view
const recalcNewsfeed = async (req, res) => {
    const userId = +req.query["user-id"];
    const timestampStart = Date.now();
    const readPostIds = req.body.posts;
    console.log("Read posts: ", readPostIds);
    // increment view counts in Mongo
    if (readPostIds.length === 0) {
        res.sendStatus(200);
        return;
    }
    const updates = [];
    updates.push({
        updateOne: {
            filter: { user_id: userId },
            update: {
                $inc: {
                    "newsfeed.$[elem].views": 1,
                },
                $mul: {
                    "newsfeed.$[elem].edge_rank_score": 1 / +ALREADY_SEEN_BASE,
                },
                $set: {
                    "newsfeed.$[elem].is_new": false,
                },
                $set: {
                    "newsfeed.$[elem].fresh_pop_buff": 0,
                },
            },
            arrayFilters: [
                {
                    "elem.post_id": {
                        $in: readPostIds,
                    },
                },
            ],
        },
    });
    updates.push({
        updateOne: {
            filter: { user_id: userId },
            update: {
                $push: {
                    newsfeed: {
                        $each: [],
                        $sort: {
                            edge_rank_score: -1,
                        },
                    },
                },
            },
        },
    });
    await User.bulkWrite(updates);

    console.log(
        `View count update complete; took ${Date.now() - timestampStart}ms`
    );
    res.sendStatus(200);
};

module.exports = {
    createUser,
    removeUserFromNewsfeed,
    getNewsfeed,
    updateNewsfeed,
    recalcNewsfeed,
};
