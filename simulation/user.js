require("dotenv").config();
const { MY_HOST, FAKE_PASSWORD } = process.env;
const axios = require("axios");
const schedule = require("node-schedule");
const User = require("../models/user");
const Post = require("../models/post");
const Comment = require("../models/comment");
const { faker } = require("@faker-js/faker");
const aws = require("aws-sdk");
const PROFILE_PHOTO_TARGET_URL = "https://randomuser.me/api/?inc=picture";

const randomUserSignup = async () => {
    const randomName = faker.name.findName();
    const randomEmail = faker.internet.email();
    const password = FAKE_PASSWORD;
    await axios.post(
        `${MY_HOST}/user/signup`,
        {
            username: randomName,
            email: randomEmail,
            password,
        },
        {
            headers: {
                "Content-Type": "application/json",
            },
        }
    );
    console.log("Simulation done.");
};

const randomLikeOnPost = async () => {
    const randomUser = await User.getRandomUser();
    const randomPost = await Post.getRandomPost();
    const { token } = User.staticGenerateAuthToken(randomUser);
    await axios.post(
        `${MY_HOST}/user/like`,
        {
            post_id: randomPost.id,
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

const randomLikeOnComment = async () => {
    const randomUser = await User.getRandomUser();
    const randomComment = await Comment.getRandomComment();
    const { token } = User.staticGenerateAuthToken(randomUser);
    await axios.post(
        `${MY_HOST}/user/like`,
        {
            comment_id: randomComment.id,
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

const randomSendFriendRequest = async () => {
    const randomUsers = await User.getRandomUser(2);
    const [outgoingUser, incomingUser] = randomUsers;
    const { token } = User.staticGenerateAuthToken(outgoingUser);
    await axios.post(
        `${MY_HOST}/user/friend?user-id=${incomingUser.id}&action=send`,
        {},
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );
    console.log("Simulation done.");
};

const randomAcceptFriendRequest = async () => {
    const randomUsers = await User.getRandomUser(2);
    const [outgoingUser, incomingUser] = randomUsers;
    const pendingFriends = await User.findFriends(
        false,
        { user_id: outgoingUser.id },
        0
    );
    const { token } = User.staticGenerateAuthToken(outgoingUser);
    for (let pending of pendingFriends) {
        await axios.post(
            `${MY_HOST}/user/friend?user-id=${pending.id}&action=accept`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );
    }
    console.log("Simulation done.");
};

const randomEditUserProfilePhoto = async () => {
    const randomUser = await User.getRandomUser();
    const { data: targetResponse } = await axios.get(PROFILE_PHOTO_TARGET_URL);
    const profilePhotoUrl = targetResponse.results[0].picture.large;
    const { data: response } = await axios.get(profilePhotoUrl, {
        responseType: "arraybuffer",
    });
    const photoBuffer = Buffer.from(response, "binary");
    const s3 = new aws.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
    // upload image to S3
    await s3
        .putObject({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `user/${randomUser.id}/profile.jpg`,
            Body: photoBuffer,
            CacheControl: "no-cache",
            Expires: new Date(),
        })
        .promise();
    // save changes to db
    const user = new User(randomUser);
    await user.save({ user_profile_pic: 1 });
    console.log("Simulation done.");
};

const createRandomUser = schedule.scheduleJob("0 */6 * * *", async () => {
    await randomUserSignup();
});

const createRandomLikePost = schedule.scheduleJob("* * * * *", async () => {
    await randomLikeOnPost();
});

const createRandomLikeComment = schedule.scheduleJob("*/30 * * * *", async () => {
    await randomLikeOnComment();
});

const createRandomFriendRequest = schedule.scheduleJob(
    "0 * * * *",
    async () => {
        await randomSendFriendRequest();
    }
);

const createRandomFriend = schedule.scheduleJob("0 */6 * * *", async () => {
    await randomAcceptFriendRequest();
});

const createRandomUserProfilePhoto = schedule.scheduleJob(
    "0 * * * *",
    async () => {
        await randomEditUserProfilePhoto();
    }
);
