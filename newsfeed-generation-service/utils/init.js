const {
    generateUserAffinityTable,
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
        for (let i = 0; i < allFeeds.length; i++) {
            let feed = allFeeds[i];
            feed.affinity = userAffinityTable[userId][feed.user_id] || 0;
            feed.edge_weight = calculateEdgeWeight(feed, userId);
            feed.time_decay_factor = calculateTimeDecayFactor(feed);
            feed.views = 0;
            feed.edge_rank_score = calcEdgeRankScore(
                feed.affinity,
                feed.edge_weight,
                feed.time_decay_factor,
                feed.views
            );
        }
        const edgeRankCalculationCompleteTime = Date.now();
        console.log(
            `Calculating every newsfeed item's edge rank scores for user #${userId} took ${
                edgeRankCalculationCompleteTime - beginTime
            }ms`
        );
        allFeeds = allFeeds.map((feed) => {
            return {
                post_id: feed.id,
                edge_rank_score: feed.edge_rank_score,
                affinity: feed.affinity,
                edge_weight: feed.edge_weight,
                time_decay_factor: feed.time_decay_factor,
                views: feed.views,
            };
        });
        allFeeds.sort((f1, f2) => f2.edge_rank_score - f1.edge_rank_score);

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
            }ms for ${
                Object.keys(userAffinityTable[userId]).length
            } other-users (${
                (findAffinityEndTime - findAffinityStartTime) /
                Object.keys(userAffinityTable[userId]).length
            }ms per other-user)`
        );
        const insertBeginTime = Date.now();
        const newUser = new User({
            user_id: userId,
            newsfeed: allFeeds,
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
            }\n-----------------------------------------`
        );
    }
};

module.exports = { initialization };
