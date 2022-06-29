const router = require("express").Router();
const { authentication } = require("../middlewares/auth");
const { asyncErrorHandler } = require("../utils/util");
const {
    getNotification,
    getUnreadNotificationCount,
    readNotification,
} = require("../controllers/notification-controller");

router
    .route("/notification")
    .get([authentication, asyncErrorHandler(getNotification)]);

router
    .route("/notification/count")
    .get([authentication, asyncErrorHandler(getUnreadNotificationCount)]);

router
    .route("/notification/read")
    .post([authentication, asyncErrorHandler(readNotification)]);

module.exports = router;
