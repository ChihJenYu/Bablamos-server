const Feed = require("../../models/feed");
const { getUserIds, calcEdgeRankScore } = require("../models");
const User = require("../models/user");
const NEWSFEED_PER_PAGE_FOR_WEB_SERVER = 100;

const getNewsfeed = async (req, res) => {
    const userId = +req.query["user-id"];
    const paging = +req.query.paging;
    const user = await User.findOne(
        { user_id: userId },
        {
            newsfeed: {
                $slice: [
                    NEWSFEED_PER_PAGE_FOR_WEB_SERVER * paging,
                    NEWSFEED_PER_PAGE_FOR_WEB_SERVER,
                ],
            },
            affinity: {
                $slice: 1, // inclusion projection to return nothing?
            },
        }
    );
    const newsfeed = user.newsfeed.map((nf) => {
        return { post_id: nf.post_id, is_new: nf.is_new };
    });
    res.send({ data: newsfeed });
};

const updateNewsfeed = async (req, res) => {
    const method = req.query.method;
    const userId = +req.query["user-id"];
    const postId = +req.query["post-id"];
    const httpMethod = req.method;

    if (method === "write") {
        let followerIds = await getUserIds({
            type: "get_followers",
            user_id: userId,
        });

        followerIds = followerIds.map((id) => id.id);

        // push fresh feed immediately to top
        if (httpMethod === "POST") {
            const timestampStart = Date.now();
            await User.updateMany(
                {
                    user_id: {
                        $in: followerIds,
                    },
                },
                {
                    $push: {
                        newsfeed: {
                            $each: [
                                {
                                    post_id: postId,
                                    edge_rank_score: 0,
                                    is_new: true,
                                    views: 0,
                                },
                            ],
                            $position: 0,
                        },
                    },
                }
            );
            console.log(
                `Push of post #${postId} to followers newsfeed complete; took ${
                    Date.now() - timestampStart
                }ms`
            );
        }
        // recalculate edge rank score and sort
        else if (httpMethod === "PATCH") {
            const timestampStart = Date.now();
            for (let followerId of followerIds) {
                // find user object to get views and affinity
                const userObj = await User.findOne({
                    user_id: followerId,
                });
                const feed = await Feed.getFeedDetail(postId);
                let newsfeedObj = userObj.newsfeed.find(
                    (nf) => nf.post_id == postId
                );
                let views = newsfeedObj ? newsfeedObj.views : 0;
                let affinityObj = userObj.affinity.find(
                    (rel) => rel.user_id == feed.user_id
                );
                let affinity = affinityObj ? affinityObj.affinity : 0;

                // calculate edge rank score
                const edgeRankScore = await calcEdgeRankScore({
                    affinity,
                    feed,
                    my_user_id: userId,
                    views,
                });

                // update edge rank score
                await User.updateOne(
                    { user_id: userId, "newsfeed.post_id": postId },
                    {
                        $set: {
                            "newsfeed.$.edge_rank_score": edgeRankScore,
                        },
                    }
                );

                // sort user newsfeed
                await User.updateOne(
                    { user_id: userId },
                    {
                        $push: {
                            $each: [],
                            $sort: {
                                edge_rank_score: -1,
                            },
                        },
                    }
                );
            }
            console.log(
                `Update of post #${postId} in followers newsfeed complete; took ${
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

// needs a 'find index by key in array of object' function
const recalcNewsfeed = async (req, res) => {
    const type = req.query.type;
    const userId = +req.query["user-id"];
    if (type === "new") {
        const timestampStart = Date.now();
        const readPostIds = req.body.posts;
        console.log("Read fresh posts: ", readPostIds);
        // delete a newsfeed element with { post_id: postId, is_new: 1 }
        if (readPostIds.length === 0) {
            res.sendStatus(200);
            return;
        }
        const pullResult = await User.updateOne(
            {
                user_id: userId,
            },
            {
                $pull: {
                    newsfeed: {
                        post_id: {
                            $in: readPostIds, // why still removes if readPostIds is empty?
                        },
                        is_new: true,
                    },
                },
            }
        );

        // if modifiedCount is not 1 then return

        console.log("Pull result: ", pullResult);

        if (pullResult.modifiedCount == 0) {
            res.sendStatus(200);
            return;
        }

        // if yes then calculate edge rank score then push
        const userObj = await User.findOne({ user_id: userId });

        let feedsToBePushed = [];

        for (let postId of readPostIds) {
            const feed = await Feed.getFeedDetail(postId);
            let affinityObj = userObj.affinity.find(
                (rel) => rel.user_id == feed.user_id
            );
            let affinity = affinityObj ? affinityObj.affinity : 0;

            // view count is not precise
            const edgeRankScore = await calcEdgeRankScore({
                affinity,
                feed,
                my_user_id: userId,
                views: 1,
            });
            feedsToBePushed.push({
                post_id: postId,
                edge_rank_score: edgeRankScore,
                is_new: false,
                views: 1,
            });
        }

        await User.updateOne(
            { user_id: userId },
            {
                $push: {
                    newsfeed: {
                        $each: feedsToBePushed,
                        $sort: {
                            edge_rank_score: -1,
                        },
                    },
                },
            }
        );

        console.log(
            `New post score recalculation complete; took ${
                Date.now() - timestampStart
            }ms`
        );
        res.sendStatus(200);
    } else if (type === "read") {
        const timestampStart = Date.now();
        const readPostIds = req.body.posts;
        console.log("Read posts: ", readPostIds);
        // increment view counts in Mongo
        if (readPostIds.length === 0) {
            res.sendStatus(200);
            return;
        }
        for (let readPost of readPostIds) {
            // increment view count and decrease edge rank score
            await User.updateOne(
                { user_id: userId, "newsfeed.post_id": readPost },
                {
                    $inc: {
                        "newsfeed.$.views": 1,
                    },
                    $mul: {
                        "newsfeed.$.edge_rank_score": 0.8,
                    },
                }
            );
        }

        // reorder
        await User.updateOne(
            // { user_id: userId, "newsfeed.post_id": readPost },
            { user_id: userId },
            {
                // $sort must be used with $each in a $push but $each could be empty
                $push: {
                    newsfeed: {
                        $each: [],
                        $sort: {
                            edge_rank_score: -1,
                        },
                    },
                },
            }
        );

        console.log(
            `View count update complete; took ${Date.now() - timestampStart}ms`
        );
        res.sendStatus(200);
    }
};

module.exports = { getNewsfeed, updateNewsfeed, recalcNewsfeed };
