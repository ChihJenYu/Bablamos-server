const Comment = require("../models/comment");

const createComment = async (req, res) => {
    const post_id = req.query["post-id"];
    const user_id = req.user.id;
    // request body:
    // {
    //     content: "lorem ipsum",
    //     level: 1,
    //     replied_comment_id: undefined
    //     mentioned_users: [1, 2, 3]
    // }
    const commentData = req.body;
    const newComment = new Comment({
        ...commentData,
        post_id,
        user_id,
    });
    await newComment.save();
    res.status(201).send({
        id: newComment.id,
        user_id,
        username: req.user.username,
        profile_pic_url: req.user.profile_pic_url,
        created_at: newComment.created_at,
    });
};

const editComment = async (req, res) => {
    const comment_id = req.comment_id;
    const user_id = req.user.id;
    // request query: comment-id
    // request body:
    // {
    //     content: "lorem ipsum",
    //     created_at
    //     mentioned_users: [1, 2, 3]
    // }
    const commentData = req.body;

    const newComment = new Comment({
        ...commentData,
        user_id,
        id: comment_id,
    });
    await newComment.save();

    res.status(200).send({
        id: newComment.id,
        user_id,
        username: req.user.username,
        profile_pic_url: req.user.profile_pic_url,
        created_at: newComment.created_at,
    });
};

const deleteComment = async (req, res) => {
    const comment_id = req.comment_id;
    await Comment.delete(comment_id);
    res.status(200).send({ id: comment_id });
};

module.exports = { createComment, editComment, deleteComment };
