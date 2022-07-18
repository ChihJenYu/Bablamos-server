const router = require("express").Router();
const { authentication, postEditAccess } = require("../middlewares/auth");
const { asyncErrorHandler } = require("../utils/util");
const {
    createPost,
    editPost,
    deletePost,
    getFeedDetail,
    searchPosts,
} = require("../controllers/post-controller");

router
    .route("/post")
    .get([authentication, asyncErrorHandler(getFeedDetail)])
    .post([authentication, asyncErrorHandler(createPost)])
    .patch([authentication, postEditAccess, asyncErrorHandler(editPost)])
    .delete([authentication, postEditAccess, asyncErrorHandler(deletePost)]);

router
    .route("/post/search")
    .get([authentication, asyncErrorHandler(searchPosts)]);

module.exports = router;
