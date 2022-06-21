const db = require("../mysql");
const Edge = require("./edge");

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
        photo_urls, // array; optional
        created_at, // optional
    }) {
        super({
            id,
            edge_type: "eventful_edge",
            user_id,
            content,
            mentioned_users,
            photo_urls,
            created_at,
        });
        this.audience_type_id = audience_type_id;
        this.audience = audience || [];
        this.shared_post_id = shared_post_id || null;
        this.tags = tags || [];
    }

    static async delete(id) {
        await db.pool.query(`DELETE FROM post WHERE id = ?`, [id]);
        return true;
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
                const postPhotosArray = this.photo_urls.map((photo_url) => {
                    return [this.id, photo_url];
                });
                const postMentionsArray = this.mentioned_users.map(
                    (user_id) => {
                        return [this.id, user_id];
                    }
                );

                // is update
                await conn.query(
                    `UPDATE post SET content = ?, audience_type_id = ?, shared_post_id = ? WHERE  id = ?`,
                    [
                        this.content,
                        this.audience_type_id,
                        this.shared_post_id,
                        this.id,
                    ]
                );
                // update post_tag
                if (postTagsArray.length > 0) {
                    await conn.query(
                        "DELETE FROM post_tag WHERE post_id = ?; INSERT INTO post_tag (post_id, tag_id) VALUES ?",
                        [this.id, postTagsArray]
                    );
                }
                // update post_audience_list
                if (postAudienceArray.length > 0) {
                    await conn.query(
                        "DELETE FROM post_audience_list WHERE post_id = ?; INSERT INTO post_audience_list (post_id, user_id) VALUES ?",
                        [this.id, postAudienceArray]
                    );
                }
                // update post_photo table
                if (postPhotosArray.length > 0) {
                    await conn.query(
                        "DELETE FROM edge_photo WHERE post_id = ?; INSERT INTO edge_photo (post_id, photo_url) VALUES ?",
                        [this.id, postPhotosArray]
                    );
                }
                // update mention_user table
                if (postMentionsArray.length > 0) {
                    await conn.query(
                        "DELETE FROM mention_user WHERE post_id = ?; INSERT INTO mention_user (post_id, user_id) VALUES ?",
                        [this.id, postMentionsArray]
                    );
                }
            } else {
                // is insert
                const [{ insertId: post_id }] = await conn.query(
                    `INSERT INTO post
                (user_id, content, audience_type_id, shared_post_id)
                VALUES (?, ?, ?, ?)`,
                    [
                        this.user_id,
                        this.content,
                        this.audience_type_id,
                        this.shared_post_id,
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
                const postPhotosArray = this.photo_urls.map((photo_url) => {
                    return [this.id, photo_url];
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
                // insert into post_photo table
                if (postPhotosArray.length > 0) {
                    await conn.query(
                        "INSERT INTO edge_photo (post_id, photo_url) VALUES ?",
                        [postPhotosArray]
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
}

module.exports = Post;
