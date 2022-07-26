const db = require("../mysql");
const Post = require("./post");
const User = require("./user");
const PERSONAL_FEEDS_DEFAULT_PAGE_SIZE = 10;
const COMMENT_PAGE_SIZE = 3;
class Feed extends Post {
    constructor({
        id, // required
        user_id, // required
        username, // required
        content, // required
        created_at, // required
        user_profile_pic,
        shared_post_id,
        like_count,
        comment_count,
        share_count,
        latest_comments,
        already_liked,
    }) {
        super({
            id,
            user_id,
            content,
            shared_post_id, // optional
            created_at, // optional
        });
        this.username = username;
        this.like_count = like_count || 0;
        this.comment_count = comment_count || 0;
        this.share_count = share_count || 0;
        this.latest_comments = latest_comments || [];
        this.user_profile_pic = user_profile_pic || 0;
        this.already_liked = already_liked == 1 ? 1 : 0;
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

    static async attachFeedAddData(feed, user_asking) {
        const newFeed = new Feed({
            ...feed,
        });
        const { latestComments, next } = await Feed.getLatestComments(
            newFeed.id,
            COMMENT_PAGE_SIZE,
            user_asking
        );
        newFeed.latest_comments = latestComments;
        if (next) {
            newFeed.comments_next_paging = next;
        }
        newFeed.profile_pic_url = User.generatePictureUrl({
            has_profile: newFeed.user_profile_pic == 1,
            id: newFeed.user_id,
        });
        if (newFeed.shared_post_id) {
            newFeed.shared_post_data = await Post.getSharedData(
                newFeed.shared_post_id
            );
        }
        return newFeed;
    }

    // returns array of feed instances posted by a particular user_id
    static async findByAuthorId(user_id, user_asking, paging) {
        const [allFeeds] = await db.pool.query(
            `select
            lc.id, lc.user_id, u.username, u.user_profile_pic, 
            lc.content, unix_timestamp(lc.created_at) as created_at,
             lc.shared_post_id, lc.like_count, 
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
                post.shared_post_id, count(lu.user_id) as like_count
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
        const newsfeedToReturn = [];
        for (let feed of allFeeds) {
            const newFeed = await Feed.attachFeedAddData(feed);
            newsfeedToReturn.push(newFeed);
        }
        return newsfeedToReturn;
    }

    // returns array of feed instances posted by all friends of a particular user_id
    // get all; no paging
    // does not require already_liked
    static async findByViewer(user_id) {
        let [newsfeedToReturn] = await db.pool.query(
            `select
                lc.id, lc.user_id, u.username, u.user_profile_pic, 
                lc.content, unix_timestamp(lc.created_at) as created_at,
                lc.shared_post_id, lc.like_count, 
                cc.comment_count, sc.share_count
            from 
            (
            select 
                post.id, post.user_id, post.content, post.created_at, 
                post.shared_post_id, count(lu.user_id) as like_count
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
            order by lc.created_at DESC
            `,
            [user_id, user_id, user_id]
        );
        return newsfeedToReturn;
    }

    // returns array of feed instances from a given array of post ids
    static async getFeedsDetail(post_ids, user_asking) {
        if (!post_ids || post_ids.length === 0) {
            return null;
        }
        let orderByList = "";
        ["lc.id", ...post_ids].forEach((el) => {
            orderByList += el + ", ";
        });
        orderByList = orderByList.substring(0, orderByList.length - 2);
        let [allFeeds] = await db.pool.query(
            `select lc.id, lc.user_id, u.username, u.user_profile_pic, 
            lc.content, unix_timestamp(lc.created_at) as created_at,
            lc.shared_post_id, lc.like_count, 
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
                post.shared_post_id,
                count(lu.user_id) as like_count
            from post 
            left join like_user lu on post.id = lu.post_id
            where post.id in (?)
            group by post.id
            order by post.created_at desc
            ) as lc
            join 
            (
            select 
                post.id, count(c.id) as comment_count
            from post 
            left join comment c on post.id = c.post_id
            where post.id in (?)
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
            where post.id in (?)
            group by post.id, sc.share_count
            order by post.created_at desc
            ) as sc on cc.id = sc.id
            ${
                user_asking
                    ? `left join 
                        (
                        select post_id from like_user where user_id = ?
                        ) as al
                        on lc.id = al.post_id`
                    : ""
            }
            order by FIELD(${orderByList})
            `,
            user_asking
                ? [post_ids, post_ids, post_ids, user_asking]
                : [post_ids, post_ids, post_ids]
        );
        if (allFeeds.length === 0) {
            return null;
        }

        const newsfeedToReturn = [];
        for (let feed of allFeeds) {
            const feedDetail = await Feed.attachFeedAddData(feed, user_asking);
            newsfeedToReturn.push(feedDetail);
        }
        return newsfeedToReturn;
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
                ? [user_asking, post_id, comment_count + 1]
                : [post_id, comment_count + 1]
        );
        latestComments = latestComments.map((comment) => {
            return {
                ...comment,
                profile_pic_url: User.generatePictureUrl({
                    has_profile: comment.user_profile_pic == 1,
                    id: comment.user_id,
                }),
            };
        });
        if (latestComments.length > comment_count) {
            return {
                latestComments: latestComments.slice(
                    0,
                    latestComments.length - 1
                ),
                next: 1,
            };
        }
        return {
            latestComments,
        };
    }
}

module.exports = Feed;
