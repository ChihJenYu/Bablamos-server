const router = require("express").Router();
const { asyncErrorHandler } = require("../utils/util");
const { authentication } = require("../middlewares/auth");
const multerMiddleware = require("../middlewares/multer");
const {
    userSignUp,
    userSignIn,
    userSignOut,
    editUserProfile,
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
    getUserFollowings,
    readPost,
} = require("../controllers/user-controller");

router.route("/user/signup").post([asyncErrorHandler(userSignUp)]);

router.route("/user/signin").post(asyncErrorHandler(userSignIn));

router
    .route("/user/signout")
    .post([authentication, asyncErrorHandler(userSignOut)]);

router
    .route("/user/newsfeed")
    .get([authentication, asyncErrorHandler(getNewsfeed)]);

router
    .route("/user/info")
    .get([authentication, asyncErrorHandler(getUserInfo)])
    .patch([
        authentication,
        multerMiddleware,
        asyncErrorHandler(editUserProfile),
    ]);

router
    .route("/user/like")
    .post([authentication, asyncErrorHandler(userLikesEdge)])
    .delete([authentication, asyncErrorHandler(userLikesEdge)]);

router
    .route("/user/friend")
    .get([authentication, asyncErrorHandler(getUserFriends)]) // id, status, paging
    .post([authentication, asyncErrorHandler(userBefriends)]) // action, user-id
    .delete([authentication, asyncErrorHandler(userUnfriends)]); // user-id

router
    .route("/user/search")
    .get([authentication, asyncErrorHandler(searchUsers)]);

// id (id of user to be followed)
router
    .route("/user/follow")
    .post([authentication, asyncErrorHandler(userFollows)])
    .delete([authentication, asyncErrorHandler(userUnfollows)]);

router.route("/user/following").get(asyncErrorHandler(getUserFollowings)); // id, paging

router.route("/user/follower").get(asyncErrorHandler(getUserFollowers)); // id, paging

router.route("/user/read").post([authentication, readPost]);

module.exports = router;
