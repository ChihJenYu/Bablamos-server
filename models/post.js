const db = require("../mysql");
const Edge = require("./edge");
const User = require("./user");
// user_id mod me
const POPULAR_CRITERIA = 100;
const FAVOR_POPULAR_PROB = 0.7;
const FAVOR_RECENT_PROB = 0.6;
class Post extends Edge {
    constructor({
        id,
        user_id,
        content,
        audience_type_id,
        audience, // array of user_ids; optional
        shared_post_id, // optional
        tags, // array
        mentioned_users, // array; optional,
        photo_count, // default 0
        created_at, // optional
    }) {
        super({
            id,
            edge_type: "eventful_edge",
            user_id,
            content,
            mentioned_users,
            photo_count,
            created_at,
        });
        this.audience_type_id = audience_type_id;
        this.audience = audience || [];
        this.shared_post_id = shared_post_id || null;
        this.tags = tags || [];
    }

    static async getRandomPost({ favor_user, favor_recent }) {
        let userIdCondition = "";
        let createdAtCondition = "";
        if (favor_user && Math.random() > FAVOR_POPULAR_PROB) {
            userIdCondition = `user_id % ${POPULAR_CRITERIA} = 0`;
        }
        if (favor_recent && Math.random() > FAVOR_RECENT_PROB) {
            createdAtCondition = `created_at > NOW() - INTERVAL 24 hour`;
        }
        const [randomPost] = await db.pool.query(
            `SELECT * FROM post ${
                userIdCondition !== "" || createdAtCondition !== ""
                    ? "WHERE"
                    : ""
            } ${userIdCondition} ${
                userIdCondition !== "" && createdAtCondition !== "" ? "AND" : ""
            } ${createdAtCondition} ORDER BY RAND() LIMIT 1`
        );
        return randomPost[0];
    }

    static staticGeneratePhotoUrls(id, photo_count) {
        let photoUrls = [];
        for (let i = 0; i < photo_count; i++) {
            photoUrls.push(`/user-media/${id}/${i}.jpg`);
        }
        return photoUrls;
    }

    static async delete(id) {
        const conn = await db.pool.getConnection();
        try {
            await conn.query("START TRANSACTION");
            let [responseObject] = await conn.query(
                "SELECT * FROM post WHERE id = ?",
                [id]
            );
            await conn.query(`DELETE FROM post WHERE id = ?`, [id]);
            await conn.query("COMMIT");
            return responseObject[0];
        } catch (error) {
            await conn.query("ROLLBACK");
            console.log(error);
            return false;
        } finally {
            await conn.release();
        }
    }

    async save() {
        const conn = await db.pool.getConnection();
        try {
            await conn.query("START TRANSACTION");

            if (this.id) {
                const postTagsArray = this.tags.map((tag) => {
                    return [this.id, tag.tag_id];
                });
                const postAudienceArray = this.audience.map((user_id) => {
                    return [this.id, user_id];
                });
                const postMentionsArray = this.mentioned_users.map(
                    (user_id) => {
                        return [this.id, user_id];
                    }
                );

                // is update
                await conn.query(
                    `UPDATE post SET content = ?, audience_type_id = ?, shared_post_id = ?, photo_count = ? WHERE id = ?`,
                    [
                        this.content,
                        this.audience_type_id,
                        this.shared_post_id,
                        this.photo_count,
                        this.id,
                    ]
                );

                // update post_tag
                await conn.query("DELETE FROM post_tag WHERE post_id = ?", [
                    this.id,
                ]);
                if (postTagsArray.length > 0) {
                    await conn.query(
                        "INSERT INTO post_tag (post_id, tag_id) VALUES ?",
                        [postTagsArray]
                    );
                }
                // update post_audience_list
                await conn.query(
                    "DELETE FROM post_audience_list WHERE post_id = ?",
                    [this.id]
                );
                if (postAudienceArray.length > 0) {
                    await conn.query(
                        "INSERT INTO post_audience_list (post_id, user_id) VALUES ?",
                        [postAudienceArray]
                    );
                }
                // update mention_user table
                await conn.query("DELETE FROM mention_user WHERE post_id = ?", [
                    this.id,
                ]);
                if (postMentionsArray.length > 0) {
                    await conn.query(
                        "INSERT INTO mention_user (post_id, user_id) VALUES ?",
                        [postMentionsArray]
                    );
                }
            } else {
                // is insert
                const [{ insertId: post_id }] = await conn.query(
                    `INSERT INTO post
                (user_id, content, audience_type_id, shared_post_id, photo_count)
                VALUES (?, ?, ?, ?, ?)`,
                    [
                        this.user_id,
                        this.content,
                        this.audience_type_id,
                        this.shared_post_id,
                        this.photo_count,
                    ]
                );
                const [newPostPacket] = await conn.query(
                    `SELECT id, unix_timestamp(created_at) 
                as created_at FROM post WHERE id = 
                ?`,
                    [post_id]
                );
                const { id, created_at } = newPostPacket[0];
                this.id = id;
                this.created_at = created_at;

                const postTagsArray = this.tags.map((tag) => {
                    return [this.id, tag.tag_id];
                });
                const postAudienceArray = this.audience.map((user_id) => {
                    return [this.id, user_id];
                });
                const postMentionsArray = this.mentioned_users.map(
                    (user_id) => {
                        return [this.id, user_id];
                    }
                );

                // insert into post_tag
                if (postTagsArray.length > 0) {
                    await conn.query(
                        "INSERT INTO post_tag (post_id, tag_id) VALUES ?",
                        [postTagsArray]
                    );
                }
                // insert into post_audience_list
                if (postAudienceArray.length > 0) {
                    await conn.query(
                        "INSERT INTO post_audience_list (post_id, user_id) VALUES ?",
                        [postAudienceArray]
                    );
                }
                // insert into mention_user table
                if (postMentionsArray.length > 0) {
                    await conn.query(
                        "INSERT INTO mention_user (post_id, user_id) VALUES ?",
                        [postMentionsArray]
                    );
                }
            }
            // commit transaction
            await conn.query("COMMIT");
            return true;
        } catch (error) {
            await conn.query("ROLLBACK");
            console.log(error);
            return false;
        } finally {
            await conn.release();
        }
    }

    // returns array
    // cols is an array of columns to be selected from db
    static async find(cols, filter) {
        const colsClause = db.translateCols(cols);
        let query;
        const { whereClause, args } = db.translateFilter(filter);
        query = `select ${colsClause} from post ${whereClause}`;
        const [result] = await db.pool.query(query, args);
        return result;
    }

    static async getSharedData(post_id) {
        const [
            {
                user_id: shared_post_user_id,
                content: shared_post_content,
                created_at: shared_post_created_at,
            },
        ] = await Post.find(["user_id", "content", "created_at"], {
            id: post_id,
        });
        const [
            {
                username: shared_post_username,
                user_profile_pic: shared_post_user_profile_pic,
            },
        ] = await User.find(["username", "user_profile_pic"], {
            id: shared_post_user_id,
        });
        return {
            id: post_id,
            user_id: shared_post_user_id,
            content: shared_post_content,
            created_at: shared_post_created_at,
            username: shared_post_username,
            profile_pic_url: User.generatePictureUrl({
                has_profile: shared_post_user_profile_pic == 1,
                id: shared_post_user_id,
            }),
        };
    }
}

module.exports = Post;
