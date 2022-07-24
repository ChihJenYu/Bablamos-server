require("dotenv").config();
const { expect, requester } = require("./setup");
const { users, posts } = require("./fake-data");
const User = require("../models/user");
const sinon = require("sinon");
const path = require("path");
const { stubString } = require("lodash");
let stub;
let access_token;
let signed_in_user;

describe("Sign in & sign up", () => {
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
});

describe("User APIs", () => {
    before(async () => {
        const user1 = users[0];
        const user = {
            email: user1.email,
            password: user1.password,
        };

        const { body } = await requester.post("/api/user/signin").send(user);
        access_token = body.access_token;
        signed_in_user = body.user;
        const fakeUploadToS3 = ({ user_id, buffer, which }) => {
            return new Promise((resolve, reject) => {
                if (
                    !user_id ||
                    !buffer ||
                    !which ||
                    (which && which !== "profile") ||
                    (which && which !== "cover")
                ) {
                    resolve({ status: 500 });
                } else {
                    resolve();
                }
            });
        };
        stub = sinon.stub(User, "uploadToS3").callsFake(fakeUploadToS3);
    });

    // Get user info at index
    it("Get index user info with correct access token", async () => {
        const { body: userInfoBody } = await requester
            .get("/api/user/info?at=index")
            .set("Authorization", access_token);
        const returnedUserPayload = userInfoBody.data;
        const payloadExpect = {
            user_id: returnedUserPayload.user_id,
            username: signed_in_user.username,
        };

        expect(returnedUserPayload)
            .to.be.an("object")
            .that.includes(payloadExpect);
        expect(returnedUserPayload.profile_pic_url).to.be.a("string");
    });

    // Get user info at profile
    it("Get profile user info with correct access token", async () => {
        const user2 = users[1];
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
    it("Get user's index newsfeed with paging", async () => {
        const user2 = users[1];
        const user = {
            email: user2.email,
            password: user2.password,
        };

        const res = await requester.post("/api/user/signin").send(user);
        const { access_token } = res.body;

        const firstPageNewsfeedResponse = await requester
            .get("/api/user/newsfeed?at=index")
            .set("Authorization", access_token);
        const secondPageNewsfeedResponse = await requester
            .get("/api/user/newsfeed?at=index&paging=1")
            .set("Authorization", access_token);

        const firstPageUserNewsfeed = firstPageNewsfeedResponse.body.data;
        const secondPageUserNewsfeed = secondPageNewsfeedResponse.body.data;

        const firstPageFeedExpect = {
            user_id: posts[4].user_id,
            content: posts[4].content,
            shared_post_id: posts[4].shared_post_id,
        };
        const secondPageFeedExpect = {
            user_id: posts[2].user_id,
            content: posts[2].content,
            shared_post_id: posts[2].shared_post_id,
        };
        expect(firstPageUserNewsfeed).to.have.lengthOf(2);
        expect(secondPageUserNewsfeed).to.have.lengthOf(2);
        expect(firstPageUserNewsfeed[0]).to.have.all.keys([
            "id",
            "edge_type_id",
            "user_id",
            "content",
            "photo_count",
            "created_at",
            "shared_post_id",
            "username",
            "like_count",
            "comment_count",
            "share_count",
            "latest_comments",
            "user_profile_pic",
            "already_liked",
            "profile_pic_url",
        ]);
        expect(secondPageUserNewsfeed[0]).to.have.all.keys([
            "id",
            "edge_type_id",
            "user_id",
            "content",
            "photo_count",
            "created_at",
            "shared_post_id",
            "username",
            "like_count",
            "comment_count",
            "share_count",
            "latest_comments",
            "user_profile_pic",
            "already_liked",
            "profile_pic_url",
        ]);
        expect(firstPageUserNewsfeed[0])
            .to.be.an("object")
            .that.includes(firstPageFeedExpect);
        expect(secondPageUserNewsfeed[0])
            .to.be.an("object")
            .that.includes(secondPageFeedExpect);
    });

    // Edit user profile
    it("Edit user info with correct access token", async () => {
        const info = "Mocha is not matcha";
        const editInfoRes = await requester
            .patch("/api/user/info")
            .set("Authorization", access_token)
            .send({ info });
        const [{ info: updatedInfo }] = await User.find(["info"], {
            id: signed_in_user.id,
        });
        expect(editInfoRes.status).to.equal(200);
        expect(updatedInfo).to.equal(info);
    });

    it("Edit user profile photo only with correct access token", async () => {
        const editPhotoRes = await requester
            .patch("/api/user/info")
            .set("Authorization", access_token)
            .field("Content-Type", "multipart/form-data")
            .attach(
                "profile-pic",
                path.resolve(__dirname, "./images/test.jpg")
            );
        const [{ user_profile_pic }] = await User.find(["user_profile_pic"], {
            id: signed_in_user.id,
        });
        const responseDataExpect = {
            profile_pic_url: User.generatePictureUrl({
                has_profile: 1,
                id: signed_in_user.id,
            }),
        };
        expect(editPhotoRes.status).to.equal(200);
        expect(user_profile_pic).to.equal(1);
        expect(editPhotoRes.body.data)
            .to.be.an("object")
            .that.includes(responseDataExpect);
    });

    it("Edit user cover photo only with correct access token", async () => {
        const editPhotoRes = await requester
            .patch("/api/user/info")
            .set("Authorization", access_token)
            .field("Content-Type", "multipart/form-data")
            .attach("cover-pic", path.resolve(__dirname, "./images/test.jpg"));
        const [{ user_cover_pic }] = await User.find(["user_cover_pic"], {
            id: signed_in_user.id,
        });
        const responseDataExpect = {
            cover_pic_url: User.generateCoverUrl({
                has_cover: 1,
                id: signed_in_user.id,
            }),
        };
        expect(editPhotoRes.status).to.equal(200);
        expect(user_cover_pic).to.equal(1);
        expect(editPhotoRes.body.data)
            .to.be.an("object")
            .that.includes(responseDataExpect);
    });

    it("Edit both profile and cover photos with correct access token", async () => {
        const editPhotoRes = await requester
            .patch("/api/user/info")
            .set("Authorization", access_token)
            .field("Content-Type", "multipart/form-data")
            .attach("profile-pic", path.resolve(__dirname, "./images/test.jpg"))
            .attach("cover-pic", path.resolve(__dirname, "./images/test.jpg"));
        const [{ user_profile_pic, user_cover_pic }] = await User.find(
            ["user_profile_pic", "user_cover_pic"],
            {
                id: signed_in_user.id,
            }
        );
        const responseDataExpect = {
            profile_pic_url: User.generatePictureUrl({
                has_profile: 1,
                id: signed_in_user.id,
            }),
            cover_pic_url: User.generateCoverUrl({
                has_cover: 1,
                id: signed_in_user.id,
            }),
        };
        expect(editPhotoRes.status).to.equal(200);
        expect(user_profile_pic).to.equal(1);
        expect(user_cover_pic).to.equal(1);
        expect(editPhotoRes.body.data)
            .to.be.an("object")
            .that.includes(responseDataExpect);
    });

    it("Upload images with illegal file size", async () => {
        const editPhotoRes = await requester
            .patch("/api/user/info")
            .set("Authorization", access_token)
            .field("Content-Type", "multipart/form-data")
            .attach(
                "profile-pic",
                path.resolve(__dirname, "./images/large.jpg")
            );
        expect(editPhotoRes.status).to.equal(400);
    });

    it("Upload images with illegal file extension", async () => {
        const editPhotoRes = await requester
            .patch("/api/user/info")
            .set("Authorization", access_token)
            .field("Content-Type", "multipart/form-data")
            .attach("profile-pic", path.resolve(__dirname, "./images/cmd.txt"));
        expect(editPhotoRes.status).to.equal(400);
    });

    after(() => {
        stub.restore();
    });
});
