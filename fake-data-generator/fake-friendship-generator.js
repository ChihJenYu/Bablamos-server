require("dotenv").config();
const User = require("../models/user");
const FAKE_USER_COUNT = 502;

let args = [];

for (let i = 1; i <= FAKE_USER_COUNT; i++) {
    for (let j = 1; j <= FAKE_USER_COUNT; j++) {
        if (i != j) {
            args.push([i, j, 1]);
        }
    }
}

(async () => {
    await User.befriendInBulk(args);
    console.log("Insertion complete.");
})();
