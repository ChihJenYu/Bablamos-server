require("dotenv").config();
const db = require("../mysql/");

// const POST_RANGE = [2, 503];

// for (let i = 0; i < POST_RANGE[1]; i++) {
//     posts.push(i + 1);
// }
(async () => {
    let posts = [];
    let args = [];
    const [allPostsId] = await db.pool.query("SELECT id FROM post");
    posts = allPostsId.map((postPacket) => postPacket.id);
    const USER_RANGE = [1, 503];

    for (let i = USER_RANGE[0]; i <= USER_RANGE[1]; i++) {
        // each user likes a random number of posts
        let ranNumOfPost = Math.floor(Math.random() * (posts.length + 1));
        const shuffled = [...posts].sort(() => 0.5 - Math.random());
        const like_posts = shuffled.slice(0, ranNumOfPost);
        for (let j of like_posts) {
            args.push([j, i, null]);
        }
    }
    await db.pool.query(
        "INSERT INTO like_user (post_id, user_id, comment_id) VALUES ?",
        [args]
    );

    console.log("Insertion complete.");
})();
