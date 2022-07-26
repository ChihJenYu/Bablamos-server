const db = require("../mysql");
const Edge = require("./edge");
class Comment extends Edge {
    constructor({
        id,
        post_id,
        user_id,
        content,
        replied_comment_id, // optional
        mentioned_users, // array; optional,
        photo_count, // default 0
        created_at, // optional
    }) {
        super({
            id,
            edge_type: "comment",
            user_id,
            content,
            photo_count,
            created_at,
        });
        this.mentioned_users = mentioned_users || [];
        this.post_id = post_id;
        this.replied_comment_id = replied_comment_id || null;
    }

    generatePhotoUrls() {
        let photoUrls = [];
        for (let i = 0; i < this.photo_count; i++) {
            photoUrls.push(
                `/user-media/${this.post_id}/add/${this.id}/${i}.jpg`
            );
        }
        return photoUrls;
    }

    static async getRandomComment() {
        const [randomComment] = await db.pool.query(
            "SELECT * FROM comment ORDER BY RAND() LIMIT 1"
        );
        return randomComment[0];
    }

    static async delete(id) {
        const conn = await db.pool.getConnection();
        try {
            await conn.query("START TRANSACTION");
            let [responseObject] = await conn.query(
                "SELECT * FROM comment WHERE id = ?",
                [id]
            );
            await db.pool.query(`DELETE FROM comment WHERE id = ?`, [id]);
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
                // update
                const commentMentionsArray = this.mentioned_users.map(
                    (user_id) => {
                        return [this.id, user_id];
                    }
                );
                await conn.query(
                    `UPDATE comment SET content = ? AND photo_count = ?
                WHERE id = ?`,
                    [this.content, this.photo_count, this.id]
                );

                if (commentMentionsArray.length !== 0) {
                    await conn.query(
                        `DELETE FROM mention_user WHERE comment_id = ?; INSERT INTO mention_user (comment_id, user_id) VALUES ?`,
                        [this.id, commentMentionsArray]
                    );
                }

                await conn.query("COMMIT");
                return true;
            } else {
                const [{ insertId: comment_id }] = await conn.query(
                    `INSERT INTO comment
            (post_id, user_id, content, photo_count, replied_comment_id)
            VALUES (?, ?, ?, ?, ?)`,
                    [
                        this.post_id,
                        this.user_id,
                        this.content,
                        this.photo_count,
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

                const commentMentionsArray = this.mentioned_users.map(
                    (user_id) => {
                        return [this.id, user_id];
                    }
                );

                if (commentMentionsArray.length !== 0) {
                    await conn.query(
                        `INSERT INTO mention_user (comment_id, user_id) VALUES ?`,
                        [commentMentionsArray]
                    );
                }

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

    static async find(cols, filter) {
        const colsClause = db.translateCols(cols);
        let query;
        const { whereClause, args } = db.translateFilter(filter);
        query = `select ${colsClause} from comment ${whereClause}`;
        const [result] = await db.pool.query(query, args);
        return result;
    }

    // with next_paging
    static async getComments({ post_id, paging, page_size, user_asking }) {
        let [comments] = await db.pool.query(
            `select c.id, c.user_id, c.content, unix_timestamp(c.created_at) as created_at, u.username, u.user_profile_pic, 
            sum(
                case when lu.user_id is null then 0 else 1 end
            ) as like_count, case when
                al.comment_id is null
                then 0
                else 1
                end as already_liked
            from comment c join user u on c.user_id = u.id
            left join like_user lu on c.id = lu.comment_id
            left join (
                        select comment_id from like_user where user_id = ?
                    ) as al on c.id = al.comment_id
            where c.post_id = ? group by c.id order by c.created_at desc limit ?, ?`,
            [user_asking, post_id, paging * page_size, page_size + 1]
        );
        return comments;
    }
}

module.exports = Comment;
