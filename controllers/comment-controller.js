const Comment = require("../models/comment");
const Post = require("../models/post");
const {
    popularityCalculatorJobQueue,
    notificationDispatcherJobQueue,
} = require("../mq/");
const createComment = async (req, res) => {
    const post_id = req.query["post-id"];
    const user_id = req.user.id;
    // request body:
    // {
    //     content: "lorem ipsum",
    //     level: 1,
    //     replied_comment_id: undefined,
    //     mentioned_users: [1, 2, 3],
    // }
    const photo_count = req.files ? req.files.length : 0;
    const commentData = req.body;
    const newComment = new Comment({
        ...commentData,
        post_id,
        user_id,
        photo_count,
    });
    await newComment.save();
    res.status(201).send({
        id: newComment.id,
        user_id,
        username: req.user.username,
        profile_pic_url: req.user.profile_pic_url,
        photo_count: newComment.photo_count,
        created_at: newComment.created_at,
    });
    popularityCalculatorJobQueue.add({
        function: "checkPopCount",
        post_id: "" + post_id,
        type: "comment",
    });

    // get for_user_id from post_id
    const [{ user_id: for_user_id }] = await Post.find(["user_id"], {
        id: post_id,
    });
    notificationDispatcherJobQueue.add({
        function: "pushNotification",
        type: 2,
        post_id,
        user_id,
        comment_id: newComment.id,
        for_user_id,
    });
    commentData.mentioned_users.forEach((userId) => {
        if (userId === for_user_id) {
            return;
        }
        notificationDispatcherJobQueue.add({
            function: "pushNotification",
            type: 3,
            post_id,
            user_id,
            comment_id: newComment.id,
            for_user_id: userId,
        });
    });
};

const editComment = async (req, res) => {
    const photo_count = req.files.length;
    const comment_id = req.comment_id;
    const user_id = req.user.id;
    // request query: comment-id
    // request body:
    // {
    //     content: "lorem ipsum",
    //     created_at,
    //     mentioned_users: [1, 2, 3],
    // }
    const commentData = req.body;

    const newComment = new Comment({
        ...commentData,
        user_id,
        id: comment_id,
        photo_count,
    });
    await newComment.save();

    res.status(200).send({
        id: newComment.id,
        user_id,
        username: req.user.username,
        profile_pic_url: req.user.profile_pic_url,
        photo_count: newComment.photo_count,
        created_at: newComment.created_at,
    });
};

const deleteComment = async (req, res) => {
    const comment_id = req.comment_id;
    const { post_id } = await Comment.delete(comment_id);
    res.status(200).send({ id: comment_id });
    popularityCalculatorJobQueue.add({
        function: "checkPopCount",
        post_id: "" + post_id,
        type: "comment",
    });
    notificationDispatcherJobQueue.add({
        function: "invalidateNotification",
        type: 2,
        post_id,
        user_id: req.user.id,
        comment_id,
    });
};

module.exports = { createComment, editComment, deleteComment };
