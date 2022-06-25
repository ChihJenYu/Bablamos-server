const { generateUserAffinityTable, calcEdgeRankScore } = require("../models");
const Feed = require("../../models/feed");
const User = require("../models/user");

const initialization = async () => {
    const beginTime = Date.now();
    const userAffinityTable = await generateUserAffinityTable();
    const affinityTableCompleteTime = Date.now();
    console.log(
        `Generating user affinity table took ${
            affinityTableCompleteTime - beginTime
        }ms`
    );
    const userIds = Object.keys(userAffinityTable);
    for (let userId of userIds) {
        const beginTime = Date.now();
        userId = +userId;
        let allFeeds = await Feed.findByViewer(userId);
        for (let i = 0; i < allFeeds.length; i++) {
            allFeeds[i].edge_rank_score = await calcEdgeRankScore({
                affinity: userAffinityTable[userId][allFeeds[i].user_id] || 0,
                feed: allFeeds[i],
                my_user_id: userId,
                views: 0,
            });
        }
        const edgeRankCalculationCompleteTime = Date.now();
        console.log(
            `Calculating user's newsfeed edge rank scores took ${
                edgeRankCalculationCompleteTime - beginTime
            }ms`
        );
        allFeeds = allFeeds.map((feed) => {
            return {
                post_id: feed.id,
                edge_rank_score: feed.edge_rank_score,
            };
        });
        allFeeds.sort((f1, f2) => f2.edge_rank_score - f1.edge_rank_score);

        // user's affinity with other users
        let affinityList = [];
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
        console.log("-----------------------------------------");
    }
};

module.exports = { initialization };
