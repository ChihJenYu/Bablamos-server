const db = require("../mysql");
const Post = require("./post");
const PERSONAL_FEEDS_DEFAULT_PAGE_SIZE = 10;
class Feed extends Post {
    constructor({
        id, // required
        user_id, // required
        username, // required
        content, // required
        created_at, // required
        audience_type_id, // required
        shared_post_id,
        like_count,
        comment_count,
        share_count,
        latest_comments,
        mentioned_users,
        photo_count,
        tags,
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
    }
    static async find({ user_id, paging }) {
        const [allFeeds] = await db.pool.query(
            `select lc.id, lc.user_id, u.username, u.user_profile_pic, lc.content, unix_timestamp(lc.created_at) as created_at, lc.audience_type_id, lc.shared_post_id, lc.like_count, cc.comment_count, sc.share_count
                from 
                (
                select 
                    post.id, post.user_id, post.content, post.created_at, post.audience_type_id, post.shared_post_id, 
                    count(lu.user_id) as like_count
                from post 
                left join like_user lu on post.id = lu.post_id
                where post.user_id  = ?
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
                    left join (select distinct shared_post_id, count(*) as count from post group by shared_post_id) share_view on p.id = share_view.shared_post_id
                ) sc on post.id = sc.id
                where post.user_id = ?
                group by post.id, sc.share_count
                order by post.created_at desc
                ) as sc on cc.id = sc.id
                join 
                user u on lc.user_id = u.id
                order by created_at DESC LIMIT ?, ?`,
            [
                user_id,
                user_id,
                user_id,
                PERSONAL_FEEDS_DEFAULT_PAGE_SIZE * paging,
                PERSONAL_FEEDS_DEFAULT_PAGE_SIZE,
            ]
        );
        return allFeeds;
    }
}

module.exports = Feed
