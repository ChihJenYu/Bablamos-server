const db = require("../mysql");
const NOTIFICATION_PAGE_SIZE = 10;
const User = require("../models/user");
class Notification {
    constructor({
        type_id,
        for_user_id,
        inv_post_id,
        inv_comment_id,
        inv_user_id,
    }) {
        this.type_id = type_id;
        this.for_user_id = for_user_id;
        this.inv_post_id = inv_post_id;
        this.inv_comment_id = inv_comment_id;
        this.inv_user_id = inv_user_id;
    }

    static async read({ user_id, notification_id }) {
        await db.pool.query(
            `UPDATE notification SET read_by_user = 1 WHERE id = ? and for_user_id = ?`,
            [notification_id, user_id]
        );
        return true;
    }

    async save() {
        const conn = await db.pool.getConnection();
        try {
            await conn.query("START TRANSACTION");

            // insert into notification parent table
            const [{ insertId: notification_id }] = await conn.query(
                `INSERT INTO notification (for_user_id, notification_type_id) VALUES (?, ?)
                `,
                [this.for_user_id, this.type_id]
            );

            // insert into notification detail table
            await conn.query(
                `INSERT INTO notification_detail (notification_id, inv_post_id, inv_comment_id, inv_user_id) VALUES (?, ?, ?, ?)
                `,
                [
                    notification_id,
                    this.inv_post_id,
                    this.inv_comment_id,
                    this.inv_user_id,
                ]
            );
            await conn.query("COMMIT");
            return notification_id;
        } catch (error) {
            await conn.query("ROLLBACK");
            console.log(error);
            return false;
        } finally {
            await conn.release();
        }
    }

    static async bulkSave({ type_id, for_user_ids, inv_post_id, inv_user_id }) {
        const conn = await db.pool.getConnection();
        try {
            await conn.query("START TRANSACTION");
            let parentInsertArgs = for_user_ids.map((for_user_id) => [
                for_user_id,
                type_id,
            ]);
            // insert into notification parent table
            const [{ insertId: notification_id }] = await conn.query(
                `INSERT INTO notification (for_user_id, notification_type_id) VALUES ?
                `,
                [parentInsertArgs]
            );

            let incrementedNotificationIds = [];
            for (
                let i = notification_id;
                i < notification_id + for_user_ids.length;
                i++
            ) {
                incrementedNotificationIds.push(i);
            }

            let detailInsertArgs = incrementedNotificationIds.map((not_id) => {
                return [not_id, inv_post_id, inv_user_id];
            });

            // insert into notification detail table
            await conn.query(
                `INSERT INTO notification_detail (notification_id, inv_post_id, inv_user_id) VALUES ?
                `,
                [detailInsertArgs]
            );
            await conn.query("COMMIT");
            return notification_id;
        } catch (error) {
            await conn.query("ROLLBACK");
            console.log(error);
            return false;
        } finally {
            await conn.release();
        }
    }

    // returns array
    static async find({ user_id, paging }) {
        let [result] = await db.pool.query(
            `select n.id, n.for_user_id, unix_timestamp(n.created_at) as created_at, n.read_by_user, n.notification_type_id,
            nd.inv_post_id, nd.inv_comment_id, nd.inv_user_id, u.username, u.user_profile_pic
            from notification n
            left join notification_detail nd
            on n.id = nd.notification_id
            join user u
            on nd.inv_user_id = u.id
            where n.for_user_id = ? 
            order by n.id desc
            limit ?, ?`,
            [user_id, paging * NOTIFICATION_PAGE_SIZE, NOTIFICATION_PAGE_SIZE]
        );
        result = result.map((not) => {
            return {
                ...not,
                profile_pic_url: User.generatePictureUrl({
                    has_profile: not.user_profile_pic == 1,
                    id: not.inv_user_id,
                }),
            };
        });
        return result;
    }

    static async getUnreadCount(user_id) {
        const [result] = await db.pool.query(
            `SELECT CASE WHEN COUNT(id) IS NULL THEN 0 ELSE COUNT(id) END AS unread_count FROM notification WHERE read_by_user = 0 AND for_user_id = ? GROUP BY for_user_id
            `,
            [user_id]
        );
        return result[0] ? result[0].unread_count : 0;
    }

    // returns array of deleted notification ids
    static async bulkDelete(filter) {
        const { inv_post_id, type_id, for_user_id, inv_user_id, read_by_user } =
            filter;
        const conn = await db.pool.getConnection();
        if (inv_post_id) {
            // remove every notification with this inv_post_id
            try {
                await conn.query("START TRANSACTION");
                await conn.query(
                    `DELETE n FROM notification n JOIN notification_detail nd on n.id = nd.notification_id WHERE inv_post_id = ?`,
                    [inv_post_id]
                );
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
        if (!read_by_user) {
            try {
                await conn.query("START TRANSACTION");
                await conn.query(
                    `DELETE n FROM notification n JOIN notification_detail nd on n.id = nd.notification_id WHERE n.for_user_id = ? and 
            nd.inv_user_id = ? and
            n.notification_type_id = ?`,
                    [for_user_id, inv_user_id, type_id]
                );
                await conn.query("COMMIT");
                return [];
            } catch (error) {
                await conn.query("ROLLBACK");
                console.log(error);
                return false;
            } finally {
                await conn.release();
            }
        }
        try {
            await conn.query("START TRANSACTION");
            await conn.query(
                `DELETE FROM notification WHERE updated_at < NOW() - INTERVAL 24 hour AND read_by_user = ?`, [read_by_user]);
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
}

module.exports = Notification;
