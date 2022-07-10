const {
    generateUserAffinityTable,
    calculateLikeScore,
    calculateCommentScore,
    calculateShareScore,
    calculatePopularity,
    calculateTimeDecayFactor,
    calcEdgeRankScore,
} = require("../models");
const Feed = require("../../models/feed");
const User = require("../models/user");
const redisClient = require("../redis");

const initialization = async () => {
    const beginTime = Date.now();
    console.log("Clearing database content...");
    await User.deleteMany({});
    console.log(`Clearing database took ${Date.now() - beginTime}ms`);

    const affinityTableStartTime = Date.now();
    console.log("Fetching user affinity table...");
    const userAffinityTable = await generateUserAffinityTable();
    const affinityTableCompleteTime = Date.now();
    console.log(
        `Generating user affinity table took ${
            affinityTableCompleteTime - affinityTableStartTime
        }ms`
    );

    const userIds = Object.keys(userAffinityTable);
    for (let userId of userIds) {
        const beginTime = Date.now();
        userId = +userId;
        let allFeeds = await Feed.findByViewer(userId);
        let feedsToInsert = [];
        for (let i = 0; i < allFeeds.length; i++) {
            let feed = allFeeds[i];
            let feedToInsert = {};
            feedToInsert.post_id = feed.id;
            feedToInsert.user_id = feed.user_id;
            feedToInsert.affinity =
                userAffinityTable[userId][feed.user_id] || 0;
            feedToInsert.like_score = calculateLikeScore(feed.like_count);
            feedToInsert.comment_score = calculateCommentScore(
                feed.comment_count
            );
            feedToInsert.share_score = calculateShareScore(feed.share_count);
            feedToInsert.popularity = calculatePopularity(
                feedToInsert.like_score,
                feedToInsert.comment_score,
                feedToInsert.share_score
            );
            feedToInsert.created_at = feed.created_at;
            feedToInsert.time_decay_factor = calculateTimeDecayFactor(feed);
            feedToInsert.views = 0;
            feedToInsert.edge_rank_score = calcEdgeRankScore(
                feedToInsert.affinity,
                feedToInsert.popularity,
                feedToInsert.time_decay_factor,
                feedToInsert.views
            );

            feedsToInsert.push(feedToInsert);
        }
        const edgeRankCalculationCompleteTime = Date.now();
        console.log(
            `Calculating every newsfeed item's edge rank scores for user #${userId} took ${
                edgeRankCalculationCompleteTime - beginTime
            }ms`
        );
        feedsToInsert.sort((f1, f2) => f2.edge_rank_score - f1.edge_rank_score);

        // user's affinity with other users
        let affinityList = [];
        const findAffinityStartTime = Date.now();
        for (let otherUserId of Object.keys(userAffinityTable[userId])) {
            otherUserId = +otherUserId;
            if (!userAffinityTable[userId][otherUserId]) {
                continue;
            }
            affinityList.push({
                user_id: otherUserId,
                affinity: userAffinityTable[userId][otherUserId],
            });
        }
        const findAffinityEndTime = Date.now();
        console.log(
            `Finding affinity list took ${
                findAffinityEndTime - findAffinityStartTime
            }ms for ${Object.keys(userAffinityTable[userId]).length} users (${
                (findAffinityEndTime - findAffinityStartTime) /
                Object.keys(userAffinityTable[userId]).length
            }ms per user)`
        );

        // other user's affinity with user
        let affinityWithSelfList = [];
        const findAffinityWithSelfStartTime = Date.now();
        for (let otherUserId of userIds) {
            otherUserId = +otherUserId;
            if (!userAffinityTable[otherUserId][userId]) {
                continue;
            }
            affinityWithSelfList.push({
                user_id: otherUserId,
                affinity_with_self: userAffinityTable[otherUserId][userId],
            });
        }
        const findAffinityWithSelfEndTime = Date.now();
        console.log(
            `Finding affinity_with_self list took ${
                findAffinityWithSelfEndTime - findAffinityWithSelfStartTime
            }ms for ${affinityWithSelfList.length} users (${
                (findAffinityWithSelfEndTime - findAffinityWithSelfStartTime) /
                affinityWithSelfList.length
            }ms per user)`
        );
        const insertBeginTime = Date.now();
        const newUser = new User({
            user_id: userId,
            newsfeed: feedsToInsert,
            affinity: affinityList,
            affinity_with_self: affinityWithSelfList,
        });
        await newUser.save();
        const insertCompleteTime = Date.now();
        console.log(
            `Inserting user into MongoDB took ${
                insertCompleteTime - insertBeginTime
            }ms`
        );

        // const redisInsertBeginTime = Date.now();
        // for (let otherUser of affinityWithSelfList) {
        //     await redisClient.HSET(`affinity_with_self_user_${userId}`, "" + otherUser.user_id, "" + otherUser.affinity_with_self)
        // }
        // const redisInsertCompleteTime = Date.now();
        // console.log(
        //     `Inserting user's affinity_with_self dictionary into redis took ${
        //         redisInsertCompleteTime - redisInsertBeginTime
        //     }ms`
        // );

        console.log(
            `Total time elapsed: ${
                Date.now() - beginTime
            }ms\n-----------------------------------------`
        );
    }
};

module.exports = { initialization };
