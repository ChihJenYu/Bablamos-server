const Post = require("../models/post");
const Feed = require("../models/feed");
const User = require("../models/user");
const { ELASTIC_POST_INDEX } = process.env;
const SEARCH_POST_PAGE_SIZE = 8;
const newsfeed = require("../apis/newsfeed");
const search = require("../apis/search");
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
        `/update?method=${UPDATE_METHOD}&user-id=${user_id}&post-id=${
            newPost.id
        }&created-at=${newPost.created_at}&edge-type=${
            newPost.shared_post_id ? "share" : "create"
        }`
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
    const userId = req.user.id;
    const postId = +req.query["post-id"];
    if (isNaN(postId)) {
        res.send({ data: null });
        return;
    }
    let feedDetail = await Feed.getFeedDetail(postId, userId);
    res.send({ data: feedDetail });
};

// /post/search?kw=&paging=
const searchPosts = async (req, res) => {
    const userId = req.user.id;
    let { kw, paging } = req.query;
    paging = isNaN(+paging) ? 0 : +paging;
    let searchResult = await search.get(`/${ELASTIC_POST_INDEX}/_search`, {
        data: {
            from: SEARCH_POST_PAGE_SIZE * paging,
            size: SEARCH_POST_PAGE_SIZE,
            query: {
                function_score: {
                    query: {
                        multi_match: {
                            query: kw,
                            fields: ["content^2", "username"],
                            fuzziness: 1,
                            minimum_should_match: "3<-20%",
                        },
                    },
                },
            },
        },
    });
    searchResult = searchResult.data.hits.hits;
    let resultsToReturn = [];
    for (let i = 0; i < searchResult.length; i++) {
        const result = await Feed.getFeedDetail(
            searchResult[i]._source.id,
            userId
        );
        if (result) {
            resultsToReturn.push(result);
        }
    }
    res.send({ data: resultsToReturn });
};

module.exports = {
    createPost,
    editPost,
    deletePost,
    getFeedDetail,
    searchPosts,
};
