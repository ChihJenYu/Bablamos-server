const redisClient = require("../redis");
const Feed = require("../../models/feed");
const { getUserIds, calcEdgeRankScore } = require("../models");
const NEWSFEED_PER_PAGE_FOR_WEB_SERVER = 100;

const getNewsfeed = async (req, res) => {
    const whichPage = req.query.at;
    const userId = +req.query["user-id"];
    const paging = +req.query.paging;
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
    const userId = +req.query["user-id"];
    const httpMethod = req.method;
    const newFeed = new Feed(req.body);

    if (method === "write") {
        // [{id: 1}, {id: 2}, ...]
        const followerIds = await getUserIds({
            type: "get_followers",
            user_id: userId,
        });

        // done
        if (httpMethod === "POST") {
            console.log(
                "New feed to insert into followers' news feed: ",
                newFeed
            );

            // for each follower
            for (let i = 0; i < followerIds.length; i++) {
                const followerId = followerIds[i].id;
                await redisClient.LPUSH(
                    "" + followerId,
                    JSON.stringify({
                        id: newFeed.id,
                        edge_rank_score: 0,
                        is_new: 1,
                    })
                );
            }
            console.log(`Push of post #${newFeed.id} to followers complete.`);
        }
        // needs fixing
        else if (httpMethod === "PATCH") {
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
        }
        // needs fixing
        else if (httpMethod === "DELETE") {
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

// needs a 'find index by key in array of object' function
const recalcNewsfeed = async (req, res) => {
    const postId = +req.query["post-id"];
    const userId = +req.query["user-id"];

    const result = await redisClient.LREM(
        "" + userId,
        0,
        JSON.stringify({
            id: postId,
            edge_rank_score: 0,
            is_new: 1,
        })
    );

    // feed is already not new; do nothing
    if (result !== 1) {
        res.sendStatus(200);
        return;
    }

    const targetFeed = await Feed.getFeedDetail(postId);
    const edgeRankScore = await calcEdgeRankScore(targetFeed, userId);
    let userNewsfeed = await redisClient.LRANGE("" + userId, 0, -1);
    userNewsfeed = userNewsfeed.map((nf) => JSON.parse(nf));

    // get the index where the recalculated feed should be
    userNewsfeed.push({
        id: postId,
        edge_rank_score: edgeRankScore,
    });

    const shouldBeAtIdx = userNewsfeed
        .sort((feed1, feed2) => {
            return feed2.edge_rank_score - feed1.edge_rank_score;
        })
        .map((obj) => {
            return obj.id;
        })
        .indexOf(postId);

    console.log("Recalculated feed should be at index ", shouldBeAtIdx);

    await redisClient.LSET(
        "" + userId,
        shouldBeAtIdx,
        JSON.stringify({ id: postId, edge_rank_score: edgeRankScore })
    );

    console.log(
        `Recalculation of post #${postId} for user #${userId} complete`
    );

    res.sendStatus(200);
};

module.exports = { getNewsfeed, updateNewsfeed, recalcNewsfeed };
