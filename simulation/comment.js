require("dotenv").config();
const { MY_HOST } = process.env;
const axios = require("axios");
const schedule = require("node-schedule");
const User = require("../models/user");
const Post = require("../models/post");
const { faker } = require("@faker-js/faker");
const capitalize = (str) => {
    const lower = str.toLowerCase();
    return str.charAt(0).toUpperCase() + lower.slice(1);
};
const randomComment = async () => {
    const randomUser = await User.getRandomUser();
    const randomPost = await Post.getRandomPost({
        favor_user: true,
        favor_recent: true,
    });
    if (!randomPost) {
        // favored users have not posted recently
        return;
    }
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
            mentioned_users: [],
        },
        {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        }
    );
};

const createRandomComment = schedule.scheduleJob("* * * * *", async () => {
    await randomComment();
});
