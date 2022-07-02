const router = require("express").Router();
const { asyncErrorHandler } = require("../utils/util");
const { authentication } = require("../middlewares/auth");
const {
    userSignUp,
    userSignIn,
    getNewsfeed,
    getUserInfo,
    userLikesEdge,
    userBefriends,
    userUnfriends,
    getUserFriends,
    searchUsers,
    userFollows,
    userUnfollows,
    getUserFollowers,
    dropFollowers,
    getUserFollowings,
    readPost,
} = require("../controllers/user-controller");
const { multerMiddleware } = require("../utils/util");

router
    .route("/user/signup")
    .post([multerMiddleware("profile-pic"), asyncErrorHandler(userSignUp)]);

router.route("/user/signin").post(asyncErrorHandler(userSignIn));

router
    .route("/user/newsfeed")
    .get([authentication, asyncErrorHandler(getNewsfeed)]);

router
    .route("/user/info")
    .get([authentication, asyncErrorHandler(getUserInfo)]);

router
    .route("/user/like")
    .post([authentication, asyncErrorHandler(userLikesEdge)])
    .delete([authentication, asyncErrorHandler(userLikesEdge)]);

router
    .route("/user/friend")
    .get([authentication, asyncErrorHandler(getUserFriends)]) // id, status, paging
    .post([authentication, asyncErrorHandler(userBefriends)]) // action, user-id
    .delete([authentication, asyncErrorHandler(userUnfriends)]); // user-id

router.route("/user").get([authentication, asyncErrorHandler(searchUsers)]);

// id (id of user to be followed)
router
    .route("/user/follow")
    .post([authentication, asyncErrorHandler(userFollows)])
    .delete([authentication, asyncErrorHandler(userUnfollows)]);

router.route("/user/following").get(asyncErrorHandler(getUserFollowings)); // id, paging

router
    .route("/user/follower")
    .get(asyncErrorHandler(getUserFollowers)) // id, paging
    .delete([authentication, asyncErrorHandler(dropFollowers)]); // type, req.body: {user_id_to_drop: []}

router.route("/user/read").post([authentication, readPost]);

module.exports = router;
