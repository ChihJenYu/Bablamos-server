require("dotenv").config();
const User = require("../models/user");
const { faker } = require("@faker-js/faker");
const FAKE_USER_COUNT = 500;
let args = [];

for (let i = 0; i < FAKE_USER_COUNT; i++) {
    const randomName = faker.name.findName();
    const randomEmail = faker.internet.email();
    const password =
        "$2b$10$hXnCgdTpUZZVGr7nKUeWKOQN3QXj5KtKRAFJt0yS.3k0MRXyGCugS";
    const profile_pic_url =
        "https://icon-library.com/images/anonymous-user-icon/anonymous-user-icon-16.jpg";
    const allow_stranger_follow = 0;
    args.push([
        randomName,
        randomEmail,
        password,
        profile_pic_url,
        allow_stranger_follow,
        null,
    ]);
}

(async () => {
    await User.bulkInsert(args);
    console.log("Insertion complete.");
})();
