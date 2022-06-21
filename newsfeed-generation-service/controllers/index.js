const redisClient = require("../redis");
const { Feed } = require("../utils/feed");
const {
    getUserIds,
    calculateAffinity,
    calculateEdgeWeight,
    calcTimeDecayFactor,
    calcEdgeRankScore,
} = require("../models");
const NEWSFEED_PER_PAGE_FOR_WEB_SERVER = 100;

const getNewsfeed = async (req, res) => {
    const whichPage = req.query.at;
    const userId = req.query["user-id"];
    const paging = req.query.paging;
    const newsfeed = await redisClient.LRANGE(
        "" + userId,
        NEWSFEED_PER_PAGE_FOR_WEB_SERVER * paging, // starting index
        NEWSFEED_PER_PAGE_FOR_WEB_SERVER * paging +
            NEWSFEED_PER_PAGE_FOR_WEB_SERVER -
            1 // ending index (incl.)
    );
    const newsfeedParsed = newsfeed.map((feed) => JSON.parse(feed));
    res.send({ data: newsfeedParsed });
};

const updateNewsfeed = async (req, res) => {
    const method = req.query.method;
    const userId = req.query["user-id"];
    const httpMethod = req.method;
    const newFeed = new Feed(req.body);

    if (method === "write") {
        // [{id: 1}, {id: 2}, ...]
        const followerIds = await getUserIds({
            type: "get_followers",
            user_id: userId,
        });

        if (httpMethod === "POST") {
            console.log(
                "New feed to insert into followers' news feed: ",
                newFeed
            );

            // calculate time decay factor of the new feed
            // const timeDecayFactor = calcTimeDecayFactor(newFeed);

            // for each follower
            for (let i = 0; i < followerIds.length; i++) {
                const followerId = followerIds[i].id;
                await redisClient.LPUSH("" + followerId, JSON.stringify(newFeed));
                // calculate edge rank score of the new feed for each follower
                // const affinity = await calculateAffinity(followerId, userId);
                // const edgeWeight = await calculateEdgeWeight(
                //     newFeed,
                //     followerId,
                //     newFeed.id
                // );
                // const edgeRankScore = calcEdgeRankScore(
                //     affinity,
                //     edgeWeight,
                //     timeDecayFactor
                // );
                // newFeed.edge_rank_score = edgeRankScore;
                // const followerNewsfeed = await redisClient.LRANGE(
                //     "" + followerId,
                //     0,
                //     -1
                // );

                // let followerNewsfeedParsed = followerNewsfeed.map((feed) =>
                //     JSON.parse(feed)
                // );
                // followerNewsfeedParsed.push(newFeed);
                // followerNewsfeedParsed.sort(
                //     (item1, item2) =>
                //         item2.edge_rank_score - item1.edge_rank_score
                // );
                // await redisClient.DEL("" + followerId);
                // for (let i = 0; i < followerNewsfeedParsed.length; i++) {
                //     await redisClient.RPUSH(
                //         "" + followerId,
                //         JSON.stringify(followerNewsfeedParsed[i])
                //     );
                // }
            }
            console.log("Cache ready.");
        } else if (httpMethod === "PATCH") {
            for (let i = 0; i < followerIds.length; i++) {
                const followerId = followerIds[i].id;
                const followerNewsfeed = await redisClient.LRANGE(
                    "" + followerId,
                    0,
                    -1
                );
                let followerNewsfeedParsed = followerNewsfeed.map((feed) =>
                    JSON.parse(feed)
                );
                const positionOfFeedToUpdate = followerNewsfeedParsed
                    .map((el) => el.id)
                    .indexOf(newFeed.id);
                followerNewsfeedParsed[positionOfFeedToUpdate] = newFeed;
                await redisClient.LSET(
                    "" + followerId,
                    positionOfFeedToUpdate,
                    JSON.stringify(newFeed)
                );
            }
            console.log("Cache ready.");
        } else if (httpMethod === "DELETE") {
            for (let i = 0; i < followerIds.length; i++) {
                const followerId = followerIds[i].id;
                await redisClient.LREM(
                    "" + followerId,
                    0,
                    JSON.stringify(newFeed)
                );
            }
            console.log("Cache ready.");
        }
    }
    res.sendStatus(200);
};

module.exports = { getNewsfeed, updateNewsfeed };
