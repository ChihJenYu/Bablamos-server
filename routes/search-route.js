const router = require("express").Router();
const { authentication } = require("../middlewares/auth");
const { asyncErrorHandler } = require("../utils/util");
const { searchTerm } = require("../controllers/search-controller");

router.route("/search").get([authentication, asyncErrorHandler(searchTerm)]);

module.exports = router;
