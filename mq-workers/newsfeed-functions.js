const {
    getUserIds,
    generateUserAffinityTable,
    calculateLikeScore,
    calculateCommentScore,
    calculateShareScore,
} = require("../newsfeed-generation-service/models");
require("../newsfeed-generation-service/mongoose");
const {
    POP_LIKE_WEIGHT,
    POP_SHARE_WEIGHT,
    POP_COMMENT_WEIGHT,
    ONE_HOUR_TIME_DECAY,
    SIX_HOUR_TIME_DECAY,
    ONE_DAY_TIME_DECAY,
    DAYS_BASE,
    ALREADY_SEEN_BASE,
} = process.env;
const User = require("../newsfeed-generation-service/models/user");
const Feed = require("../models/feed");
const Post = require("../models/post");

// update pipelines
const updatePopularity = {
    $set: {
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
                                        $multiply: [
                                            +POP_LIKE_WEIGHT,
                                            "$$n.like_score",
                                        ],
                                    },
                                    {
                                        $multiply: [
                                            +POP_COMMENT_WEIGHT,
                                            "$$n.comment_score",
                                        ],
                                    },
                                    {
                                        $multiply: [
                                            +POP_SHARE_WEIGHT,
                                            "$$n.share_score",
                                        ],
                                    },
                                    "$$n.fresh_pop_buff",
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
    $set: {
        newsfeed: {
            $map: {
                input: "$newsfeed",
                as: "n",
                in: {
                    $mergeObjects: [
                        "$$n",
                        {
                            edge_rank_score: {
                                $divide: [
                                    {
                                        $divide: [
                                            {
                                                $multiply: [
                                                    {
                                                        $sum: [
                                                            "$$n.affinity",
                                                            1,
                                                        ],
                                                    },
                                                    "$$n.popularity",
                                                ],
                                            },
                                            "$$n.time_decay_factor",
                                        ],
                                    },
                                    {
                                        $pow: [+ALREADY_SEEN_BASE, "$$n.views"],
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

// type: ["updateOne", "updateMany"]
// cond: { user_id: 2 }
// pipelines: [{ $set: ... }, { ... }]
const recalculateEdgeRankScore = async ({ method, cond, pipelines }) => {
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
    // { "1": affinity_list, "2": affinity_list, ... }
    let batchUserAffinity = {};
    const bulkWrites = [];
    for (let i = 0; i < allUsers.length; i++) {
        user = +allUsers[i];
        // get affinity in batches of 10 users
        if (i % 10 === 0) {
            batchUserAffinity = {};
            const userIdRange = [];
            for (let j = i; j < Math.min(i + 10, allUsers.length); j++) {
                userIdRange.push(+allUsers[j]);
            }
            const batchAffinities = await User.find(
                {
                    user_id: {
                        $in: userIdRange,
                    },
                },
                {
                    user_id: 1,
                    affinity: 1,
                    _id: 0,
                }
            );
            for (let j = 0; j < batchAffinities.length; j++) {
                batchUserAffinity[batchAffinities[j].user_id] =
                    batchAffinities[j].affinity;
            }
        }
        let userAffinityList = [];
        const otherUsers = Object.keys(userAffinityTable[user]);
        for (let otherUser of otherUsers) {
            otherUser = +otherUser;
            const oldAffinityWithUser = batchUserAffinity[user]
                ? batchUserAffinity[user].find((el) => el.user_id === otherUser)
                : null;
            if (
                // old affinity is null but new one is not
                (!oldAffinityWithUser && userAffinityTable[user][otherUser]) ||
                // old affinity and new affinity differs
                (oldAffinityWithUser &&
                    oldAffinityWithUser.affinity !==
                        userAffinityTable[user][otherUser])
            ) {
                bulkWrites.push({
                    updateOne: {
                        filter: {
                            user_id: user,
                        },
                        update: {
                            $set: {
                                "newsfeed.$[el].affinity":
                                    userAffinityTable[user][otherUser] || 0,
                            },
                        },
                        arrayFilters: [
                            {
                                "el.user_id": otherUser,
                            },
                        ],
                    },
                });
            }

            if (!userAffinityTable[user][otherUser]) {
                continue;
            }
            userAffinityList.push({
                user_id: otherUser,
                affinity: userAffinityTable[user][otherUser],
            });
        }
        let userAffinityWithSelfList = [];
        for (let otherUser of allUsers) {
            otherUser = +otherUser;
            if (!userAffinityTable[otherUser][user]) {
                continue;
            }
            userAffinityWithSelfList.push({
                user_id: otherUser,
                affinity_with_self: userAffinityTable[otherUser][user],
            });
        }
        bulkWrites.push({
            updateOne: {
                filter: {
                    user_id: user,
                },
                update: {
                    $set: {
                        affinity: userAffinityList,
                        affinity_with_self: userAffinityWithSelfList,
                    },
                },
            },
        });
    }
    console.log("bulkWrite job size: ", bulkWrites.length);
    await User.bulkWrite(bulkWrites);
    await recalculateEdgeRankScore({
        method: "updateMany",
        cond: {},
        pipelines: [updateEdgeRankScore],
    });
    await sortNewsfeed();
    const completeTime = Date.now();
    console.log(
        `Updating user affinity in Mongo took ${
            completeTime - affinityTableCompleteTime
        }ms for ${Object.keys(userAffinityTable).length} users (${
            (completeTime - affinityTableCompleteTime) /
            Object.keys(userAffinityTable).length
        }ms per user)\n-----------------------------------------`
    );
};

// type 1 (per 5m) & 2 (per 24 hour)
const recalcTimeDecayFactor = async ({ type }) => {
    const beginTime = Date.now();
    console.log("Begin job: recalculating time decay factor");
    let updates;
    if (type === 1) {
        const updateOneHour = User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": +ONE_HOUR_TIME_DECAY,
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
        const updateSixHours = User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": +SIX_HOUR_TIME_DECAY,
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
        const updateTwentyFourHours = User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": +ONE_DAY_TIME_DECAY,
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
        const updateOneDay = User.updateMany(
            {},
            {
                $set: {
                    "newsfeed.$[el].time_decay_factor": +DAYS_BASE,
                },
            },
            {
                arrayFilters: [
                    {
                        "el.created_at": {
                            $lte: Date.now() / 1000 - 60 * 60 * 24,
                        },
                        "el.time_decay_factor": {
                            $lt: +DAYS_BASE,
                        },
                    },
                ],
            }
        );
        updates = [
            updateOneHour,
            updateSixHours,
            updateTwentyFourHours,
            updateOneDay,
        ];
    } else {
        updates = [
            User.updateMany(
                {},
                {
                    $mul: {
                        "newsfeed.$[el].time_decay_factor": +DAYS_BASE,
                    },
                },
                {
                    arrayFilters: [
                        {
                            "el.created_at": {
                                $lte: Date.now() / 1000 - 60 * 60 * 24,
                            },
                            "el.time_decay_factor": {
                                $gte: +DAYS_BASE,
                            },
                        },
                    ],
                }
            ),
        ];
    }
    Promise.allSettled(updates)
        .then(() =>
            recalculateEdgeRankScore({
                method: "updateMany",
                cond: {},
                pipelines: [updateEdgeRankScore],
            })
        )
        .then(() => sortNewsfeed())
        .then(() =>
            console.log(
                `Total time elapsed: ${
                    Date.now() - beginTime
                }ms\n-----------------------------------------`
            )
        );
    // await recalculateEdgeRankScore({
    //     method: "updateMany",
    //     cond: {},
    //     pipelines: [updateEdgeRankScore],
    // });
    // await sortNewsfeed();
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
        if (pop_count % 10 !== 0 || pop_count === 0) {
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
        if (pop_count % 7 !== 0 || pop_count === 0) {
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
        if (pop_count % 5 !== 0 || pop_count === 0) {
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
        pipelines: [updatePopularity, updateEdgeRankScore],
    });

    await sortNewsfeed();

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
