const User = require("../models/user");
const Post = require("../models/post");
const Comment = require("../models/comment");

const authentication = async (req, res, next) => {
    let accessToken = req.get("Authorization");
    if (!accessToken) {
        res.status(401).send({ error: "Unauthorized" });
        return;
    }

    accessToken = accessToken.replace("Bearer ", "");
    if (accessToken == "null") {
        res.status(401).send({ error: "Unauthorized" });
        return;
    }

    try {
        const user = await User.validateAuthToken(accessToken);
        req.user = user;
        return next();
    } catch (err) {
        res.status(403).send({ error: "Forbidden" });
        return;
    }
};

const postEditAccess = async (req, res, next) => {
    const postId = +req.query["post-id"];
    if (!postId) {
        res.status(400).send({ error: "Wrong request" });
    }
    req.post_id = postId;

    const postPacket = await Post.find(["user_id"], { id: postId });

    if (postPacket.length == 0) {
        return res.status(400).send({ error: "Wrong request" });
    } else {
        let { user_id: authorId } = postPacket[0];
        if (authorId == req.user.id) {
            next();
        } else {
            res.status(403).send({ error: "Forbidden" });
        }
    }
};

const commentEditAccess = async (req, res, next) => {
    const commentId = +req.query["comment-id"];
    if (!commentId) {
        res.status(400).send({ error: "Wrong request" });
    }
    req.comment_id = commentId;

    const commentPacket = await Comment.find(["user_id"], { id: commentId });

    if (commentPacket.length == 0) {
        return res.status(400).send({ error: "Wrong request" });
    } else {
        let { user_id: authorId } = commentPacket[0];
        if (authorId == req.user.id) {
            next();
        } else {
            res.status(403).send({ error: "Forbidden" });
        }
    }
};

module.exports = { authentication, postEditAccess, commentEditAccess };
