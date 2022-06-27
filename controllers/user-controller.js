const User = require("../models/user");
const Feed = require("../models/feed");
const { popularityCalculatorJobQueue } = require("../mq/");
const redisClient = require("../redis");
const newsfeed = require("../apis/newsfeed");
const aws = require("aws-sdk");
const NEWSFEED_PER_PAGE_FOR_CLIENT = 8;
const NEWSFEED_PER_PAGE_FOR_WEB_SERVER = 100;

let userTempNewsfeedStorage = {};

// type = "native"
// implement check for duplicate user in model
const insertNewUser = async (includeProfilePic, type, userData) => {
    const { username, email, password } = userData;
    if (!username || !email || !password) {
        throw new Error("Missing information");
    }
    let user = new User({
        username,
        email,
        password,
        include_profile_pic: includeProfilePic ? 1 : 0,
    });

    const id = await user.save(type);

    const token = user.generateAuthToken(id);

    return {
        access_token: token.token,
        access_expired: token.expire,
        user: {
            id,
            username: user.username,
            email: user.email,
            // allow_stranger_follow?
        },
    };
};

// type = "native"
const regularSignin = async (type, userData) => {
    const retrievedUser = await User.findByCredentials(userData);
    if (!retrievedUser) {
        throw new Error("User not found");
    }
    const { id, username, email, user_profile_pic, allow_stranger_follow } =
        retrievedUser;
    const token = User.staticGenerateAuthToken(retrievedUser);
    return {
        access_token: token.token,
        access_expired: token.expire,
        user: {
            id,
            username,
            email,
            profile_pic_url: User.generatePictureUrl({
                has_profile: user_profile_pic == 1,
                id,
            }),
            // allow_stranger_follow?
        },
    };
};

const userSignUp = async (req, res) => {
    try {
        if (req.file) {
            // includes profile picture
            const responseBody = await insertNewUser(true, "native", req.body);
            const newUserId = responseBody.user.id;
            const s3 = new aws.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            });
            await s3
                .upload({
                    Bucket: process.env.AWS_S3_BUCKET_NAME,
                    Key: `user/${newUserId}/profile.jpg`,
                    Body: req.file.buffer,
                })
                .promise();
            responseBody.user.profile_pic_url = User.generatePictureUrl({
                has_profile: true,
                id: newUserId,
            });
            res.status(201).send(responseBody);
        } else {
            // no profile picture
            const responseBody = await insertNewUser(false, "native", req.body);
            responseBody.user.profile_pic_url = User.generatePictureUrl();
            res.status(201).send(responseBody);
        }
    } catch (e) {
        console.log(e);
        res.status(400).send({ error: e.message });
        return;
    }
};

const userSignIn = async (req, res) => {
    if (!req.is("application/json")) {
        res.status(400).send({ error: "Wrong content type" });
        return;
    }
    try {
        const responseBody = await regularSignin("native", req.body);
        res.status(200).send(responseBody);
        return;
    } catch (e) {
        console.log(e);
        res.status(400).send({ error: e.message });
        return;
    }
};

// /user/newsfeed?at=index&paging=0&username= (username query is required if at == profile)
// returns an array of parsed Feed objects
const getNewsfeed = async (req, res) => {
    const whichPage = req.query.at;
    const paging = +req.query.paging || 0;
    const userAsking = req.user.id;
    const userInQuestion = req.query.id;

    if (whichPage === "index") {
        // initialization
        if (!userTempNewsfeedStorage[userAsking] || paging === 0) {
            userTempNewsfeedStorage[userAsking] = [];
            await redisClient.set(
                "NFGS_start_index_for_temp_storage_user_" + userAsking,
                0
            );
        }

        const requestedStartIndex = paging * NEWSFEED_PER_PAGE_FOR_CLIENT;
        const requestedEndIndex =
            paging * NEWSFEED_PER_PAGE_FOR_CLIENT +
            NEWSFEED_PER_PAGE_FOR_CLIENT -
            1;

        let NFGSStartIndex = await redisClient.get(
            "NFGS_start_index_for_temp_storage_user_" + userAsking
        );
        NFGSStartIndex = +NFGSStartIndex;
        NFGSEndIndex = NFGSStartIndex + NEWSFEED_PER_PAGE_FOR_WEB_SERVER - 1;

        // issue: localIndex could be negative
        const localIndexToStart = requestedStartIndex - NFGSStartIndex;
        const localIndexToEnd = requestedEndIndex - NFGSStartIndex;
        let newsfeedToReturn = userTempNewsfeedStorage[userAsking].slice(
            localIndexToStart,
            localIndexToEnd + 1
        );

        // not within range
        if (localIndexToEnd <= 0 || newsfeedToReturn.length === 0) {
            const { data } = await newsfeed.get(
                `?user-id=${userAsking}&from=${requestedStartIndex}`
            );

            userTempNewsfeedStorage[userAsking] = data.data;
            newsfeedToReturn = userTempNewsfeedStorage[userAsking].slice(
                0,
                NEWSFEED_PER_PAGE_FOR_CLIENT
            );
            redisClient.set(
                "NFGS_start_index_for_temp_storage_user_" + userAsking,
                requestedStartIndex
            );
        } else if (newsfeedToReturn.length === NEWSFEED_PER_PAGE_FOR_CLIENT) {
        } else {
            const { data } = await newsfeed.get(
                `?user-id=${userAsking}&from=${requestedStartIndex}`
            );

            userTempNewsfeedStorage[userAsking] = data.data;
            newsfeedToReturn = data.data.slice(0, NEWSFEED_PER_PAGE_FOR_CLIENT);
            redisClient.set(
                "NFGS_start_index_for_temp_storage_user_" + userAsking,
                requestedStartIndex
            );
        }

        // add author profile_pic_url and commentor
        for (let i = 0; i < newsfeedToReturn.length; i++) {
            const feedId = newsfeedToReturn[i].post_id;
            const feedContent = await Feed.getFeedDetail(feedId, userAsking);
            feedContent.profile_pic_url = User.generatePictureUrl({
                has_profile: feedContent.user_profile_pic == 1,
                id: feedContent.user_id,
            });
            delete feedContent.user_profile_pic;
            feedContent.latest_comments = feedContent.latest_comments.map(
                (comment) => {
                    const newObj = {
                        ...comment,
                        profile_pic_url: User.generatePictureUrl({
                            has_profile: comment.user_profile_pic == 1,
                            id: comment.user_id,
                        }),
                    };
                    delete newObj.user_profile_pic;
                    return newObj;
                }
            );
            feedContent.is_new = newsfeedToReturn[i].is_new;
            newsfeedToReturn[i] = feedContent;
        }
        res.send({ data: newsfeedToReturn });
    } else if (whichPage === "profile") {
        if (!userInQuestion) {
            res.status(400).send({ error: "Missing information" });
            return;
        }

        // feed audience list must include req.user.id
        let newsfeedToReturn = await Feed.findByAuthorId(
            userInQuestion,
            userAsking,
            paging
        );
        newsfeedToReturn = newsfeedToReturn.map((feed) => {
            return {
                ...feed,
                profile_pic_url: User.generatePictureUrl({
                    has_profile: feed.user_profile_pic == 1,
                    id: feed.user_id,
                }),
                latest_comments: feed.latest_comments.map((comment) => {
                    return {
                        ...comment,
                        profile_pic_url: User.generatePictureUrl({
                            has_profile: comment.user_profile_pic == 1,
                            id: comment.user_id,
                        }),
                    };
                }),
            };
        });
        res.send({ data: newsfeedToReturn });
    }
};

// /user/info?at=index&username= (username query is required if at == profile)
const getUserInfo = async (req, res) => {
    const userAsking = req.user.id;
    const whichPage = req.query.at;
    const usernameInQuestion = req.query.username;
    if (whichPage === "index") {
        const { id: userAsking, username, profile_pic_url } = req.user;
        res.send({
            data: {
                user_id: userAsking,
                username,
                profile_pic_url,
            },
        });
    } else if (whichPage === "profile") {
        if (!usernameInQuestion) {
            res.status(400).send({ error: "Missing information" });
            return;
        }

        const [userPacket] = await User.find(["id"], {
            username: usernameInQuestion,
        });
        const userInQuestion = userPacket.id;

        // res.send({user_info: "", profile_pic_url: req.user.profile_pic_url, friend_count: 0, recent_friends: []})
        const recent_friends = await User.findFriends(
            true,
            { user_id: userInQuestion, status: "accepted" },
            0
        );

        let {
            user_info,
            username,
            friend_count,
            user_profile_pic,
            friend_status,
            follow_status,
            allow_stranger_follow,
        } = await User.getUserInfo({
            user_asking: userAsking,
            user_in_question: userInQuestion,
        });

        if (userAsking == userInQuestion) {
            friend_status = "self";
        } else if (friend_status == null) {
            friend_status = "stranger";
        }

        res.send({
            user_id: userInQuestion,
            user_info,
            username,
            profile_pic_url: User.generatePictureUrl({
                has_profile: user_profile_pic == 1,
                id: userInQuestion,
            }),
            friend_count,
            recent_friends,
            friend_status,
            follow_status,
            allow_stranger_follow,
        });
        return;
    }
};

// request body contains {edge_id, edge_type}
// after each like changes, send 'checkLikeCount' job to affinityCalculatorJobQueue
const userLikesEdge = async (req, res) => {
    const id = req.user.id;
    const { post_id, comment_id } = req.body;
    if (req.method === "POST") {
        // like
        await User.like({
            type: "like",
            user_id: id,
            post_id,
            comment_id,
        });
        res.sendStatus(201);
    } else if (req.method === "DELETE") {
        await User.like({
            type: "unlike",
            user_id: id,
            post_id,
            comment_id,
        });
        res.sendStatus(204);
    }
    if (post_id) {
        popularityCalculatorJobQueue.add({
            function: "checkPopCount",
            post_id: "" + post_id,
            type: "like",
        });
    }
};

// /user/friend
const getUserFriends = async (req, res) => {
    let { id: userInQuestion, status, paging } = req.query;
    userInQuestion = +userInQuestion;
    const userAsking = req.user.id;
    if (userAsking !== userInQuestion && status !== "accepted") {
        res.status(403).send({ error: "Not authorized" });
        return;
    }
    const friends = await User.findFriends(
        null,
        { user_id: userInQuestion, status },
        paging
    );
    res.send({ data: friends });
};

const userBefriends = async (req, res) => {
    const outgoing_user_id = req.user.id;
    const friend_userid = +req.query["user-id"];
    const outgoing_action = req.query.action;
    await User.befriend({ outgoing_user_id, friend_userid, outgoing_action });
    res.sendStatus(201);
};

const userUnfriends = async (req, res) => {
    const outgoing_user_id = req.user.id;
    const friend_userid = +req.query["user-id"];
    await User.unfriend({ outgoing_user_id, friend_userid });
    res.sendStatus(200);
};

// /user/follow?id=
// POST
const userFollows = async (req, res) => {
    const outgoing_user_id = req.user.id;
    const following_userid = +req.query.id;
    await User.follow({ outgoing_user_id, following_userid });
    res.sendStatus(201);
};

// DELETE
const userUnfollows = async (req, res) => {
    const outgoing_user_id = req.user.id;
    const following_userid = +req.query.id;
    await User.unfollow({ outgoing_user_id, following_userid });
    res.sendStatus(200);
};

// /user/following
const getUserFollowings = async (req, res) => {
    const { id, paging } = req.query;
    const followings = await User.findFollowings({ id, paging: +paging || 0 });
    res.send({ data: followings });
};

// /user/follower
const getUserFollowers = async (req, res) => {
    const { id, paging } = req.query;
    const followers = await User.findFollowers({ id, paging: +paging || 0 });
    res.send({ data: followers });
};

const dropFollowers = async (req, res) => {
    const { type } = req.query;
    const { user_id_to_drop } = req.body;
    const user_id = req.user.id;
    await User.dropFollowers({ user_id, type, user_id_to_drop });
    res.sendStatus(200);
};

// /user/read?type=&post-id=
const readPost = (req, res) => {
    const user_id = req.user.id;
    const type = req.query.type;
    if (type === "new") {
        // recalculation of new posts
        newsfeed.post(`/update/recalc?type=new&user-id=${user_id}`, {
            posts: req.body.posts,
        });
        console.log("Firing recalc request, type: reading fresh posts");
        res.sendStatus(200);
    } else if (type === "read") {
        // recalculation of read posts
        newsfeed.post(`/update/recalc?type=read&user-id=${user_id}`, {
            posts: req.body.posts,
        });
        console.log("Firing recalc request, type: incrementing post views");
        res.sendStatus(200);
    }
};

module.exports = {
    userSignUp,
    userSignIn,
    getNewsfeed,
    getUserInfo,
    userLikesEdge,
    userBefriends,
    userUnfriends,
    getUserFriends,
    userFollows,
    userUnfollows,
    getUserFollowings,
    getUserFollowers,
    dropFollowers,
    readPost,
};
