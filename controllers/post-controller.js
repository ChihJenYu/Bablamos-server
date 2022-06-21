const Post = require("../models/post");
const newsfeed = require("../apis/newsfeed");
const createPost = async (req, res) => {
    // request body:
    // {
    //     content: "Lorem ipsum",
    //     audience_type_id: 1, // public
    //     audience: undefined,
    //     shared_post_id: undefined,
    //     tags: [{tag_id: 1, tag_name: 'nodejs'}],
    //     mentioned_users: undefined,
    //     photo_urls: undefined
    // }
    const { id: user_id, profile_pic_url, username } = req.user;
    const postData = req.body;
    const newPost = new Post({ ...postData, user_id });

    // save the new post to db
    // const [newPostPacket] = await newPost.save();

    await newPost.save();

    res.status(201).send({ id: newPost.id });

    console.log(
        "New post saved in database; Calling newsfeed generation service..."
    );

    // fan-out write
    // call NFGS to update all newsfeeds of all followers of this user
    const UPDATE_METHOD = "write";

    newsfeed.post(`/update?method=${UPDATE_METHOD}&user-id=${user_id}`, {
        username,
        profile_pic_url,
        ...newPost,
    });
};

const getPostDetail = async (req, res) => {
    
}

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
    //     photo_urls: undefined
    // }
    const post_id = req.post_id;
    const { id: user_id } = req.user;
    const postData = req.body;
    const newPost = new Post({ ...postData, user_id, id: +post_id });

    // update the post
    await newPost.save();

    res.status(200).send({ id: newPost.id });

    console.log(
        "Post updated in database; Calling newsfeed generation service..."
    );

    // locate edge in each follower's feed list and replace with the updated edge
    const UPDATE_METHOD = "write";
    newsfeed.patch(`/update?method=${UPDATE_METHOD}&user-id=${user_id}`, {
        ...newPost,
    });
};

const deletePost = async (req, res) => {
    const user_id = req.user.id;
    let post_id = req.post_id;
    await Post.delete(post_id);

    res.status(200).send({ id: post_id });

    console.log(
        "Post deleted in database; Calling newsfeed generation service..."
    );

    // locate and delete edge in each follower's feed list
    const UPDATE_METHOD = "write";
    newsfeed.delete(
        `/update?method=${UPDATE_METHOD}&user-id=${user_id}&post-id=${post_id}`
    );
};

module.exports = { createPost, editPost, deletePost };
