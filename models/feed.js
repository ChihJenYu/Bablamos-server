const db = require("../mysql");
const Post = require("./post");
const User = require("./user");
const PERSONAL_FEEDS_DEFAULT_PAGE_SIZE = 10;
class Feed extends Post {
    constructor({
        id, // required
        user_id, // required
        username, // required
        content, // required
        created_at, // required
        audience_type_id, // required
        user_profile_pic,
        audience,
        shared_post_id,
        like_count,
        comment_count,
        share_count,
        latest_comments,
        mentioned_users,
        photo_count,
        tags,
        is_new,
        already_liked,
    }) {
        super({
            id,
            user_id,
            content,
            audience_type_id,
            audience, // array of user_ids; optional
            shared_post_id, // optional
            tags, // array
            mentioned_users, // array; optional,
            photo_count, // array; optional
            created_at, // optional
        });
        this.username = username;
        this.like_count = like_count || 0;
        this.comment_count = comment_count || 0;
        this.share_count = share_count || 0;
        this.latest_comments = latest_comments || [];
        this.user_profile_pic = user_profile_pic || 0;
        this.is_new = is_new || false;
        this.already_liked = already_liked == 1 ? 1 : 0;
    }
    // returns array of feed instances posted by a particular user_id
    static async findByAuthorId(user_id, user_asking, paging) {
        let [allFeeds] = await db.pool.query(
            `select
            lc.id, lc.user_id, u.username, u.user_profile_pic, 
            lc.content, unix_timestamp(lc.created_at) as created_at, 
            lc.audience_type_id, lc.shared_post_id, pts.tags, pmu.mentioned_users, lc.photo_count, lc.like_count, 
            cc.comment_count, sc.share_count,
            case when
                al.post_id is null
                then 0
                else 1
                end as already_liked
            from 
            (
            select 
                post.id, post.user_id, post.content, post.created_at, 
                post.audience_type_id, post.shared_post_id, post.photo_count, 
                count(lu.user_id) as like_count
            from post 
            left join like_user lu on post.id = lu.post_id
            where post.user_id = ?
            group by post.id
            order by post.created_at desc
            ) as lc
            join 
            (
            select 
                post.id, count(c.id) as comment_count
            from post 
            left join comment c on post.id = c.post_id
            where post.user_id = ?
            group by post.id
            order by post.created_at desc
            ) as cc on lc.id = cc.id
            join 
            (
            select 
                post.id, sc.share_count
            from post 
            left join 
            (
                select distinct p.id, 
                case when 
                share_view.count is null
                then 0 
                else share_view.count
                end as share_count
                from post p 
                left join (select distinct shared_post_id, 
                count(*) as count from post group by shared_post_id) share_view 
                on p.id = share_view.shared_post_id
            ) sc on post.id = sc.id
            where post.user_id = ?
            group by post.id, sc.share_count
            order by post.created_at desc
            ) as sc on cc.id = sc.id
            join 
            user u on lc.user_id = u.id
            left join
            (
            SELECT pt.post_id AS id, JSON_ARRAYAGG(
                JSON_OBJECT('tag_name', t.name, 'tag_id', t.id)
            ) AS tags 
            FROM post_tag pt
            JOIN tag t ON pt.tag_id = t.id
            GROUP BY post_id
            ) as pts on cc.id = pts.id
            left join 
            (
            SELECT mu.post_id, JSON_ARRAYAGG(
            JSON_OBJECT
                (
                'username', u.username, 
                'user_profile_pic', u.user_profile_pic,
                'user_id', u.id
                )
            ) AS mentioned_users
            FROM mention_user mu
            JOIN user u ON mu.user_id = u.id
            GROUP BY mu.post_id
            ) pmu on pmu.post_id = cc.id
            left join 
            (
            select post_id from like_user where user_id = ?
            ) as al
            on lc.id = al.post_id
            order by lc.created_at DESC LIMIT ?, ?
            `,
            [
                user_id,
                user_id,
                user_id,
                user_asking,
                PERSONAL_FEEDS_DEFAULT_PAGE_SIZE * paging,
                PERSONAL_FEEDS_DEFAULT_PAGE_SIZE,
            ]
        );
        let newsfeedToReturn = [];
        for (let i = 0; i < allFeeds.length; i++) {
            const feed = allFeeds[i];
            const newFeed = new Feed({
                ...feed,
                tags: feed.tags || [],
                mentioned_users: feed.mentioned_users || [],
            });
            const latestComments = await Feed.getLatestComments(
                feed.id,
                10,
                user_asking
            );
            newFeed.latest_comments = latestComments || [];
            newsfeedToReturn.push(newFeed);
        }
        return newsfeedToReturn;
    }

    // returns array of feed instances posted by all friends of a particular user_id
    // get all; no paging
    // does not require already_liked
    static async findByViewer(user_id) {
        let [allFeeds] = await db.pool.query(
            `select
            lc.id, lc.user_id, u.username, u.user_profile_pic, 
            lc.content, unix_timestamp(lc.created_at) as created_at, 
            lc.audience_type_id, lc.shared_post_id, pts.tags, pmu.mentioned_users, lc.photo_count, lc.like_count, 
            cc.comment_count, sc.share_count
            from 
            (
            select 
                post.id, post.user_id, post.content, post.created_at, 
                post.audience_type_id, post.shared_post_id, post.photo_count, 
                count(lu.user_id) as like_count
            from post 
            left join like_user lu on post.id = lu.post_id
            where post.user_id in (select friend_userid from friendship where user_id = ?)
            group by post.id
            order by post.created_at desc
            ) as lc
            join 
            (
            select 
                post.id, count(c.id) as comment_count
            from post 
            left join comment c on post.id = c.post_id
            where post.user_id in (select friend_userid from friendship where user_id = ?)
            group by post.id
            order by post.created_at desc
            ) as cc on lc.id = cc.id
            join 
            (
            select 
                post.id, sc.share_count
            from post 
            left join 
            (
                select distinct p.id, 
                case when 
                share_view.count is null
                then 0 
                else share_view.count
                end as share_count
                from post p 
                left join (select distinct shared_post_id, 
                count(*) as count from post group by shared_post_id) share_view 
                on p.id = share_view.shared_post_id
            ) sc on post.id = sc.id
            where post.user_id in (select friend_userid from friendship where user_id = ?)
            group by post.id, sc.share_count
            order by post.created_at desc
            ) as sc on cc.id = sc.id
            join 
            user u on lc.user_id = u.id
            left join
            (
            SELECT pt.post_id AS id, JSON_ARRAYAGG(
                JSON_OBJECT('tag_name', t.name, 'tag_id', t.id)
            ) AS tags 
            FROM post_tag pt
            JOIN tag t ON pt.tag_id = t.id
            GROUP BY post_id
            ) as pts on cc.id = pts.id
            left join 
            (
            SELECT mu.post_id, JSON_ARRAYAGG(
            JSON_OBJECT
                (
                'username', u.username, 
                'user_profile_pic', u.user_profile_pic,
                'user_id', u.id
                )
            ) AS mentioned_users
            FROM mention_user mu
            JOIN user u ON mu.user_id = u.id
            GROUP BY mu.post_id
            ) pmu on pmu.post_id = cc.id
            order by lc.created_at DESC
            `,
            [user_id, user_id, user_id, user_id]
        );
        let newsfeedToReturn = [];
        for (let i = 0; i < allFeeds.length; i++) {
            const feed = allFeeds[i];
            const newFeed = new Feed({
                ...feed,
                tags: feed.tags || [],
                mentioned_users: feed.mentioned_users || [],
            });
            const latestComments = await Feed.getLatestComments(feed.id, 10);
            newFeed.latest_comments = latestComments || [];
            newsfeedToReturn.push(newFeed);
        }
        return newsfeedToReturn;
    }

    // { metric: "like" || "comment" || "share" }
    static async getPopularity({ post_id, metric }) {
        let queryMetric = {};
        if (metric === "like") {
            queryMetric["column"] = `lc.id, lc.user_id, lc.like_count`;
            queryMetric["condition"] = `(
                select 
                    post.id, 
                    post.user_id,
                    count(lu.user_id) as like_count
                from post 
                left join like_user lu on post.id = lu.post_id
                where post.id = ?
                group by post.id
                order by post.created_at desc
                ) as lc`;
        } else if (metric === "comment") {
            queryMetric["column"] = `cc.id, cc.user_id, cc.comment_count`;
            queryMetric["condition"] = `(
                select 
                    post.id, post.user_id, count(c.id) as comment_count
                from post 
                left join comment c on post.id = c.post_id
                where post.id = ?
                group by post.id
                order by post.created_at desc
                ) as cc`;
        } else if (metric === "share") {
            queryMetric["column"] = `sc.id, sc.user_id, sc.share_count`;
            queryMetric["condition"] = `
                (
                select 
                    post.id, post.user_id, sc.share_count
                from post 
                left join 
                (
                    select distinct p.id, 
                    case when 
                    share_view.count is null
                    then 0 
                    else share_view.count
                    end as share_count
                    from post p 
                    left join (select distinct shared_post_id, 
                    count(*) as count from post group by shared_post_id) share_view 
                    on p.id = share_view.shared_post_id
                ) sc on post.id = sc.id
                where post.id = ?
                group by post.id, sc.share_count
                order by post.created_at desc
                ) as sc`;
        }
        let [popularity] = await db.pool.query(
            `select ${queryMetric.column}
            from 
            ${queryMetric.condition}
            `,
            [post_id]
        );
        return popularity[0];
    }

    static async getFeedDetail(post_id, user_asking) {
        let [feedDetail] = await db.pool.query(
            `select lc.id, lc.user_id, u.username, u.user_profile_pic, 
            lc.content, unix_timestamp(lc.created_at) as created_at, 
            lc.audience_type_id, lc.shared_post_id, pts.tags, pmu.mentioned_users, lc.photo_count, lc.like_count, 
            cc.comment_count, sc.share_count
            ${
                user_asking
                    ? `, 
            case when
                al.post_id is null
                then 0
                else 1
                end as already_liked`
                    : ""
            }
            from 
            (
            select 
                post.id, post.user_id, post.content, post.created_at, 
                post.audience_type_id, post.shared_post_id, post.photo_count, 
                count(lu.user_id) as like_count
            from post 
            left join like_user lu on post.id = lu.post_id
            where post.id = ?
            group by post.id
            order by post.created_at desc
            ) as lc
            join 
            (
            select 
                post.id, count(c.id) as comment_count
            from post 
            left join comment c on post.id = c.post_id
            where post.id = ?
            group by post.id
            order by post.created_at desc
            ) as cc on lc.id = cc.id
            join 
            user u on lc.user_id = u.id
            join 
            (

            select 
                post.id, sc.share_count
            from post 
            left join 
            (
                select distinct p.id, 
                case when 
                share_view.count is null
                then 0 
                else share_view.count
                end as share_count
                from post p 
                left join (select distinct shared_post_id, 
                count(*) as count from post group by shared_post_id) share_view 
                on p.id = share_view.shared_post_id
            ) sc on post.id = sc.id
            where post.id = ?
            group by post.id, sc.share_count
            order by post.created_at desc
            ) as sc on cc.id = sc.id
            left join 
            (
            SELECT pt.post_id AS id, JSON_ARRAYAGG(
                JSON_OBJECT('tag_name', t.name, 'tag_id', t.id)
            ) AS tags 
            FROM post_tag pt
            JOIN tag t ON pt.tag_id = t.id
            WHERE pt.post_id = ?
            GROUP BY pt.post_id
            ) as pts on cc.id = pts.id
            left join 
            (
            SELECT mu.post_id, JSON_ARRAYAGG(
            JSON_OBJECT
                (
                'username', u.username, 
                'user_profile_pic', u.user_profile_pic,
                'user_id', u.id
                )
            ) AS mentioned_users
            FROM mention_user mu
            JOIN user u ON mu.user_id = u.id
            WHERE mu.post_id = ?
            GROUP BY mu.post_id
            ) pmu on pmu.post_id = cc.id
            ${
                user_asking
                    ? `left join 
                        (
                        select post_id from like_user where user_id = ?
                        ) as al
                        on lc.id = al.post_id`
                    : ""
            }
            order by created_at DESC
            `,
            user_asking
                ? [post_id, post_id, post_id, post_id, post_id, user_asking]
                : [post_id, post_id, post_id, post_id, post_id]
        );
        if (feedDetail.length === 0) {
            return {};
        }
        const latestComments = await Feed.getLatestComments(
            post_id,
            10,
            user_asking
        );
        const feed = new Feed({
            ...feedDetail[0],
            latest_comments: latestComments || [],
            tags: feedDetail[0].tags || [],
            mentioned_users: feedDetail[0].mentioned_users || [],
        });
        return feed;
    }

    static async getLatestComments(post_id, comment_count, user_asking) {
        let [latestComments] = await db.pool.query(
            `select c.id, c.user_id, c.content, unix_timestamp(c.created_at) as created_at, u.username, u.user_profile_pic, 
            sum(
                case when lu.user_id is null then 0 else 1 end
            ) as like_count ${
                user_asking
                    ? `, case when
                al.comment_id is null
                then 0
                else 1
                end as already_liked`
                    : ""
            }
            from comment c join user u on c.user_id = u.id
            left join like_user lu on c.id = lu.comment_id
            ${
                user_asking
                    ? `left join (
                        select comment_id from like_user where user_id = ?
                    ) as al on c.id = al.comment_id`
                    : ""
            }
            
            where c.post_id = ? group by c.id order by c.created_at desc limit ?`,
            user_asking
                ? [user_asking, post_id, comment_count]
                : [post_id, comment_count]
        );
        return latestComments;
    }
}

module.exports = Feed;
