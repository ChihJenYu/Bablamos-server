const db = require("../mysql");
const Edge = require("./edge");

class Comment extends Edge {
    constructor({
        id,
        post_id,
        user_id,
        content,
        level, // 1 if not specified
        replied_comment_id, // optional
        mentioned_users, // array; optional,
        photo_urls, // array; optional
        created_at, // optional
    }) {
        super({
            id,
            edge_type: "comment",
            user_id,
            content,
            mentioned_users,
            photo_urls,
            created_at,
        });
        this.post_id = post_id;
        this.level = level || 1;
        this.replied_comment_id = replied_comment_id || null;
    }

    static async delete(id) {
        await db.pool.query(`DELETE FROM comment WHERE id = ?`, [id]);
        return true;
    }

    async save() {
        const conn = await db.pool.getConnection();
        try {
            await conn.query("START TRANSACTION");
            if (this.id) {
                // update
                const postMentionsArray = this.mentioned_users.map(
                    (user_id) => {
                        return [this.id, user_id];
                    }
                );
                await conn.query(
                    `UPDATE comment SET content = ?
                WHERE id = ?`,
                    [this.content, this.id]
                );

                await conn.query(
                    `DELETE FROM mention_user WHERE comment_id = ?; INSERT INTO mention_user (comment_id, user_id) VALUES ?`,
                    [this.id, postMentionsArray]
                );
                await conn.query("COMMIT");
                return true;
            } else {
                const [{ insertId: comment_id }] = await conn.query(
                    `INSERT INTO comment
            (post_id, user_id, content, level, replied_comment_id)
            VALUES (?, ?, ?, ?, ?)`,
                    [
                        this.post_id,
                        this.user_id,
                        this.content,
                        this.level,
                        this.replied_comment_id,
                    ]
                );

                const [newCommentPacket] = await conn.query(
                    `SELECT id, unix_timestamp(created_at) 
                as created_at FROM comment WHERE id = 
                ?`,
                    [comment_id]
                );

                const { id, created_at } = newCommentPacket[0];
                this.id = id;
                this.created_at = created_at;

                const postMentionsArray = this.mentioned_users.map(
                    (user_id) => {
                        return [this.id, user_id];
                    }
                );

                await conn.query(
                    `INSERT INTO mention_user (comment_id, user_id) VALUES ?`,
                    [postMentionsArray]
                );

                // commit transaction
                await conn.query("COMMIT");
                return true;
            }
        } catch (error) {
            await conn.query("ROLLBACK");
            console.log(error);
            return false;
        } finally {
            await conn.release();
        }
    }

    static async find(cols, filter, fat = false) {
        const colsClause = db.translateCols(cols);
        let query;
        const { whereClause, args } = db.translateFilter(filter);
        query = `select ${colsClause} from comment ${whereClause}`;
        const [result] = await db.pool.query(query, args);
        return result;
    }
}

module.exports = Comment;
