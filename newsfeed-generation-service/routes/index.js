const router = require("express").Router();
const redisClient = require("../redis");
const { asyncErrorHandler } = require("../../utils/util");
const {
    createUser,
    removeUserFromNewsfeed,
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

router.route("/newsfeed/user").post(asyncErrorHandler(createUser));

router
    .route("/newsfeed/user/unfriend")
    .post(asyncErrorHandler(removeUserFromNewsfeed));

module.exports = router;
