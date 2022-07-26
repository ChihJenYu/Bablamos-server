const Notification = require("../models/notification");

const getNotification = async (req, res) => {
    const { id: user_id } = req.user;
    const paging = +req.query.paging || 0;
    const notifications = await Notification.find({
        user_id,
        paging,
    });
    res.send({ data: notifications });
};

const getUnreadNotificationCount = async (req, res) => {
    const unread_count = await Notification.getUnreadCount(req.user.id);
    res.send({ unread_count });
};

const readNotification = async (req, res) => {
    const { id: user_id } = req.user;
    const { id: notification_id } = req.query;
    await Notification.read({ user_id, notification_id });
    res.sendStatus(200);
};

module.exports = {
    getNotification,
    getUnreadNotificationCount,
    readNotification,
};
