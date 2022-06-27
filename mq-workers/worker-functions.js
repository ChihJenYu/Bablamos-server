const {
    getUserIds,
    generateUserAffinityTable,
    calculateLikeScore,
    calculateCommentScore,
    calculatePopularity,
    POP_WEIGHT,
    calculateShareScore,
    calculateTimeDecayFactor,
} = require("../newsfeed-generation-service/models");
const User = require("../models/user");
const Feed = require("../models/feed");
const Post = require("../models/post");

// update user's affinity list and score in each newsfeed item
const recalcAffinityTable = async () => {
    console.log("Begin recalculating user affinity table");
    const beginTime = Date.now();
    const userAffinityTable = await generateUserAffinityTable();
    const affinityTableCompleteTime = Date.now();
    console.log(
        `Generating user affinity table took ${
            affinityTableCompleteTime - beginTime
        }ms`
    );
    const allUsers = Object.keys(userAffinityTable);
    for (let user of allUsers) {
        user = +user;
        let userAffinityList = [];
        const otherUsers = Object.keys(userAffinityTable[user]);
        for (let otherUser of otherUsers) {
            otherUser = +otherUser;
            const updatedUser = await User.findOneAndUpdate(
                {
                    user_id: user,
                    "newsfeed.user_id": otherUser,
                },
                {
                    $set: {
                        "newsfeed.$.affinity":
                            userAffinityTable[userId][otherUserId] || 0,
                    },
                },
                { new: true }
            );
            let matchingNewsfeedEles = updatedUser.newsfeed.filter(
                (el) => el.user_id == otherUser
            );
            for (let i = 0; i < matchingNewsfeedEles.length; i++) {
                const el = matchingNewsfeedEles[i];
                el.edge_rank_score =
                    (el.affinity + el.edge_weight) /
                    el.time_decay_factor /
                    Math.pow(1.25, el.views);
                matchingNewsfeedEles[i] = el;
            }
            // remove from document where newsfeed element's user_id = user
            await User.updateOne(
                {
                    user_id: user,
                },
                {
                    $pull: {
                        newsfeed: {
                            user_id: user,
                        },
                    },
                }
            );

            // add in new newsfeed element with updated edge rank score
            await User.updateOne(
                {
                    user_id: user,
                },
                {
                    $push: {
                        newsfeed: {
                            $each: matchingNewsfeedEles,
                            $sort: {
                                edge_rank_score: -1,
                            },
                        },
                    },
                }
            );

            if (!userAffinityTable[userId][otherUserId]) {
                continue;
            }
            userAffinityList.push({
                user_id: otherUser,
                affinity: userAffinityTable[user][otherUser],
            });
        }
        await User.updateOne(
            { user_id: user },
            {
                $set: {
                    affinity: userAffinityList,
                },
            }
        );
    }
    console.log(
        `Updating user affinity in Mongo took ${
            Date.now() - affinityTableCompleteTime
        }ms`
    );
};

const recalcTimeDecayFactor = async () => {
    // harder for sharding based on user id?
    const allPostIds = await Post.find(["id", "user_id", "created_at"]);
    for (let post of allPostIds) {
        const { id, user_id, created_at } = post;
        const timeDecayFactor = calculateTimeDecayFactor({ created_at });
        let allFollowerIds = getUserIds({
            type: "get_followers",
            user_id,
        });
        allFollowerIds = allFollowerIds.map((id) => id.id);
        for (let followerId of allFollowerIds) {
            const updatedUser = await User.findOneAndUpdate(
                {
                    user_id: followerId,
                    "newsfeed.post_id": id,
                },
                {
                    $set: {
                        "newsfeed.$.time_decay_factor": timeDecayFactor,
                    },
                },
                {
                    new: true,
                }
            );
            let matchingNewsfeedEles = updatedUser.newsfeed.filter(
                (el) => el.post_id == id
            );
            for (let i = 0; i < matchingNewsfeedEles.length; i++) {
                const el = matchingNewsfeedEles[i];
                el.edge_rank_score =
                    (el.affinity + el.edge_weight) /
                    el.time_decay_factor /
                    Math.pow(1.25, el.views);
                matchingNewsfeedEles[i] = el;
            }
            // remove from document where newsfeed element's user_id = user
            await User.updateOne(
                {
                    user_id: user,
                },
                {
                    $pull: {
                        newsfeed: {
                            post_id: id,
                        },
                    },
                }
            );

            // add in new newsfeed element with updated edge rank score
            await User.updateOne(
                {
                    user_id: user,
                },
                {
                    $push: {
                        newsfeed: {
                            $each: matchingNewsfeedEles,
                            $sort: {
                                edge_rank_score: -1,
                            },
                        },
                    },
                }
            );
        }
    }
};

// type: ["like", "comment", "share"]
const checkPopCount = async ({ post_id, type }) => {
    const data = await Feed.getPopularity({
        post_id,
        metric: type,
    });
    const post_id = data.post_id;
    let pop_count;
    let newPopSubScore;
    if (type == "like") {
        pop_count = data.like_count;
        if (pop_count % 10 !== 0) {
            return;
        }
        newPopSubScore = calculateLikeScore(data.like_count);
    } else if (type == "comment") {
        pop_count = data.comment_count;
        if (pop_count % 7 !== 0) {
            return;
        }
        newPopSubScore = calculateCommentScore(data.comment_count);
    } else {
        pop_count = data.share_count;
        if (pop_count % 5 !== 0) {
            return;
        }
        newPopSubScore = calculateShareScore(data.share_count);
    }

    let allFollowerIds = await getUserIds({
        type: "get_followers",
        user_id,
    });
    allFollowerIds = allFollowerIds.map((id) => id.id);

    // recalculate score
    for (followerId of allFollowerIds) {
        // update these users' newsfeed item like_score, popularity, edge_weight, edge_rank_score and sort
        let updatedUser;

        if (type == "like") {
            updatedUser = await User.findOneAndUpdate(
                {
                    user_id: followerId,
                    "newsfeed.post_id": post_id,
                },
                {
                    $set: {
                        "newsfeed.$.like_score": newPopSubScore,
                    },
                },
                { new: true }
            );
        } else if (type == "comment") {
            updatedUser = await User.findOneAndUpdate(
                {
                    user_id: followerId,
                    "newsfeed.post_id": post_id,
                },
                {
                    $set: {
                        "newsfeed.$.comment_score": newPopSubScore,
                    },
                },
                { new: true }
            );
        } else {
            updatedUser = await User.findOneAndUpdate(
                {
                    user_id: followerId,
                    "newsfeed.post_id": post_id,
                },
                {
                    $set: {
                        "newsfeed.$.share_score": newPopSubScore,
                    },
                },
                { new: true }
            );
        }

        let matchingNewsfeedEles = updatedUser.newsfeed.filter(
            (el) => el.post_id == post_id
        );

        for (let i = 0; i < matchingNewsfeedEles.length; i++) {
            let el = matchingNewsfeedEles[i];
            const popChange =
                calculatePopularity(
                    el.like_score,
                    el.comment_score + el.share_score
                ) - el.popularity;
            el.popularity = calculatePopularity(
                el.like_score,
                el.comment_score + el.share_score
            );
            el.edge_weight = el.edge_weight + POP_WEIGHT * popChange;
            el.edge_rank_score =
                (el.affinity + el.edge_weight) /
                el.time_decay_factor /
                Math.pow(1.25, views);
            matchingNewsfeedEles[i] = el;
        }
        await User.updateOne(
            {
                user_id: followerId,
            },
            {
                $pull: {
                    newsfeed: {
                        post_id,
                    },
                },
            }
        );
        await User.updateOne(
            {
                user_id: followerId,
            },
            {
                $push: {
                    newsfeed: {
                        $each: matchingNewsfeedEles,
                        $sort: {
                            edge_rank_score: -1,
                        },
                    },
                },
            }
        );
    }
};

module.exports = { recalcAffinityTable, checkPopCount, recalcTimeDecayFactor };
