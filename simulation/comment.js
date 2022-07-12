require("dotenv").config();
const { MY_HOST } = process.env;
const axios = require("axios");
const schedule = require("node-schedule");
const User = require("../models/user");
const Post = require("../models/post");
const Comment = require("../models/comment");
const { faker } = require("@faker-js/faker");
const capitalize = (str) => {
    const lower = str.toLowerCase();
    return str.charAt(0).toUpperCase() + lower.slice(1);
};
const randomComment = async () => {
    const randomUser = await User.getRandomUser();
    const randomPost = await Post.getRandomPost();
    const randomComment =
        capitalize(faker.word.noun()) +
        " " +
        faker.word.verb() +
        " " +
        "a " +
        faker.company.catchPhrase();
    const { token } = User.staticGenerateAuthToken(randomUser);
    await axios.post(
        `${MY_HOST}/comment?post-id=${randomPost.id}`,
        {
            content: randomComment,
            level: 1,
            mentioned_users: [],
        },
        {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        }
    );
    console.log("Simulation done.");
};

const createRandomComment = schedule.scheduleJob("0 * * * *", async () => {
    await randomComment();
});
