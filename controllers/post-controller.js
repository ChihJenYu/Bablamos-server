const Post = require("../models/post");
const Feed = require("../models/feed");
const UPDATE_METHOD = "write";
const newsfeed = require("../apis/newsfeed");
const { elasticSearchPosts } = require("../apis/search");
const {
    popularityCalculatorJobQueue,
    notificationDispatcherJobQueue,
} = require("../mq/");
const createPost = async (req, res) => {
    const photo_count = req.files?.length || 0;
    const { id: user_id } = req.user;
    const postData = req.body;
    const newPost = new Post({ ...postData, user_id, photo_count });

    await newPost.save();

    res.status(201).send({ id: newPost.id });

    // fan-out write
    // call NFGS to update all newsfeeds of all followers of this user
    newsfeed.post(
        `/update?method=${UPDATE_METHOD}&user-id=${user_id}&post-id=${newPost.id}&created-at=${newPost.created_at}`
    );

    if (newPost.shared_post_id) {
        popularityCalculatorJobQueue.add({
            function: "checkPopCount",
            post_id: "" + newPost.shared_post_id,
            type: "share",
        });

        // publish notification to author of shared post
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
    const photo_count = req.files?.length || 0;
    const { post_id } = req;
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
};

const deletePost = async (req, res) => {
    const { id: user_id } = req.user;
    const { post_id } = req;
    const deletedPost = await Post.delete(post_id);

    res.status(200).send({ id: post_id });

    // locate and delete edge in each follower's feed list
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
        post_id: deletedPost.id,
        user_id: deletedPost.user_id,
    });

    // delete post from elastic search
    console.log("Calling elastic server...");
    try {
        search.delete(`/${ELASTIC_POST_INDEX}/_doc/${deletedPost.id}`);
    } catch (e) {
        console.log(e);
    }
};

const getFeedDetail = async (req, res) => {
    const { id: userId } = req.user;
    const postId = +req.query["post-id"];
    if (isNaN(postId)) {
        res.send({ data: null });
        return;
    }
    let [feedDetail] = await Feed.getFeedsDetail([postId], userId);
    res.send({ data: feedDetail });
};

// /post/search?kw=&paging=
const searchPosts = async (req, res) => {
    const { id: userId } = req.user;
    let { kw, paging } = req.query;
    paging = +paging || 0;
    const postIds = await elasticSearchPosts(kw, paging);
    const resultsToReturn =
        postIds.length === 0 ? [] : await Feed.getFeedsDetail(postIds, userId);

    res.send({ data: resultsToReturn });
};

module.exports = {
    createPost,
    editPost,
    deletePost,
    getFeedDetail,
    searchPosts,
};
