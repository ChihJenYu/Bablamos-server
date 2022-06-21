const db = require("../mysql");

class Tag {
    constructor({
        name, // required
    }) {
        this.name = name;
    }

    // returns array
    static async find(filter) {
        let query;
        const { whereClause, args } = db.translateFilter(filter);
        query = `select * from tag ${whereClause}`;
        const [result] = await db.pool.query(query, args);
        return result;
    }

    // returns the new tag id
    async save() {
        const [{ insertId: tag_id }] = await db.pool.query(
            `INSERT INTO tag (name) VALUES ? ON DUPLICATE KEY UPDATE name = name
        `,
            [this.name]
        );
        return tag_id;
    }
}

module.exports = Tag;
