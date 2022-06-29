require("dotenv").config();
const db = require("../mysql");
const { io } = require("socket.io-client");
const Notification = require("../models/notification");
const socket = io("http://localhost:3003");
const User = require("../models/user");

const getFollowerOnlineStatus = async (user_id) => {
    const [result] = await db.pool.query(
        `SELECT DISTINCT f.user_id as id,
        case when ou.socket_id is null then 0 else 1 end as 'is_online'
        FROM friendship f
        left join online_user ou
        on f.user_id = ou.user_id
        WHERE f.friend_userid = ? AND f.status = "accepted"
        `,
        user_id
    );
    return result;
};

const getUserDataFromUserId = async (user_id) => {
    const [result] = await db.pool.query(
        `SELECT username, user_profile_pic FROM user WHERE id = ?
        `,
        [user_id]
    );
    return {
        username: result[0].username,
        profile_pic_url: User.generatePictureUrl({
            has_profile: result[0].user_profile_pic == 1,
            uid: user_id,
        }),
    };
};

const pushNotification = async (args) => {
    if (args.type == 1) {
        let { post_id, user_id } = args;
        const { username, profile_pic_url } = await getUserDataFromUserId(
            user_id
        );
        let allFollowers = await getFollowerOnlineStatus(user_id);
        let allOnlineFollowers = [];
        let allOfflineFollowers = [];
        for (follower of allFollowers) {
            if (follower.is_online == 1) {
                allOnlineFollowers.push(follower.id);
            } else {
                allOfflineFollowers.push(follower.id);
            }
        }

        const firstNotificationId = await Notification.bulkSave({
            type_id: 1,
            for_user_ids: allOnlineFollowers,
            inv_post_id: post_id,
            inv_user_id: user_id,
        });

        if (firstNotificationId) {
            allOnlineFollowers = allOnlineFollowers.map((el, index) => {
                return {
                    id: el,
                    notification_id: index + firstNotificationId,
                };
            });

            allOnlineFollowers.forEach((el) => {
                socket.emit("type_1_notification_event", {
                    username,
                    inv_user_id: user_id,
                    profile_pic_url,
                    inv_post_id: post_id,
                    for_user_id: el.id,
                    id: el.notification_id,
                    created_at: Date.now() / 1000,
                });
            });
        }

        // let allFollowerIds = allFollowers.map((id) => id.id);
        await Notification.bulkSave({
            type_id: 1,
            for_user_ids: allOfflineFollowers,
            inv_post_id: post_id,
            inv_user_id: user_id,
        });
    }
};

module.exports = { pushNotification };
