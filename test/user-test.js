require("dotenv").config();
const { expect, requester } = require("./setup");
const { users, posts } = require("./fake-data");
describe("User", () => {
    // Sign up
    it("Sign up", async () => {
        const user = {
            username: "test_user3",
            email: "test3@test.com",
            password: "password",
            user_profile_pic: 0,
            user_cover_pic: 0,
            allow_stranger_follow: 0,
            info: null,
        };

        const res = await requester.post("/api/user/signup").send(user);

        const returnedUser = res.body.user;

        const userExpected = {
            id: returnedUser.id, // need id from returned data
            username: user.username,
            email: user.email,
        };

        expect(returnedUser).to.be.an("object").that.includes(userExpected);
        expect(res.body.access_token).to.be.a("string");
        expect(returnedUser.profile_pic_url).to.be.a("string");
    });

    it("Sign up with existing email", async () => {
        const user = {
            username: users[0].username,
            email: users[0].email,
            password: "password",
            user_profile_pic: 0,
            user_cover_pic: 0,
            allow_stranger_follow: 0,
            info: null,
        };

        const res = await requester.post("/api/user/signup").send(user);
        expect(res.body.error).to.equal("Username or email is already used");
    });

    // Sign in
    it("Sign in with correct credentials", async () => {
        const user1 = users[0];
        const user = {
            email: user1.email,
            password: user1.password,
        };

        const res = await requester.post("/api/user/signin").send(user);

        const returnedUser = res.body.user;
        const userExpect = {
            id: returnedUser.id, // need id from returned data
            username: user1.username,
            email: user1.email,
        };

        expect(returnedUser).to.be.an("object").that.includes(userExpect);
        expect(res.body.access_token).to.be.a("string");
        expect(returnedUser.profile_pic_url).to.be.a("string");
    });

    it("Sign in with incorrect credentials", async () => {
        const user1 = users[0];
        const user = {
            email: user1.email,
            password: "wrong password",
        };

        const res = await requester.post("/api/user/signin").send(user);

        expect(res.status).to.equal(403);
        expect(res.body.error).to.equal("Incorrect credentials");
    });

    it("Sign in with attempted SQL injection", async () => {
        const user1 = users[0];
        const user = {
            email: user1.email,
            password: '" OR 1=1; -- ',
        };

        const res = await requester.post("/api/user/signin").send(user);

        expect(res.status).to.equal(403);
        expect(res.body.error).to.equal("Incorrect credentials");
    });

    // Get user info at index
    it("Get index user info with correct access token", async () => {
        const user1 = users[0];
        const user = {
            email: user1.email,
            password: user1.password,
        };

        const res = await requester.post("/api/user/signin").send(user);
        const { access_token } = res.body;

        const { body: userInfoBody } = await requester
            .get("/api/user/info?at=index")
            .set("Authorization", access_token);
        const returnedUserPayload = userInfoBody.data;
        const payloadExpect = {
            user_id: returnedUserPayload.user_id,
            username: user1.username,
        };

        expect(returnedUserPayload)
            .to.be.an("object")
            .that.includes(payloadExpect);
        expect(returnedUserPayload.profile_pic_url).to.be.a("string");
    });

    it("Get index user info without access token", async () => {
        const res = await requester.get("/api/user/info?at=index");
        expect(res.status).to.equal(401);
    });

    it("Get index user info with incorrect access token", async () => {
        const res = await requester
            .get("/api/user/info?at=index")
            .set("Authorization", "bad_token");
        expect(res.status).to.equal(403);
    });

    // Get user info at profile
    it("Get profile user info with correct access token", async () => {
        const [user1, user2] = users;
        const user = {
            email: user1.email,
            password: user1.password,
        };

        const res = await requester.post("/api/user/signin").send(user);
        const { access_token } = res.body;

        const { body: userInfoBody } = await requester
            .get("/api/user/info?at=profile&username=test_user2")
            .set("Authorization", access_token);

        const profileInfoExpect = {
            user_id: userInfoBody.user_id,
            username: user2.username,
        };

        expect(userInfoBody)
            .to.be.an("object")
            .that.includes(profileInfoExpect);
        expect(userInfoBody.friend_count).to.be.a("number");
        expect(userInfoBody.profile_pic_url).to.be.a("string");
        expect(userInfoBody.cover_pic_url).to.be.a("string");
        expect(userInfoBody.friend_status).to.equal("accepted");
        expect(userInfoBody.follow_status).to.equal(0);
    });

    // Get user's index newsfeed
    it("Get user's index newsfeed", async () => {
        const user2 = users[1];
        const user = {
            email: user2.email,
            password: user2.password,
        };

        const res = await requester.post("/api/user/signin").send(user);
        const { access_token } = res.body;

        const newsfeedResponse = await requester
            .get("/api/user/newsfeed?at=index")
            .set("Authorization", access_token);

        const userNewsfeed = newsfeedResponse.body.data;
        expect(userNewsfeed).to.have.lengthOf(2);
        expect(userNewsfeed[0]).to.have.all.keys([
            "id",
            "edge_type_id",
            "user_id",
            "content",
            "mentioned_users",
            "photo_count",
            "created_at",
            "audience_type_id",
            "audience",
            "shared_post_id",
            "tags",
            "username",
            "like_count",
            "comment_count",
            "share_count",
            "latest_comments",
            "user_profile_pic",
            "already_liked",
            "profile_pic_url",
        ]);
    });
});
