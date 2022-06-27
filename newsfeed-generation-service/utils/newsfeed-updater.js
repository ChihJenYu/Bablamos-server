const { generateUserAffinityTable } = require("../models");
const User = require("../models/user");

const recalcAffinityTable = async () => {
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
        user = +user; // user_id
        let userAffinityList = [];
        const otherUsers = Object.keys(userAffinityTable[user]);
        for (let otherUser of otherUsers) {
            otherUser = +otherUser;
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
    return `Updating user affinity in Mongo took ${
        Date.now() - affinityTableCompleteTime
    }ms`;
};

module.exports = { recalcAffinityTable };
