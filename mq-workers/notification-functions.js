require("dotenv").config();
const db = require("../mysql");
const { io } = require("socket.io-client");
const Notification = require("../models/notification");
const socket = io("http://localhost:3003");
const User = require("../models/user");
const Post = require("../models/post");

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

// incoming party's user data
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
            id: user_id,
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
        if (allOnlineFollowers.length > 0) {
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
                    socket.emit("notification_event", {
                        notification_type_id: args.type,
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
        }

        // let allFollowerIds = allFollowers.map((id) => id.id);
        if (allOfflineFollowers.length > 0) {
            await Notification.bulkSave({
                type_id: 1,
                for_user_ids: allOfflineFollowers,
                inv_post_id: post_id,
                inv_user_id: user_id,
            });
        }

        return;
    }
    if (args.type == 2) {
        let { post_id, user_id, comment_id, for_user_id } = args;
        if (user_id === for_user_id) {
            return;
        }
        const { username, profile_pic_url } = await getUserDataFromUserId(
            user_id
        );
        // save notification in db
        const newNotification = new Notification({
            type_id: 2,
            for_user_id,
            inv_post_id: post_id,
            inv_comment_id: comment_id,
            inv_user_id: user_id,
        });

        const notificationId = await newNotification.save();

        // push socket notification
        socket.emit("notification_event", {
            notification_type_id: args.type,
            username,
            inv_user_id: user_id,
            profile_pic_url,
            inv_comment_id: comment_id,
            inv_post_id: post_id,
            for_user_id,
            id: notificationId,
            created_at: Date.now() / 1000,
        });
        return;
    }
    if (args.type == 3) {
        // if for_user_id is author of post_id, don't push
        let { post_id, comment_id, user_id, for_user_id } = args;
        const { username, profile_pic_url } = await getUserDataFromUserId(
            user_id
        );
        const newNotification = new Notification({
            type_id: 3,
            for_user_id,
            inv_post_id: post_id,
            inv_comment_id: comment_id,
            inv_user_id: user_id,
        });
        const notificationId = await newNotification.save();
        socket.emit("notification_event", {
            notification_type_id: args.type,
            username,
            inv_user_id: user_id,
            profile_pic_url,
            for_user_id,
            id: notificationId,
            inv_post_id: post_id,
            inv_comment_id: comment_id,
            created_at: Date.now() / 1000,
        });
        return;
    }
    if (args.type == 4 || args.type == 5 || args.type == 6) {
        let { user_id, for_user_id } = args;
        const { username, profile_pic_url } = await getUserDataFromUserId(
            user_id
        );
        const newNotificationFromOutgoing = new Notification({
            type_id: args.type,
            for_user_id,
            inv_user_id: user_id,
        });

        const notificationIdFromOutgoing =
            await newNotificationFromOutgoing.save();

        // push socket notification
        socket.emit("notification_event", {
            notification_type_id: args.type,
            username,
            inv_user_id: user_id,
            profile_pic_url,
            for_user_id,
            id: notificationIdFromOutgoing,
            created_at: Date.now() / 1000,
        });

        // acceptor also receives notification
        if (args.type == 6) {
            const newNotificationForOutgoing = new Notification({
                type_id: args.type,
                for_user_id: user_id,
                inv_user_id: for_user_id,
            });
            const notificationIdForOutgoing =
                await newNotificationForOutgoing.save();
            socket.emit("notification_event", {
                notification_type_id: args.type,
                username,
                inv_user_id: for_user_id,
                profile_pic_url,
                for_user_id: user_id,
                id: notificationIdForOutgoing,
                created_at: Date.now() / 1000,
            });
        }

        return;
    }
    if (args.type == 7) {
        let { post_id, user_id, shared_post_id } = args;
        const [sharedUserPacket] = await Post.find(["user_id"], {
            id: shared_post_id,
        });
        const sharedUserId = sharedUserPacket.user_id;
        const { username, profile_pic_url } = await getUserDataFromUserId(
            user_id
        );
        const newNotification = new Notification({
            type_id: 7,
            for_user_id: sharedUserId,
            inv_post_id: post_id,
            inv_user_id: user_id,
        });
        const notificationId = await newNotification.save();
        socket.emit("notification_event", {
            notification_type_id: args.type,
            username,
            inv_user_id: user_id,
            profile_pic_url,
            for_user_id: sharedUserId,
            id: notificationId,
            inv_post_id: post_id,
            created_at: Date.now() / 1000,
        });
        return;
    }
};

const invalidateNotification = async (args) => {
    if (args.post_id === 1) {
        let { post_id } = args;
        await Notification.bulkDelete({
            inv_post_id: post_id,
        });
        return;
    }
    if (args.type === 4) {
        // user unfollows
        const { user_id, for_user_id } = args;
        await Notification.bulkDelete({
            for_user_id,
            inv_user_id: user_id,
            type_id: args.type,
        });
    }
    if (args.type === 5) {
        // user unfriends; actual notification type id could be 5 or 6
        const { user_id, for_user_id } = args;
        // notificationsToDelete: [{id, for_user_id}]
        await Notification.bulkDelete({
            for_user_id,
            inv_user_id: user_id,
            type_id: 5,
        });
        await Notification.bulkDelete({
            for_user_id: user_id,
            inv_user_id: for_user_id,
            type_id: 5,
        });
        await Notification.bulkDelete({
            for_user_id,
            inv_user_id: user_id,
            type_id: 6,
        });
        await Notification.bulkDelete({
            for_user_id: user_id,
            inv_user_id: for_user_id,
            type_id: 6,
        });
    }
};

const clearNotifications = async () => {
    await Notification.bulkDelete({ read_by_user: 1 });
};

module.exports = {
    pushNotification,
    invalidateNotification,
    clearNotifications,
};
