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
        audience,
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
    // ugly method
    static async find({ user_id, paging }) {
        const feedMentionedUsersTable = {};
        const feedPhotoCountTable = {};
        const feedTagsTable = {};
        let [allFeeds] = await db.pool.query(
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
        const fetchedPostIds = allFeeds.map((feed) => {
            return feed.id;
        });
        const [allFeedsMentionedUsers] = await db.pool.query(
            `select mu.post_id as post_id, mu.user_id as mentioned_user_id, u.username, u.user_profile_pic
                from mention_user mu
                join post p
                on mu.post_id = p.id
                join user u
                on u.id = mu.user_id
                where p.user_id = ?
                and mu.post_id in (?)`,
            [user_id, fetchedPostIds]
        );
        const [allFeedsPhotoCount] = await db.pool.query(
            `select p.id as post_id, p.photo_count from post p
                where p.user_id = ? and p.id in (?)`,
            [user_id, fetchedPostIds]
        );
        const [allFeedsTags] = await db.pool.query(
            `select p.id as post_id, pt.tag_id, t.name as tag_name from post_tag pt
                join post p on p.id = pt.post_id
                join tag t on t.id = pt.tag_id
                where p.user_id = ? and p.id in (?)
                `,
            [user_id, fetchedPostIds]
        );

        allFeedsMentionedUsers.forEach((mentionedUser) => {
            if (!feedMentionedUsersTable[mentionedUser.post_id]) {
                feedMentionedUsersTable[mentionedUser.post_id] = [
                    {
                        user_id: mentionedUser.mentioned_user_id,
                        username: mentionedUser.username,
                        user_profile_pic: mentionedUser.user_profile_pic,
                    },
                ];
            } else {
                feedMentionedUsersTable[mentionedUser.post_id].push({
                    user_id: mentionedUser.mentioned_user_id,
                    username: mentionedUser.username,
                    user_profile_pic: mentionedUser.user_profile_pic,
                });
            }
        });
        allFeedsPhotoCount.forEach((feedPhoto) => {
            feedPhotoCountTable[feedPhoto.post_id] = feedPhoto.photo_count;
        });
        allFeedsTags.forEach((feedTag) => {
            if (!feedTagsTable[feedTag.post_id]) {
                feedTagsTable[feedTag.post_id] = [
                    {
                        id: feedTag.tag_id,
                        tag_name: feedTag.tag_name,
                    },
                ];
            } else {
                feedTagsTable[feedTag.post_id].push({
                    id: feedTag.tag_id,
                    tag_name: feedTag.tag_name,
                });
            }
        });

        let newsfeedToReturn = [];
        for (let feedItem of allFeeds) {
            const feed = new Feed(feedItem);
            const latestComments = await Feed.getLatestComments(feed.id, 10);
            feed.latest_comments = latestComments || [];
            feed.mentioned_users = feedMentionedUsersTable[feed.id] || [];
            feed.photo_count = feedPhotoCountTable[feed.id] || 0;
            feed.tags = feedTagsTable[feed.id] || [];
            newsfeedToReturn.push(feed);
        }

        return newsfeedToReturn;
    }

    static async getLatestComments(post_id, comment_count) {
        let [latestComments] = await db.pool.query(
            `select c.id, c.user_id, c.content, unix_timestamp(c.created_at) as created_at, c.level, c.replied_comment_id, u.username, u.user_profile_pic 
        from comment c join user u on c.user_id = u.id
        where post_id = ? and level = 1 order by created_at asc limit ?`,
            [post_id, comment_count]
        );
        return latestComments;
    }
}

module.exports = Feed;
