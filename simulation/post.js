require("dotenv").config();
const { MY_HOST } = process.env;
const axios = require("axios");
const schedule = require("node-schedule");
const User = require("../models/user");
const Post = require("../models/post");
const { parse } = require("node-html-parser");
const TARGET_URL =
    "https://dev.to/search/feed_content?per_page=100&page=0&sort_by=hotness_score&sort_direction=desc&approved=&class_name=Article";
const POST_URL_DOMAIN = "https://dev.to";
const generateRandomPost = async () => {
    const randomPostIndex = Math.floor(Math.random() * 101);
    const { data: targetResponse } = await axios.get(TARGET_URL);
    const postURL =
        POST_URL_DOMAIN + targetResponse.result[randomPostIndex].path;
    const { data: response } = await axios.get(postURL);
    const randomContent = parse(response).querySelector(
        "#article-body p:first-of-type"
    ).innerText;
    const randomUser = await User.getRandomUser();
    const isShare = Math.random() > 0.5;
    let sharedPostId = undefined;
    if (isShare) {
        const { id } = Post.getRandomPost();
        sharedPostId = id;
    }
    // get access_token
    const { token } = User.staticGenerateAuthToken(randomUser);
    axios.post(
        `${MY_HOST}/post`,
        {
            content: randomContent,
            audience_type_id: 1,
            tags: [],
            shared_post_id: sharedPostId,
        },
        {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        }
    );
};

const createRandomPost = schedule.scheduleJob("0 * * * *", async () => {
    await generateRandomPost();
});
