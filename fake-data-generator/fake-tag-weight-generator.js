require("dotenv").config();
const db = require("../mysql/");

const USER_COUNT = 502;

let args = [];

(async () => {
    const [allTagIds] = await db.pool.query("SELECT DISTINCT id FROM tag");
    for (let i = 1; i <= USER_COUNT; i++) {
        for (let j = 0; j < allTagIds.length; j++) {
            args.push([i, allTagIds[j].id, 5]);
        }
    }
    await db.pool.query(
        "INSERT INTO user_tag_weight (user_id, tag_id, weight) VALUES ?",
        [args]
    );
    console.log("Insertion complete.");
})();
