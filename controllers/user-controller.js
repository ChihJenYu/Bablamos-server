const User = require("../models/user");
const Feed = require("../models/feed");
const { elasticSearchUsers } = require("../apis/search");
const redisClient = require("../redis/");
const { NODE_ENV } = process.env;
const {
    popularityCalculatorJobQueue,
    notificationDispatcherJobQueue,
} = require("../mq/");
const newsfeed = require("../apis/newsfeed");
const NEWSFEED_PER_PAGE_FOR_CLIENT = NODE_ENV === "test" ? 2 : 8;
const NEWSFEED_PER_PAGE_FOR_WEB_SERVER = 100;

const insertNewUser = async (userData) => {
    const { username, email, password } = userData;
    if (!username || !email || !password) {
        throw new Error("Missing information");
    }
    let user = new User(userData);
    const id = await user.save();
    const token = user.generateAuthToken(id);
    return {
        access_token: token.token,
        access_expired: token.expire,
        user: {
            id,
            username: user.username,
            email: user.email,
        },
    };
};

const regularSignin = async (userData) => {
    const retrievedUser = await User.findByCredentials(userData);
    if (!retrievedUser) {
        throw new Error("Incorrect credentials");
    }
    const { id, username, email, user_profile_pic } = retrievedUser;
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
        },
    };
};

const userSignUp = async (req, res, next) => {
    try {
        const responseBody = await insertNewUser(req.body);
        responseBody.user.profile_pic_url = User.generatePictureUrl({
            has_profile: false,
        });
        res.status(201).send(responseBody);
        newsfeed.post(`/user?user-id=${responseBody.user.id}`);
        return;
    } catch (e) {
        if (e.message === "Missing information") {
            res.status(400).send({ error: e.message });
            return;
        }
        if (e.message.includes("Duplicate entry")) {
            res.status(400).send({
                error: "Username or email is already used",
            });
            return;
        }
        next(e);
    }
};

const userSignIn = async (req, res, next) => {
    if (!req.is("application/json")) {
        res.status(400).send({ error: "Wrong content type" });
        return;
    }
    try {
        const responseBody = await regularSignin(req.body);
        res.status(200).send(responseBody);
        return;
    } catch (e) {
        if (e.message === "Incorrect credentials") {
            res.status(403).send({ error: e.message });
            return;
        }
        next(e);
    }
};

const userSignOut = async (req, res) => {
    res.sendStatus(200);
};

const editUserProfile = async (req, res) => {
    const { id: user_id, username, email, allow_stranger_follow } = req.user;
    if (req.body.allow_stranger_follow || req.body.info) {
        const user = new User({ id: user_id });
        await user.save(req.body);
        res.sendStatus(200);
        return;
    }
    if (req.files) {
        let profilePicChanged = false;
        let coverPicChanged = false;
        if (req.files["profile-pic"]) {
            profilePicChanged = true;
            await User.uploadToS3({
                user_id,
                buffer: req.files["profile-pic"][0].buffer,
                which: "profile",
            });
        }
        if (req.files["cover-pic"]) {
            coverPicChanged = true;
            await User.uploadToS3({
                user_id,
                buffer: req.files["cover-pic"][0].buffer,
                which: "cover",
            });
        }
        const user = new User({ id: user_id });
        const updateArgs = {};
        const responseBody = {};
        if (profilePicChanged) {
            updateArgs.user_profile_pic = 1;
            responseBody.profile_pic_url = User.generatePictureUrl({
                has_profile: true,
                id: user_id,
            });
            responseBody.access_token = User.staticGenerateAuthToken({
                id: user_id,
                username,
                email,
                user_profile_pic: 1,
                allow_stranger_follow,
            }).token;
        }
        if (coverPicChanged) {
            updateArgs.user_cover_pic = 1;
            responseBody.cover_pic_url = User.generateCoverUrl({
                has_cover: true,
                id: user_id,
            });
        }
        await user.save(updateArgs);
        res.send({
            data: { ...responseBody },
        });
        return;
    }
};

// /user/newsfeed?at=index&paging=0&username= (username query is required if at == profile)
// returns an array of Feed objects
// redis key for individual users' fetched feeds: newsfeed_storage_user_X
// redis key for tracking starting index of user's newsfeed_storage: start_index_for_temp_storage_user_X
const getNewsfeed = async (req, res) => {
    const { at: whichPage, id: userInQuestion } = req.query;
    const paging = +req.query.paging || 0;
    const { id: userAsking } = req.user;

    if (whichPage === "index") {
        let initialized = false;
        let userNewsfeedStorageJSON = await redisClient.get(
            "newsfeed_storage_user_" + userAsking
        );
        if (!userNewsfeedStorageJSON || paging === 0) {
            await redisClient.set(
                "start_index_for_temp_storage_user_" + userAsking,
                0
            );
            userNewsfeedStorageJSON = null;
            initialized = true;
        }
        let userNewsfeedStorageParsed = userNewsfeedStorageJSON
            ? JSON.parse(userNewsfeedStorageJSON)
            : [];

        // the portion in MongoDB that user wants to see
        const requestedStartIndex = paging * NEWSFEED_PER_PAGE_FOR_CLIENT;
        const requestedEndIndex =
            paging * NEWSFEED_PER_PAGE_FOR_CLIENT +
            NEWSFEED_PER_PAGE_FOR_CLIENT -
            1;

        // the portion that server has cached
        let NFGSStartIndex = initialized
            ? 0
            : await redisClient.get(
                  "start_index_for_temp_storage_user_" + userAsking
              );
        NFGSStartIndex = +NFGSStartIndex;
        NFGSEndIndex = NFGSStartIndex + NEWSFEED_PER_PAGE_FOR_WEB_SERVER - 1;

        // the starting and ending indices of cached newsfeed that is requested
        const localIndexToStart = requestedStartIndex - NFGSStartIndex;
        const localIndexToEnd = requestedEndIndex - NFGSStartIndex;

        let newsfeedToReturn = userNewsfeedStorageParsed.slice(
            localIndexToStart,
            localIndexToEnd + 1
        );

        // needs to get feed from NFGS
        if (
            localIndexToEnd <= 0 ||
            newsfeedToReturn.length !== NEWSFEED_PER_PAGE_FOR_CLIENT
        ) {
            const { data } = await newsfeed.get(
                `?user-id=${userAsking}&from=${requestedStartIndex}`
            );
            newsfeedToReturn = data.data.slice(0, NEWSFEED_PER_PAGE_FOR_CLIENT);
            const newNewsfeedStorageJSON = JSON.stringify(data.data);
            redisClient.set(
                "newsfeed_storage_user_" + userAsking,
                newNewsfeedStorageJSON
            );
            redisClient.set(
                "start_index_for_temp_storage_user_" + userAsking,
                requestedStartIndex
            );
        }
        // add author profile_pic_url and commentor
        const postIds = newsfeedToReturn.map((nf) => {
            return nf.post_id;
        });
        newsfeedToReturn =
            postIds.length === 0
                ? []
                : await Feed.getFeedsDetail(postIds, userAsking);
        res.send({ data: newsfeedToReturn });
    } else if (whichPage === "profile") {
        if (!userInQuestion) {
            res.status(400).send({ error: "Missing information" });
            return;
        }

        // feed audience list must include req.user.id
        const newsfeedToReturn = await Feed.findByAuthorId(
            userInQuestion,
            userAsking,
            paging
        );
        res.send({ data: newsfeedToReturn });
    }
};

const getUserInfo = async (req, res) => {
    const { at: whichPage, username: usernameInQuestion } = req.query;
    if (whichPage === "index") {
        const { id: user_id, username, profile_pic_url } = req.user;
        res.send({
            data: {
                user_id,
                username,
                profile_pic_url,
            },
        });
    } else if (whichPage === "profile") {
        const { id: userAsking } = req.user;
        if (!usernameInQuestion) {
            res.status(400).send({ error: "Missing information" });
            return;
        }

        const [userPacket] = await User.find(["id"], {
            username: usernameInQuestion,
        });
        if (!userPacket) {
            res.send({});
            return;
        }
        const userInQuestion = userPacket.id;
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
            user_cover_pic,
            friend_status,
            follow_status,
            allow_stranger_follow,
        } = await User.getUserInfo({
            user_asking: userAsking,
            user_in_question: userInQuestion,
        });

        if (userAsking === userInQuestion) {
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
            cover_pic_url: User.generateCoverUrl({
                has_cover: user_cover_pic == 1,
                id: userInQuestion,
            }),
            friend_count: +friend_count,
            recent_friends,
            friend_status,
            follow_status,
            allow_stranger_follow,
        });
        return;
    }
};

// request body contains {edge_id, edge_type}
const userLikesEdge = async (req, res) => {
    const { id: user_id } = req.user;
    const { post_id, comment_id } = req.body;
    if (req.method === "POST") {
        // like
        await User.like({
            type: "like",
            user_id,
            post_id,
            comment_id,
        });
        res.sendStatus(201);
    } else if (req.method === "DELETE") {
        await User.like({
            type: "unlike",
            user_id,
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

// /user/friend?kw=&paging=
const getUserFriends = async (req, res) => {
    let { id: userInQuestion, status, paging, kw, type } = req.query;
    paging = +paging || 0;
    userInQuestion = +userInQuestion;
    const { id: userAsking } = req.user;

    // trying to get other users' friend requests
    if (userAsking !== userInQuestion && status !== "accepted") {
        res.status(403).send({ error: "Not authorized" });
        return;
    }
    // if no id query parameter, use req.user.id
    let filter = { user_id: userInQuestion || userAsking, status };
    if (kw) {
        filter.username = { like: `${kw}%` };
    }
    const friends = await User.findFriends(
        null,
        filter,
        paging,
        type === "mention" ? true : null
    );
    res.send({ data: friends });
};

// /user/search?type=&kw=&paging=
const searchUsers = async (req, res) => {
    const { type, kw } = req.query;
    const paging = +req.query.paging || 0;
    res.send({ data: await elasticSearchUsers(type, kw, paging) });
};

const userBefriends = async (req, res) => {
    const { id: outgoing_user_id } = req.user;
    const friend_userid = +req.query["user-id"];
    const outgoing_action = req.query.action;
    await User.befriend({ outgoing_user_id, friend_userid, outgoing_action });
    res.sendStatus(201);
    if (outgoing_action === "send") {
        notificationDispatcherJobQueue.add({
            function: "pushNotification",
            type: 5,
            user_id: outgoing_user_id,
            for_user_id: friend_userid,
        });
        return;
    }
    if (outgoing_action === "accept") {
        notificationDispatcherJobQueue.add({
            function: "pushNotification",
            type: 6,
            user_id: outgoing_user_id,
            for_user_id: friend_userid,
        });
    }
};

const userUnfriends = async (req, res) => {
    const outgoing_user_id = req.user.id;
    const friend_userid = +req.query["user-id"];
    await User.unfriend({ outgoing_user_id, friend_userid });
    res.sendStatus(200);

    // call newsfeed generation service
    newsfeed.post(`/user/unfriend`, {
        outgoing_user_id,
        friend_userid,
    });

    // invalidate related notifications
    notificationDispatcherJobQueue.add({
        function: "invalidateNotification",
        type: 5,
        user_id: outgoing_user_id,
        for_user_id: friend_userid,
    });
};

// /user/follow?id=
const userFollows = async (req, res) => {
    const outgoing_user_id = req.user.id;
    const following_userid = +req.query.id;
    await User.follow({ outgoing_user_id, following_userid });
    res.sendStatus(201);
    notificationDispatcherJobQueue.add({
        function: "pushNotification",
        type: 4,
        user_id: outgoing_user_id,
        for_user_id: following_userid,
    });
};

const userUnfollows = async (req, res) => {
    const outgoing_user_id = req.user.id;
    const following_userid = +req.query.id;
    await User.unfollow({ outgoing_user_id, following_userid });
    res.sendStatus(200);
    notificationDispatcherJobQueue.add({
        function: "invalidateNotification",
        type: 4,
        user_id: outgoing_user_id,
        for_user_id: following_userid,
    });
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

// /user/read?type=&post-id=
const readPost = (req, res) => {
    const user_id = req.user.id;
    const type = req.query.type;
    if (type === "new") {
        // recalculation of new posts
        newsfeed.post(`/update/recalc?type=new&user-id=${user_id}`, {
            posts: req.body.posts,
        });
        res.sendStatus(200);
    } else if (type === "read") {
        // recalculation of read posts
        newsfeed.post(`/update/recalc?type=read&user-id=${user_id}`, {
            posts: req.body.posts,
        });
        res.sendStatus(200);
    }
};

module.exports = {
    userSignUp,
    userSignIn,
    userSignOut,
    editUserProfile,
    getNewsfeed,
    getUserInfo,
    userLikesEdge,
    userBefriends,
    userUnfriends,
    getUserFriends,
    searchUsers,
    userFollows,
    userUnfollows,
    getUserFollowings,
    getUserFollowers,
    readPost,
};
