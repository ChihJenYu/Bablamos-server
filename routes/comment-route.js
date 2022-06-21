const router = require("express").Router();
const { asyncErrorHandler } = require("../utils/util");
const { authentication, commentEditAccess } = require("../middlewares/auth");
const {
    createComment,
    editComment,
    deleteComment,
} = require("../controllers/comment-controller");

router
    .route("/comment")
    .post([authentication, asyncErrorHandler(createComment)])
    .patch([authentication, commentEditAccess, asyncErrorHandler(editComment)])
    .delete([
        authentication,
        commentEditAccess,
        asyncErrorHandler(deleteComment),
    ]);

module.exports = router;
