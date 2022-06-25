const router = require("express").Router();
const redisClient = require("../redis");
const db = require("../mysql");
const { asyncErrorHandler } = require("../../utils/util");
const {
    getNewsfeed,
    updateNewsfeed,
    recalcNewsfeed,
} = require("../controllers");

router.route("/newsfeed").get(asyncErrorHandler(getNewsfeed));

router
    .route("/newsfeed/update")
    .post(asyncErrorHandler(updateNewsfeed))
    .patch(asyncErrorHandler(updateNewsfeed))
    .delete(asyncErrorHandler(updateNewsfeed));

router.route("/newsfeed/update/recalc").post(asyncErrorHandler(recalcNewsfeed));

module.exports = router;
