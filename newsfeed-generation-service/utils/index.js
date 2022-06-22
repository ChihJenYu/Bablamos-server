const {
    getUserIds,
    refreshFeed,
    getLatestComments,
    calculateAffinity,
    calcTimeDecayFactor,
    calculateEdgeWeight,
    calcEdgeRankScore,
} = require("../models");
const { Feed } = require("./feed");
const redisClient = require("../redis");

const initialization = async () => {
    await redisClient.FLUSHDB();
    const newsfeedBulkTable = {};

    const user_ids = await getUserIds({ type: "all" });
    for (let id of user_ids) {
        const beginTime = Date.now();
        if (!newsfeedBulkTable[id.id]) {
            newsfeedBulkTable[id.id] = [];

            console.log(`Querying user id ${id.id}'s news feed items...`);

            const {
                allFeeds,
                feedMentionedUsersTable,
                feedPhotoCountTable,
                feedTagsTable,
            } = await refreshFeed(id.id);

            for (let feedItem of allFeeds) {
                const feed = new Feed(feedItem);
                const latestComments = await getLatestComments(feed.id, 10);

                // AFFINITY
                // const feedItemUserId = feed.user_id;

                // TIME DECAY
                const timeDecayFactor = calcTimeDecayFactor(feed);

                // calculate edge rank score
                const affinity = await calculateAffinity(id.id, feed.user_id);

                const edgeWeight = await calculateEdgeWeight(
                    feedItem,
                    id.id,
                    feedItem.id
                );

                // add score attribute to feedItem
                feed.edge_rank_score = calcEdgeRankScore(
                    affinity,
                    edgeWeight,
                    timeDecayFactor
                );

                // add latest comments, photo_urls and mentioned_users to feedItem
                feed.latest_comments = latestComments || [];
                feed.mentioned_users = feedMentionedUsersTable[feed.id] || [];
                feed.photo_count = feedPhotoCountTable[feed.id] || 0;
                feed.tags = feedTagsTable[feed.id] || [];

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
                    JSON.stringify(feedItem)
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
