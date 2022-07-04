const db = require("../mysql");
const bcrypt = require("bcrypt");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const SALT_ROUNDS = 10;
const JWT_EXPIRE = "365d";
const CLOUDFRONT_DOMAIN_NAME = "https://d3h0a68hsbn5ed.cloudfront.net";
const DEFAULT_FRIENDS_PAGE_SIZE = 20;
const PROFILE_FRIENDS_PAGE_SIZE = 9;
const FRIENDS_SUGGESTIONS = 5;
// const FRIENDS
class User {
    // password is raw; hashing occurs in save method
    constructor({
        id,
        username,
        email,
        password,
        user_profile_pic,
        user_cover_pic,
        allow_stranger_follow,
        info,
    }) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.password = password;
        this.user_profile_pic = user_profile_pic || 0;
        this.user_cover_pic = user_cover_pic || 0;
        this.allow_stranger_follow = allow_stranger_follow || 0;
        this.info = info || null;
    }

    static generatePictureUrl({ has_profile, id }) {
        return has_profile
            ? CLOUDFRONT_DOMAIN_NAME + `/user/${id}/profile.jpg`
            : CLOUDFRONT_DOMAIN_NAME + `/user/default.jpg`;
    }

    static generateCoverUrl({ has_cover, id }) {
        return has_cover
            ? CLOUDFRONT_DOMAIN_NAME + `/user/${id}/cover.jpg`
            : CLOUDFRONT_DOMAIN_NAME + `/user/default-cover.jpg`;
    }

    // return the user packets
    static async find(cols, filter, page_size) {
        const colsClause = db.translateCols(cols);
        let query;
        let { whereClause, args } = db.translateFilter(filter);
        query = `select ${colsClause} from user ${whereClause} ${
            page_size ? "LIMIT ?, ?" : ""
        }`;
        if (page_size) {
            args.push(0);
            args.push(page_size);
        }
        const [result] = await db.pool.query(query, args);
        return result;
    }

    // returns User object and its id in db with matching email and password
    static async findByCredentials({ email, password }) {
        // find matching email
        try {
            const packet = await User.find(null, { email });
            if (packet.length === 0) {
                return null;
            } else {
                // then validate password
                const queryUser = packet[0];
                const hashedPassword = queryUser.password;
                const isMatch = await bcrypt.compare(password, hashedPassword);
                if (!isMatch) {
                    return null;
                } else {
                    return queryUser;
                }
            }
        } catch (e) {
            throw e;
        }
    }

    // returns decrypted payload
    static validateAuthToken(token) {
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
            if (!payload) {
                return null;
            } else {
                return payload;
            }
        } catch (e) {
            throw new Error("Auth failed");
        }
    }

    // payload contains {id, username, email, profile_pic_url, allow_stranger_follow}
    static staticGenerateAuthToken({
        id,
        username,
        email,
        user_profile_pic,
        allow_stranger_follow,
    }) {
        try {
            const token = jwt.sign(
                {
                    id,
                    username,
                    email,
                    profile_pic_url: User.generatePictureUrl({
                        has_profile: user_profile_pic == 1,
                        id,
                    }),
                    allow_stranger_follow,
                },
                process.env.JWT_SECRET_KEY,
                {
                    expiresIn: JWT_EXPIRE,
                }
            );
            return { token, expire: JWT_EXPIRE };
        } catch (e) {
            console.log(e);
            throw new Error("Could not generate token");
        }
    }

    // instance methods
    // returns token and expired time
    // payload contains {id, username, email, profile_pic_url, allow_stranger_follow}
    generateAuthToken(id) {
        try {
            const token = jwt.sign(
                {
                    id,
                    username: this.username,
                    email: this.email,
                    profile_pic_url: User.generatePictureUrl({
                        has_profile: this.user_profile_pic == 1,
                        id,
                    }),
                    allow_stranger_follow: this.allow_stranger_follow,
                },
                process.env.JWT_SECRET_KEY,
                {
                    expiresIn: JWT_EXPIRE,
                }
            );
            return { token, expire: JWT_EXPIRE };
        } catch (e) {
            throw new Error("Could not generate token");
        }
    }

    async save(update) {
        if (this.id) {
            // is update
            const ALLOWED_UPDATE_COLS = [
                "allow_stranger_follow",
                "user_profile_pic",
                "user_cover_pic",
                "info",
            ];
            for (let col of Object.keys(update)) {
                if (!ALLOWED_UPDATE_COLS.includes(col)) {
                    console.log(col);
                    throw new Error("Invalid update argument");
                }
            }
            let { setClause, args } = db.translateUpdate(update);
            await db.pool.query(
                `UPDATE user ${setClause} WHERE id = ?`,
                args.concat([this.id])
            );
            return;
        }
        if (!validator.isEmail(this.email)) {
            throw new Error("Invalid email");
        }

        const hashedPassword = await bcrypt.hash(this.password, SALT_ROUNDS);
        this.password = hashedPassword;
        const query = `INSERT INTO user (username, email, password, user_profile_pic, user_cover_pic, allow_stranger_follow, info) VALUES (?, ?, ?, ?, ?, ?)`;
        const [{ insertId: user_id }] = await db.pool.query(query, [
            this.username,
            this.email,
            this.password,
            this.user_profile_pic,
            this.user_cover_pic,
            this.allow_stranger_follow,
            this.info,
        ]);
        return user_id;
    }

    // action = ('accept','send','receive')
    // auto-follows upon friend accept
    static async befriend({
        outgoing_user_id,
        friend_userid,
        outgoing_action,
    }) {
        let outgoingStatus = "";
        let friendStatus = "";
        switch (outgoing_action) {
            case "accept":
                outgoingStatus = "accepted";
                friendStatus = "accepted";
                break;
            // this case shouldn't happen
            case "receive":
                outgoingStatus = "received";
                friendStatus = "sent";
                break;
            case "send":
                outgoingStatus = "sent";
                friendStatus = "received";
                break;
        }
        let args = [
            outgoing_user_id,
            friend_userid,
            outgoingStatus,
            outgoingStatus,
            friend_userid,
            outgoing_user_id,
            friendStatus,
            friendStatus,
        ];
        if (outgoingStatus === "accepted") {
            args = args.concat([
                outgoing_user_id,
                friend_userid,
                friend_userid,
                friend_userid,
                outgoing_user_id,
                outgoing_user_id,
            ]);
        }
        await db.pool.query(
            `INSERT INTO friendship (user_id, friend_userid, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?;
            INSERT INTO friendship (user_id, friend_userid, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?;
            ${
                outgoingStatus === "accepted"
                    ? `INSERT INTO followship (user_id, following_userid) VALUES (?, ?) ON DUPLICATE KEY UPDATE following_userid = ?; 
                    INSERT INTO followship (user_id, following_userid) VALUES (?, ?) ON DUPLICATE KEY UPDATE following_userid = ?;`
                    : ""
            }`,
            args
        );
        return true;
    }

    // auto-drop follows
    static async unfriend({ outgoing_user_id, friend_userid }) {
        await db.pool.query(
            `DELETE FROM friendship WHERE user_id = ? AND friend_userid = ?;
            DELETE FROM friendship WHERE user_id = ? AND friend_userid = ?;
            DELETE FROM followship WHERE user_id = ? AND following_userid = ? AND EXISTS (SELECT * FROM user WHERE id = ? AND allow_stranger_follow = 0);
            DELETE FROM followship WHERE user_id = ? AND following_userid = ? AND EXISTS (SELECT * FROM user WHERE id = ? AND allow_stranger_follow = 0);`,
            [
                outgoing_user_id,
                friend_userid,
                friend_userid,
                outgoing_user_id,
                outgoing_user_id,
                friend_userid,
                friend_userid,
                friend_userid,
                outgoing_user_id,
                outgoing_user_id,
            ]
        );
        return true;
    }

    // filters: user_id, friend_name (= or like), status
    static async findFriends(at_profile, filter, paging, mentionSuggestion) {
        let { user_id } = filter;
        if (!user_id) {
            throw new Error("Missing user_id");
        }
        let { whereClause, args } = db.translateFilter(filter);
        if (at_profile) {
            args = [
                ...args,
                PROFILE_FRIENDS_PAGE_SIZE * paging,
                PROFILE_FRIENDS_PAGE_SIZE,
            ];
        } else if (mentionSuggestion) {
            args = [...args, 0, FRIENDS_SUGGESTIONS];
        } else {
            args = [
                ...args,
                DEFAULT_FRIENDS_PAGE_SIZE * paging,
                DEFAULT_FRIENDS_PAGE_SIZE,
            ];
        }
        let [result] = await db.pool.query(
            `SELECT f.friend_userid as id, u.username as friend_name, u.user_profile_pic, u.allow_stranger_follow FROM friendship f
            JOIN user u on f.friend_userid = u.id
            ${whereClause} ORDER BY id DESC LIMIT ?, ?`,
            args
        );
        result = result.map((friend) => {
            return {
                ...friend,
                profile_pic_url: User.generatePictureUrl({
                    has_cover: friend.user_profile_pic == 1,
                    id: friend.id,
                }),
            };
        });
        return result;
    }

    // user info, allow_stranger_follow, friend_status, follow_status and friend count
    static async getUserInfo({ user_asking, user_in_question }) {
        const [result] = await db.pool.query(
            `select u.info as user_info, u.user_profile_pic, u.user_cover_pic, u.username, 
            sum(case when 
            f.status = "accepted" then 1 else 0 end) as friend_count,
            fsv.status as friend_status, 
            case when
                fls.following_userid is null
                then 0
                else 1
                end as follow_status, 
            u.allow_stranger_follow
            from user u 
            left join friendship f on u.id = f.user_id
            left join 
            (
                select status, user_id, friend_userid from friendship where user_id = ? and friend_userid = ?
            ) fsv
            on f.user_id = fsv.friend_userid
            left join 
            (
                select user_id, following_userid from followship where user_id = ? and following_userid = ?
            ) fls
            on f.user_id = fls.following_userid
            where u.id = ?
            group by u.id`,
            [
                user_asking,
                user_in_question,
                user_asking,
                user_in_question,
                user_in_question,
            ]
        );
        return result[0];
    }

    static async follow({ outgoing_user_id, following_userid }) {
        await db.pool.query(
            `INSERT INTO followship (user_id, following_userid) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id;`,
            [outgoing_user_id, following_userid]
        );
        return true;
    }

    static async unfollow({ outgoing_user_id, following_userid }) {
        await db.pool.query(
            `DELETE FROM followship WHERE user_id = ? and following_userid = ?`,
            [outgoing_user_id, following_userid]
        );
        return true;
    }

    static async findFollowings({ id, paging }) {
        const [result] = await db.pool.query(
            `SELECT DISTINCT following_userid as id FROM followship WHERE user_id = ? LIMIT ?, ?`,
            [id, DEFAULT_FRIENDS_PAGE_SIZE * paging, DEFAULT_FRIENDS_PAGE_SIZE]
        );
        return result;
    }

    static async findFollowers({ id, paging }) {
        const [result] = await db.pool.query(
            `SELECT DISTINCT user_id as id FROM followship WHERE following_userid = ? LIMIT ?, ?`,
            [id, DEFAULT_FRIENDS_PAGE_SIZE * paging, DEFAULT_FRIENDS_PAGE_SIZE]
        );
        return result;
    }

    // { type: "all", user_id_to_drop: undefined }
    // { type: "specific", user_id_to_drop: array }
    static async dropFollowers({ id, type, user_id_to_drop }) {
        if (type === "all") {
            await db.pool.query(
                `DELETE FROM followship WHERE following_userid = ?`,
                [id]
            );
        } else if (type === "specific") {
            await db.pool.query(
                `DELETE FROM followship WHERE following_userid = ? AND user_id in ?`,
                [id, user_id_to_drop]
            );
        }
        return true;
    }

    static async like({ type, user_id, post_id, comment_id }) {
        const edgeType = post_id ? "post" : "comment";
        const edge_id = post_id ? post_id : comment_id;
        if (type === "like") {
            await db.pool.query(
                `INSERT INTO like_user (${edgeType}_id, user_id) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE user_id = user_id`,
                [edge_id, user_id]
            );
            return;
        } else if (type === "unlike") {
            await db.pool.query(
                `DELETE FROM like_user WHERE ${edgeType}_id = ? and user_id = ?`,
                [edge_id, user_id]
            );
            return;
        }
    }
}

module.exports = User;
