const users = [
    {
        username: "test_user1",
        email: "test1@test.com",
        password: "password",
        user_profile_pic: 0,
        user_cover_pic: 0,
        allow_stranger_follow: 0,
        info: null,
    },
    {
        username: "test_user2",
        email: "test2@test.com",
        password: "password",
        user_profile_pic: 0,
        user_cover_pic: 0,
        allow_stranger_follow: 0,
        info: null,
    },
];

const posts = [
    {
        user_id: 1,
        content: "Test 1",
        shared_post_id: null,
        photo_count: 0,
    },
    {
        user_id: 1,
        content: "Test 2",
        shared_post_id: null,
        photo_count: 0,
    },
];

module.exports = {
    users,
    posts,
};
