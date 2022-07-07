const router = require("express").Router();
const { authentication } = require("../middlewares/auth");
const { asyncErrorHandler } = require("../utils/util");
const {
    searchTerm,
    searchUser,
    searchPost,
} = require("../controllers/search-controller");

router
    .route("/search/user")
    .get([authentication, asyncErrorHandler(searchUser)]);

router
    .route("/search/post")
    .get([authentication, asyncErrorHandler(searchPost)]);

router.route("/search").get([authentication, asyncErrorHandler(searchTerm)]);

module.exports = router;
