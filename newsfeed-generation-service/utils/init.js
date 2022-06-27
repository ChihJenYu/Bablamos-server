const {
    generateUserAffinityTable,
    calculateLikeScore,
    calculateCommentScore,
    calculateShareScore,
    calculatePopularity,
    calculateEdgeWeight,
    calculateTimeDecayFactor,
    calcEdgeRankScore,
} = require("../models");
const Feed = require("../../models/feed");
const User = require("../models/user");

const initialization = async () => {
    const beginTime = Date.now();
    console.log("Clearing database content...");
    await User.deleteMany({});
    console.log(`Clearing database took ${Date.now() - beginTime}ms`);

    const affinityTableStartTime = Date.now();
    console.log("Fetching user affinity table...");
    // const userAffinityTable = await generateUserAffinityTable();
    const userAffinityTable = { 1: { 2: 3, 3: 4 } };
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
            feedToInsert.affinity =
                userAffinityTable[userId][feed.user_id] || 0;
            feedToInsert.edge_weight = await calculateEdgeWeight(feed, userId);
            feedToInsert.like_score = calculateLikeScore(feed.like_count);
            feedToInsert.comment_score = calculateCommentScore(
                feed.comment_count
            );
            feedToInsert.share_score = calculateShareScore(feed.share_count);
            feedToInsert.popularity = calculatePopularity(
                feed.like_score,
                feed.comment_score,
                feed.share_score
            );
            feedToInsert.time_decay_factor = calculateTimeDecayFactor(feed);
            feedToInsert.views = 0;
            feedToInsert.edge_rank_score = calcEdgeRankScore(
                feed.affinity,
                feed.edge_weight,
                feed.time_decay_factor,
                feed.views
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
        const insertBeginTime = Date.now();
        const newUser = new User({
            user_id: userId,
            newsfeed: feedsToInsert,
            affinity: affinityList,
        });
        await newUser.save();
        const insertCompleteTime = Date.now();
        console.log(
            `Inserting user into MongoDB took ${
                insertCompleteTime - insertBeginTime
            }ms`
        );
        console.log(
            `Total time elapsed: ${
                insertCompleteTime - beginTime
            }ms\n-----------------------------------------`
        );
    }
};

module.exports = { initialization };
