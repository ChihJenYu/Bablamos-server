const {
    getUserIds,
    generateUserAffinityTable,
    calculateLikeScore,
    calculateCommentScore,
    calculatePopularity,
    POP_WEIGHT,
    calculateShareScore,
} = require("../newsfeed-generation-service/models");
require("../newsfeed-generation-service/mongoose");
const User = require("../newsfeed-generation-service/models/user");
const Feed = require("../models/feed");
const Post = require("../models/post");
// type: ["updateOne", "updateMany"]
// cond: { user_id: 2 }
// check_popularity: true
const recalculateEdgeRankScore = async ({ method, cond, check_popularity }) => {
    const updatePopularity = {
        $addFields: {
            newsfeed: {
                $map: {
                    input: "$newsfeed",
                    as: "n",
                    in: {
                        $mergeObjects: [
                            "$$n",
                            {
                                popularity: {
                                    $sum: [
                                        {
                                            $multiply: [1, "$$n.like_score"],
                                        },
                                        {
                                            $multiply: [2, "$$n.comment_score"],
                                        },
                                        {
                                            $multiply: [3, "$$n.share_score"],
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            },
        },
    };
    const updateEdgeWeight = {
        $addFields: {
            newsfeed: {
                $map: {
                    input: "$newsfeed",
                    as: "n",
                    in: {
                        $mergeObjects: [
                            "$$n",
                            {
                                edge_weight: {
                                    $sum: [
                                        "$$n.edge_weight",
                                        {
                                            $multiply: [
                                                POP_WEIGHT,
                                                "$$n.popularity",
                                            ],
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            },
        },
    };
    const updateEdgeRankScore = {
        $addFields: {
            newsfeed: {
                $map: {
                    input: "$newsfeed",
                    as: "n",
                    in: {
                        $mergeObjects: [
                            "$$n",
                            {
                                test_field: {
                                    $divide: [
                                        {
                                            $divide: [
                                                {
                                                    $sum: [
                                                        "$$n.affinity",
                                                        "$$n.edge_weight",
                                                    ],
                                                },
                                                "$$n.time_decay_factor",
                                            ],
                                        },
                                        {
                                            $pow: [1.25, "$$n.views"],
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            },
        },
    };
    const pipelines = check_popularity
        ? [updatePopularity, updateEdgeWeight, updateEdgeRankScore]
        : [updateEdgeRankScore];

    if (method === "updateOne") {
        await User.updateOne(cond, pipelines);
    } else {
        await User.updateMany(cond, pipelines);
    }
};
const sortNewsfeed = async () => {
    await User.updateMany({
        $push: {
            newsfeed: {
                $each: [],
                $sort: {
                    edge_rank_score: -1,
                },
            },
        },
    });
};

// update user's affinity list and score in each newsfeed item
const recalcAffinityTable = async () => {
    console.log("Begin job: recalculating user affinity table");
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

            await User.findOneAndUpdate(
                {
                    user_id: user,
                    "newsfeed.user_id": otherUser,
                },
                {
                    $set: {
                        "newsfeed.$.affinity":
                            userAffinityTable[user][otherUser] || 0,
                    },
                }
            );

            if (!userAffinityTable[user][otherUser]) {
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
    await recalculateEdgeRankScore({ method: "updateMany", cond: {} });
    await sortNewsfeed();
    const completeTime = Date.now();
    console.log(
        `Updating user affinity in Mongo took ${
            completeTime - affinityTableCompleteTime
        }ms for ${Object.keys(userAffinityTable)} users (${
            (completeTime - affinityTableCompleteTime) /
            Object.keys(userAffinityTable)
        }ms per user)\n-----------------------------------------`
    );
};

// type 1 (per 5m) & 2 (per 24 hour)
const recalcTimeDecayFactor = async ({ type }) => {
    const beginTime = Date.now();
    console.log("Begin job: recalculating time decay factor");
    if (type === 1) {
        await User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": 1.1,
                },
            },
            {
                arrayFilters: [
                    {
                        "el.created_at": {
                            $lte: Date.now() / 1000 - 60 * 10,
                            $gte: Date.now() / 1000 - 60 * 60,
                        },
                    },
                ],
            }
        );
        await User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": 1.2,
                },
            },
            {
                arrayFilters: [
                    {
                        "el.created_at": {
                            $lte: Date.now() / 1000 - 60 * 60 * 1,
                            $gte: Date.now() / 1000 - 60 * 60 * 6,
                        },
                    },
                ],
            }
        );
        await User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": 1.3,
                },
            },
            {
                arrayFilters: [
                    {
                        "el.created_at": {
                            $lte: Date.now() / 1000 - 60 * 60 * 6,
                            $gte: Date.now() / 1000 - 60 * 60 * 24,
                        },
                    },
                ],
            }
        );
    } else {
        await User.updateMany(
            {},
            {
                $mul: {
                    "newsfeed.$[el].time_decay_factor": 1.1,
                },
            },
            {
                arrayFilters: [
                    {
                        "el.created_at": {
                            $lte: Date.now() / 1000 - 60 * 60 * 24,
                        },
                        "el.time_decay_factor": {
                            $gte: 1.4,
                        },
                    },
                ],
            }
        );
        await User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": 1.4,
                },
            },
            {
                arrayFilters: [
                    {
                        "el.created_at": {
                            $lte: Date.now() / 1000 - 60 * 60 * 24,
                        },
                        "el.time_decay_factor": {
                            $lt: 1.4,
                        },
                    },
                ],
            }
        );
    }
    await recalculateEdgeRankScore({ method: "updateMany", cond: {} });
    await sortNewsfeed();
    console.log(
        `Total time elapsed: ${
            Date.now() - beginTime
        }ms\n-----------------------------------------`
    );
};

// type: ["like", "comment", "share"]
const checkPopCount = async ({ post_id, type }) => {
    console.log(
        `Begin job: recalculating popularity and edge rank score for post #${post_id}`
    );
    const beginTime = Date.now();
    const data = await Feed.getPopularity({
        post_id,
        metric: type,
    });
    let pop_count;
    let newPopSubScore;
    const [{ user_id }] = await Post.find(["user_id"], { id: post_id });

    let allFollowerIds = await getUserIds({
        type: "get_followers",
        user_id,
    });
    allFollowerIds = allFollowerIds.map((id) => id.id);
    const postBeginTime = Date.now();

    if (type == "like") {
        pop_count = data.like_count;
        if (pop_count % 10 !== 0) {
            console.log(`Does not warrant popularity calculation; exiting...`);
            return;
        }
        newPopSubScore = calculateLikeScore(data.like_count);
        await User.updateMany(
            {
                user_id: {
                    $in: allFollowerIds,
                },
                "newsfeed.post_id": post_id,
            },
            {
                $set: {
                    "newsfeed.$.like_score": newPopSubScore,
                },
            }
        );
    } else if (type == "comment") {
        pop_count = data.comment_count;
        if (pop_count % 7 !== 0) {
            console.log(`Does not warrant popularity calculation; exiting...`);
            return;
        }
        newPopSubScore = calculateCommentScore(data.comment_count);
        await User.updateMany(
            {
                user_id: {
                    $in: allFollowerIds,
                },
                "newsfeed.post_id": post_id,
            },
            {
                $set: {
                    "newsfeed.$.comment_score": newPopSubScore,
                },
            }
        );
    } else {
        pop_count = data.share_count;
        if (pop_count % 5 !== 0) {
            console.log(`Does not warrant popularity calculation; exiting...`);
            return;
        }
        newPopSubScore = calculateShareScore(data.share_count);
        await User.updateMany(
            {
                user_id: {
                    $in: allFollowerIds,
                },
                "newsfeed.post_id": post_id,
            },
            {
                $set: {
                    "newsfeed.$.share_score": newPopSubScore,
                },
            }
        );
    }

    await recalculateEdgeRankScore({
        method: "updateMany",
        cond: {
            user_id: {
                $in: allFollowerIds,
            },
        },
        check_popularity: true,
    });

    await sortNewsfeed();

    // recalculate score
    // for (followerId of allFollowerIds) {
    //     // update these users' newsfeed item like_score, popularity, edge_weight, edge_rank_score and sort
    //     let updatedUser;

    //     if (type == "like") {
    //         updatedUser = await User.findOneAndUpdate(
    //             {
    //                 user_id: followerId,
    //                 "newsfeed.post_id": post_id,
    //             },
    //             {
    //                 $set: {
    //                     "newsfeed.$.like_score": newPopSubScore,
    //                 },
    //             },
    //             { new: true }
    //         );
    //     } else if (type == "comment") {
    //         updatedUser = await User.findOneAndUpdate(
    //             {
    //                 user_id: followerId,
    //                 "newsfeed.post_id": post_id,
    //             },
    //             {
    //                 $set: {
    //                     "newsfeed.$.comment_score": newPopSubScore,
    //                 },
    //             },
    //             { new: true }
    //         );
    //     } else {
    //         updatedUser = await User.findOneAndUpdate(
    //             {
    //                 user_id: followerId,
    //                 "newsfeed.post_id": post_id,
    //             },
    //             {
    //                 $set: {
    //                     "newsfeed.$.share_score": newPopSubScore,
    //                 },
    //             },
    //             { new: true }
    //         );
    //     }

    //     let matchingNewsfeedEles = updatedUser.newsfeed.filter(
    //         (el) => el.post_id == post_id
    //     );

    //     for (let i = 0; i < matchingNewsfeedEles.length; i++) {
    //         let el = matchingNewsfeedEles[i];
    //         const popChange =
    //             calculatePopularity(
    //                 el.like_score,
    //                 el.comment_score + el.share_score
    //             ) - el.popularity;
    //         el.popularity = calculatePopularity(
    //             el.like_score,
    //             el.comment_score + el.share_score
    //         );
    //         el.edge_weight = el.edge_weight + POP_WEIGHT * popChange;
    //         el.edge_rank_score =
    //             (el.affinity + el.edge_weight) /
    //             el.time_decay_factor /
    //             Math.pow(1.25, el.views);
    //         matchingNewsfeedEles[i] = el;
    //     }
    //     await User.updateOne(
    //         {
    //             user_id: followerId,
    //         },
    //         {
    //             $pull: {
    //                 newsfeed: {
    //                     post_id,
    //                 },
    //             },
    //         }
    //     );
    //     await User.updateOne(
    //         {
    //             user_id: followerId,
    //         },
    //         {
    //             $push: {
    //                 newsfeed: {
    //                     $each: matchingNewsfeedEles,
    //                     $sort: {
    //                         edge_rank_score: -1,
    //                     },
    //                 },
    //             },
    //         }
    //     );
    //     console.log("User's newsfeed popularity update complete");
    // }

    const postEndTime = Date.now();
    console.log(
        `Updating popularity and edge rank score for post #${post_id} took ${
            postEndTime - postBeginTime
        }ms for ${allFollowerIds.length} users (${
            (postEndTime - postBeginTime) / allFollowerIds.length.length
        }ms per user)`
    );
    console.log(
        `Total time elapsed: ${
            Date.now() - beginTime
        }ms\n-----------------------------------------`
    );
};

module.exports = {
    recalcAffinityTable,
    checkPopCount,
    recalcTimeDecayFactor,
};
