const db = require("../../mysql");

class OnlineUser {
    constructor({ user_id, socket_id }) {
        this.user_id = user_id;
        this.socket_id = socket_id;
    }

    static async delete({ user_id, socket_id }) {
        if (user_id) {
            await db.pool.query(`DELETE FROM online_user WHERE user_id = ?`, [
                user_id,
            ]);
        } else if (socket_id) {
            await db.pool.query(`DELETE FROM online_user WHERE socket_id = ?`, [
                socket_id,
            ]);
        }
        return true;
    }

    async save() {
        await db.pool.query(
            "INSERT INTO online_user (user_id, socket_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE socket_id = ?",
            [this.user_id, this.socket_id, this.socket_id]
        );
        return true;
    }

    static async find(cols, filter) {
        const colsClause = db.translateCols(cols);
        let query;
        const { whereClause, args } = db.translateFilter(filter);
        query = `select ${colsClause} from online_user ${whereClause}`;
        const [result] = await db.pool.query(query, args);
        return result;
    }
}

module.exports = OnlineUser;
