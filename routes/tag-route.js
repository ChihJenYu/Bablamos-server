const router = require("express").Router();
const { authentication } = require("../middlewares/auth");
const { asyncErrorHandler } = require("../utils/util");
const { searchTag } = require("../controllers/tag-controller");

router.route("/tag").get([authentication, asyncErrorHandler(searchTag)]);

module.exports = router;
