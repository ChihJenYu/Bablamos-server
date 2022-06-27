const {
    getUserIds,
    generateUserAffinityTable,
    calculateEdgeWeight,
} = require("../newsfeed-generation-service/models");
const User = require("../models/user");
const Feed = require("../models/feed");

const recalcAffinityTable = async () => {
    console.log("Begin recalculating user affinity table");
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
            if (!userAffinityTable[userId][otherUserId]) {
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
    console.log(
        `Updating user affinity in Mongo took ${
            Date.now() - affinityTableCompleteTime
        }ms`
    );
};

// if % 10 == 0 then update
const checkLikeCount = async (post_id) => {
    const { user_id, like_count } = await Feed.getPopularity({
        post_id,
        metric: "like",
    });
    if (like_count % 10 !== 0) {
        return;
    }
    // recalculate edge_weight
    const newEdgeWeight = await calculateEdgeWeight()

    let allFollowerIds = await getUserIds({ type: "get_followers", user_id });
    allFollowerIds = allFollowerIds.map((id) => id.id);
    for (followerId of allFollowerIds) {
    }

    // update newsfeed edge_weight of followers of this post's author
};

module.exports = { recalcAffinityTable };
