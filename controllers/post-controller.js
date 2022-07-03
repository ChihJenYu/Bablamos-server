const Post = require("../models/post");
const Feed = require("../models/feed");
const User = require("../models/user");
const newsfeed = require("../apis/newsfeed");
const {
    popularityCalculatorJobQueue,
    notificationDispatcherJobQueue,
} = require("../mq/");
const createPost = async (req, res) => {
    // request body:
    // {
    //     content: "Lorem ipsum",
    //     audience_type_id: 1, // public
    //     audience: undefined,
    //     shared_post_id: undefined,
    //     tags: [{tag_id: 1, tag_name: 'nodejs'}],
    //     mentioned_users: undefined,
    //     photo_count: number
    // }
    const photo_count = req.files ? req.files.length : 0;
    const { id: user_id } = req.user;
    const postData = req.body;
    const newPost = new Post({ ...postData, user_id, photo_count });

    await newPost.save();

    res.status(201).send({ id: newPost.id });

    // fan-out write
    // call NFGS to update all newsfeeds of all followers of this user
    console.log(
        "New post saved in database; Calling newsfeed generation service..."
    );
    const UPDATE_METHOD = "write";

    newsfeed.post(
        `/update?method=${UPDATE_METHOD}&user-id=${user_id}&post-id=${newPost.id}`
    );

    if (newPost.shared_post_id) {
        popularityCalculatorJobQueue.add({
            function: "checkPopCount",
            post_id: "" + newPost.shared_post_id,
            type: "share",
        });

        // publish notification to shared_post_user
        console.log("Calling notification service...");
        notificationDispatcherJobQueue.add({
            function: "pushNotification",
            type: 7,
            post_id: newPost.id,
            shared_post_id: newPost.shared_post_id,
            user_id: newPost.user_id,
        });
        return;
    }

    // publish notification to followers
    console.log("Calling notification service...");
    notificationDispatcherJobQueue.add({
        function: "pushNotification",
        type: 1,
        post_id: newPost.id,
        user_id: newPost.user_id,
    });
};

const editPost = async (req, res) => {
    // request query: post-id
    // request body:
    // {
    //     content: "Lorem ipsum",
    //     audience_type_id: 1, // public
    //     audience: undefined,
    //     shared_post_id: undefined,
    //     tags: [{tag_id: 1, tag_name: 'nodejs'}],
    //     mentioned_users: undefined,
    // }
    const photo_count = req.files ? req.files.length : 0;
    const post_id = req.post_id;
    const { id: user_id } = req.user;
    const postData = req.body;
    const newPost = new Post({
        ...postData,
        user_id,
        id: +post_id,
        photo_count,
    });

    // update the post
    await newPost.save();

    res.status(200).send({ id: newPost.id });

    console.log(
        "Post updated in database; Calling newsfeed generation service..."
    );

    // locate edge in each follower's feed list and replace with the updated edge
    const UPDATE_METHOD = "write";
    newsfeed.patch(
        `/update?method=${UPDATE_METHOD}&user-id=${user_id}&post-id=${+post_id}`
    );
};

const deletePost = async (req, res) => {
    const user_id = req.user.id;
    const post_id = req.post_id;
    const deletedPost = await Post.delete(post_id);

    res.status(200).send({ id: post_id });

    console.log(
        "Post deleted in database; Calling newsfeed generation service..."
    );

    // locate and delete edge in each follower's feed list
    const UPDATE_METHOD = "write";
    newsfeed.delete(
        `/update?method=${UPDATE_METHOD}&user-id=${user_id}&post-id=${post_id}`
    );
    if (deletedPost.shared_post_id) {
        popularityCalculatorJobQueue.add({
            function: "checkPopCount",
            post_id: "" + deletedPost.shared_post_id,
            type: "share",
        });
    }

    console.log("Calling notification service...");
    notificationDispatcherJobQueue.add({
        function: "invalidateNotification",
        type: 1,
        post_id: deletedPost.id,
        user_id: deletedPost.user_id,
    });
};

const getFeedDetail = async (req, res) => {
    const userId = req.user.id;
    const postId = +req.query["post-id"];
    let feedDetail = await Feed.getFeedDetail(postId, userId);
    feedDetail.profile_pic_url = User.generatePictureUrl({
        has_profile: feedDetail.user_profile_pic == 1,
        id: feedDetail.user_id,
    });
    if (feedDetail.shared_post_id) {
        feedDetail.shared_post_data = await Post.getSharedData(
            feedDetail.shared_post_id
        );
    }
    feedDetail.latest_comments = feedDetail.latest_comments.map((c) => {
        return {
            ...c,
            profile_pic_url: User.generatePictureUrl({
                has_profile: c.user_profile_pic == 1,
                id: c.user_id,
            }),
        };
    });
    res.send({ data: feedDetail });
};

module.exports = { createPost, editPost, deletePost, getFeedDetail };
