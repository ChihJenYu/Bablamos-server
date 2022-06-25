const { getUserIds, calcEdgeRankScore } = require("../models");
const Feed = require("../../models/feed");
const redisClient = require("../redis");
const User = require("../models/user");

const initialization = async () => {
    await redisClient.FLUSHDB();
    const newsfeedBulkTable = {};

    let user_ids = await getUserIds({ type: "all" });
    user_ids = user_ids.map((idObj) => idObj.id);
    
    for (let id of user_ids) {
        const beginTime = Date.now();
        if (!newsfeedBulkTable[id.id]) {
            newsfeedBulkTable[id.id] = [];

            console.log(`Querying user id ${id.id}'s news feed items...`);

            let allFeeds = await Feed.findByViewer(id.id);

            for (let feedItem of allFeeds) {
                const feed = new Feed(feedItem);
                // add score attribute to feedItem
                feed.edge_rank_score = await calcEdgeRankScore(feed, id.id);
                // enqueue feedItem to newsfeedBulkTable[id.id]
                newsfeedBulkTable[id.id].push(feed);
            }
            const queryCompleteTime = Date.now();
            console.log(
                `\tQuery complete - time elapsed: ${
                    queryCompleteTime - beginTime
                }ms`
            );
            console.log(`Sorting user id ${id.id}'s news feed items...`);

            // sort newsfeedBulkTable[id.id] by edge_rank_score
            newsfeedBulkTable[id.id].sort(
                (item1, item2) => item2.edge_rank_score - item1.edge_rank_score
            );
            const sortingCompleteTime = Date.now();
            console.log(
                `\tSorting complete - time elapsed: ${
                    sortingCompleteTime - queryCompleteTime
                }ms`
            );
            console.log(
                `Inserting news feed of user id ${id.id} into redis...`
            );
            for (let i = 0; i < newsfeedBulkTable[id.id].length; i++) {
                let feedItem = newsfeedBulkTable[id.id][i];
                await redisClient.RPUSH(
                    JSON.stringify(id.id),
                    JSON.stringify({
                        id: feedItem.id,
                        edge_rank_score: feedItem.edge_rank_score,
                    })
                );
            }
            const endTime = Date.now();
            console.log(
                `\tInsertion complete - time elapsed: ${
                    endTime - sortingCompleteTime
                }ms`
            );
            console.log(`Total time elapsed: ${endTime - beginTime}ms`);
            console.log("-----------------------------");
        }
    }
};

module.exports = { initialization };
