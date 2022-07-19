const Comment = require("../models/comment");
const Post = require("../models/post");
const User = require("../models/user");
const COMMENT_PAGE_SIZE = 3;
const {
    popularityCalculatorJobQueue,
    notificationDispatcherJobQueue,
} = require("../mq/");
const createComment = async (req, res) => {
    const post_id = req.query["post-id"];
    const user_id = req.user.id;
    const photo_count = req.files?.length || 0;
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
};

const getComments = async (req, res) => {
    const post_id = req.query["post-id"];
    const paging = +req.query.paging || 0;
    const user_id = req.user.id;
    const comments = await Comment.getComments({
        post_id,
        paging,
        page_size: COMMENT_PAGE_SIZE,
        user_asking: user_id,
    });

    const commentsToReturn = comments.map((comment) => {
        return {
            ...comment,
            profile_pic_url: User.generatePictureUrl({
                has_profile: comment.user_profile_pic == 1,
                id: comment.user_id,
            }),
        };
    });

    if (comments.length > COMMENT_PAGE_SIZE) {
        const next_paging = paging + 1;
        res.send({
            data: {
                comments: commentsToReturn.slice(0, comments.length - 1),
                next_paging,
            },
        });
        return;
    }
    res.send({ data: { comments: commentsToReturn } });
    return;
};

module.exports = { createComment, editComment, deleteComment, getComments };
