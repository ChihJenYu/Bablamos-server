require("dotenv").config();
const { NODE_ENV } = process.env;
const SALT_ROUNDS = 10;
const bcrypt = require("bcrypt");
const { users, posts } = require("./fake-data");
const { pool } = require("../mysql/");
require("../newsfeed-generation-service/mongoose/");
const User = require("../newsfeed-generation-service/models/user");
const _createFakeUser = async (conn) => {
    const encrypted_users = users.map((user) => {
        const encrypted_user = {
            ...user,
            password: bcrypt.hashSync(user.password, SALT_ROUNDS),
        };
        return encrypted_user;
    });

    // insert users
    await conn.query(
        "INSERT INTO user (username, email, password,user_profile_pic, user_cover_pic, allow_stranger_follow, info) VALUES ?",
        [encrypted_users.map((user) => Object.values(user))]
    );
    const [userIds] = await conn.query("SELECT id FROM user");

    // insert new friendship
    await conn.query(
        "INSERT INTO friendship (user_id, friend_userid, status) VALUES (?, ?, ?)",
        [userIds[0].id, userIds[1].id, "accepted"]
    );
    await conn.query(
        "INSERT INTO friendship (user_id, friend_userid, status) VALUES (?, ?, ?)",
        [userIds[1].id, userIds[0].id, "accepted"]
    );
};

const _createFakePost = async (conn) => {
    await conn.query(
        `INSERT INTO post
                (user_id, content, shared_post_id, photo_count)
                VALUES ?`,
        [posts.map((post) => Object.values(post))]
    );
};

async function createFakeData() {
    if (NODE_ENV !== "test") {
        console.log("Not in test env");
        return;
    }
    const conn = await pool.getConnection();
    await conn.query("START TRANSACTION");
    // await conn.query("SET FOREIGN_KEY_CHECKS = ?", 0);
    await _createFakeUser(conn);
    await _createFakePost(conn);
    // await conn.query("SET FOREIGN_KEY_CHECKS = ?", 1);
    await conn.query("COMMIT");
    const [userIds] = await conn.query("SELECT id FROM user");
    const [userPosts] = await conn.query("SELECT id, user_id FROM post");
    await conn.release();

    // insert users to MongoDB
    await User.insertMany(
        userIds.map((userIdObj) => {
            return {
                user_id: userIdObj.id,
                newsfeed: [],
                affinity: [],
                affinity_with_self: [],
            };
        })
    );
    await User.updateOne(
        { user_id: 2 },
        {
            $push: {
                newsfeed: {
                    $each: userPosts.map((userPost) => {
                        return {
                            user_id: userPost.user_id,
                            post_id: userPost.id,
                            edge_rank_score: userPost.id,
                        };
                    }),
                    $sort: {
                        edge_rank_score: -1,
                    },
                },
            },
        }
    );
}

async function truncateFakeData() {
    if (NODE_ENV !== "test") {
        console.log("Not in test env");
        return;
    }

    const truncateTable = async (table) => {
        const conn = await pool.getConnection();
        await conn.query("START TRANSACTION");
        await conn.query("SET FOREIGN_KEY_CHECKS = ?", 0);
        await conn.query(`TRUNCATE TABLE ${table}`);
        await conn.query("SET FOREIGN_KEY_CHECKS = ?", 1);
        await conn.query("COMMIT");
        await conn.release();
        return;
    };

    const tables = [
        "user",
        "post",
        "followship",
        "friendship",
        "like_user",
        "comment",
        "mention_user",
    ];
    for (let table of tables) {
        await truncateTable(table);
    }
    await User.deleteMany({});
    return;
}

async function closeConnection() {
    return await pool.end();
}

async function main() {
    await truncateFakeData();
    await createFakeData();
    await closeConnection();
}

// execute when called directly.
if (require.main === module) {
    main();
}

module.exports = {
    createFakeData,
    truncateFakeData,
    closeConnection,
};
