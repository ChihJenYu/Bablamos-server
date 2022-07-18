const router = require("express").Router();
const { asyncErrorHandler } = require("../utils/util");
const { authentication, commentEditAccess } = require("../middlewares/auth");
const {
    createComment,
    editComment,
    deleteComment,
    getComments,
} = require("../controllers/comment-controller");

router
    .route("/comment")
    .get([authentication, asyncErrorHandler(getComments)])
    .post([authentication, asyncErrorHandler(createComment)])
    .patch([authentication, commentEditAccess, asyncErrorHandler(editComment)])
    .delete([
        authentication,
        commentEditAccess,
        asyncErrorHandler(deleteComment),
    ]);

module.exports = router;
