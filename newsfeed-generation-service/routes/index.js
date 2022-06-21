const router = require("express").Router();
const redisClient = require("../redis");
const db = require("../mysql");
const { asyncErrorHandler } = require("../../utils/util");
const { getNewsfeed, updateNewsfeed } = require("../controllers");

router.route("/newsfeed").get(asyncErrorHandler(getNewsfeed));

router
    .route("/newsfeed/update")
    .post(asyncErrorHandler(updateNewsfeed))
    .patch(asyncErrorHandler(updateNewsfeed))
    .delete(asyncErrorHandler(updateNewsfeed));

module.exports = router;
