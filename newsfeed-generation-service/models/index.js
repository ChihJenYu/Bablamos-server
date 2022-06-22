const db = require("../mysql");
const Post = require("../../models/post");
// AFFINITY
const MESSAGE_WEIGHT = 4;
const MENTION_WEIGHT = 3;
const COMMENT_WEIGHT = 2;
const LIKE_WEIGHT = 1;

// EDGE WEIGHT
const EDGE_TAG_WEIGHT = 4;
const POP_WEIGHT = 2;
const EDGE_TYPE_WEIGHT = 1;
const ENV = "dev"; // in dev query from friendship instead of followship

// getUserIds({type: "all"})
// getUserIds({type: "get_followers", user_id: post_author_user_id})
// getUserIds({type: "get_followings", user_id: user_id})
const getUserIds = async (arg) => {
    const { type, user_id } = arg;
    let userIds;
    switch (type) {
        case "all":
            [userIds] = await db.pool.query(`SELECT DISTINCT id FROM user`);
            return userIds;
        case "get_followers":
            [userIds] = await db.pool.query(
                `SELECT DISTINCT user_id as id
                FROM ${ENV == "dev" ? "friendship" : "followship"}
                WHERE ${
                    ENV == "dev" ? "friend_userid" : "following_userid"
                } = ?`,
                [user_id]
            );
            return userIds;
        case "get_followings":
            [userIds] = await db.pool.query(
                `SELECT DISTINCT ${
                    ENV == "dev" ? "friend_userid" : "following_userid"
                } as id
                FROM ${ENV == "dev" ? "friendship" : "followship"}
                WHERE user_id = ?`,
                [user_id]
            );
            return userIds;
    }
};

// refetch a user's entire news feed without ordering by edge rank score
const refreshFeed = async (user_id) => {
    const feedMentionedUsersTable = {};
    const feedPhotoCountTable = {};
    const feedTagsTable = {};

    const [allFeeds] = await db.pool.query(
        `select lc.id, lc.user_id, u.user_profile_pic, u.username, lc.content, unix_timestamp(lc.created_at) as created_at, lc.audience_type_id, lc.shared_post_id, lc.like_count, cc.comment_count, sc.share_count
                from 
                (
                select 
                    post.id, post.user_id, post.content, post.created_at, post.audience_type_id, post.shared_post_id, 
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
                    left join (select distinct shared_post_id, count(*) as count from post group by shared_post_id) share_view on p.id = share_view.shared_post_id
                ) sc on post.id = sc.id
                where post.user_id in (select friend_userid from friendship where user_id = ?)
                group by post.id, sc.share_count
                order by post.created_at desc
                ) as sc on cc.id = sc.id
                join 
                user u on lc.user_id = u.id
                `,
        [user_id, user_id, user_id]
    );
    const [allFeedsMentionedUsers] = await db.pool.query(
        `select mu.post_id as post_id, mu.user_id as mentioned_user_id, u.username, u.user_profile_pic
                from mention_user mu
                join post p
                on mu.post_id = p.id
                join user u
                on u.id = mu.user_id
                where p.user_id in (select friend_userid from friendship where user_id = ?)
                `,
        [user_id]
    );
    const [allFeedsPhotoCount] = await db.pool.query(
        `select p.id as post_id, p.photo_count from post p
                where p.user_id in (select friend_userid from friendship where user_id = ?)`,
        [user_id]
    );
    // const allFeedsPhotoUrls = allFeedsPhotoCount.map(post_id_photo_count => {
    //     return {photo_url: }
    // })

    const [allFeedsTags] = await db.pool.query(
        `select p.id as post_id, pt.tag_id, t.name as tag_name from post_tag pt
                join post p on p.id = pt.post_id
                join tag t on t.id = pt.tag_id
                where p.user_id in (select friend_userid from friendship where user_id = ?)
                `,
        [user_id]
    );

    // each of the following table looks like
    // { post_id: [{ id, content }, { id, content }, ...] }
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

    return {
        allFeeds,
        feedMentionedUsersTable,
        feedPhotoCountTable,
        feedTagsTable,
    };
};

const getLatestComments = async (post_id, comment_count) => {
    const [latestComments] = await db.pool.query(
        `select c.id, c.user_id, c.content, unix_timestamp(c.created_at) as created_at, c.level, c.replied_comment_id, u.username, u.user_profile_pic 
        from comment c join user u on c.user_id = u.id
        where post_id = ? and level = 1 order by created_at asc limit ?`,
        [post_id, comment_count]
    );
    return latestComments;
};

const calcOutgoingLikesOnUserEventfulEdge = async (
    my_user_id,
    other_user_id
) => {
    const [outgoingOnEventfulEdge] = await db.pool.query(
        `select count(*) as like_count from
        (select * from like_user where user_id = ?) post_like_user
        join post p on post_like_user.post_id = p.id
        where p.user_id = ?`,
        [my_user_id, other_user_id]
    );
    const outgoingLikeOnEventfulEdge = outgoingOnEventfulEdge[0].like_count;
    return outgoingLikeOnEventfulEdge;
};

const calcIncomingLikesOnMyEventfulEdge = async (my_user_id, other_user_id) => {
    const [incomingOnEventfulEdge] = await db.pool.query(
        `select count(*) as like_count from
        (select * from like_user where user_id = ?) post_like_user
        join post p on post_like_user.post_id = p.id
        where p.user_id = ?`,
        [other_user_id, my_user_id]
    );
    const incomingLikeOnEventfulEdge = incomingOnEventfulEdge[0].like_count;
    return incomingLikeOnEventfulEdge;
};

const calculateAffinity = async (my_user_id, other_user_id) => {
    const outgoing = await calcOutgoingLikesOnUserEventfulEdge(
        my_user_id,
        other_user_id
    );
    const incoming = await calcIncomingLikesOnMyEventfulEdge(
        my_user_id,
        other_user_id
    );
    return LIKE_WEIGHT * (outgoing * 4 + incoming * 2);
};

const calcAvgWeightOnEventfulEdge = async (my_user_id, post_id) => {
    const [averageWeightOnEventfulEdge] = await db.pool.query(
        `select avg(parent.weight) as avg_weight from (
                    select pt.tag_id, utw.weight from post_tag pt
                    join user_tag_weight utw on pt.tag_id = utw.tag_id
                    where utw.user_id = ? and pt.post_id = ?) parent
                    `,
        [my_user_id, post_id]
    );
    const averageWeight = +averageWeightOnEventfulEdge[0].avg_weight;
    return averageWeight;
};

const calculateEdgeWeight = async (feed, my_user_id, post_id) => {
    // EDGE WEIGHT
    // edge type
    const edgeTypeScore = feed.shared_post_id ? 3 : 4;

    // pop weight
    // like count of this feedItem
    const likeCount = feed.like_count;

    // comment count of this feedItem
    const commentCount = feed.comment_count;

    // share count of this feedItem
    const shareCount = feed.share_count;

    // average edge tag weight of this user for this feed item
    const averageWeight = await calcAvgWeightOnEventfulEdge(
        my_user_id,
        post_id
    );

    return (
        EDGE_TYPE_WEIGHT * edgeTypeScore +
        POP_WEIGHT * (shareCount * 3 + commentCount * 2 + likeCount * 1) +
        EDGE_TAG_WEIGHT * averageWeight
    );
};

const calcTimeDecayFactor = (feed) => {
    const feedCreatedAtUnix = feed.created_at;
    const nowUnix = Date.now() / 1000;
    const timeDiff = nowUnix - feedCreatedAtUnix;
    if (timeDiff < 60 * 10) {
        return 0.01;
    } else if ((timeDiff >= 60 * 10) & (timeDiff < 60 * 60)) {
        return 1.1;
    } else if ((timeDiff >= 60 * 60 * 1) & (timeDiff < 60 * 60 * 6)) {
        return 1.2;
    } else if ((timeDiff >= 60 * 60 * 6) & (timeDiff < 60 * 60 * 24)) {
        return 1.3;
    } else {
        const daysPassed = Math.floor(timeDiff / (60 * 60 * 24));
        return 1.4 * Math.pow(1.01, daysPassed);
    }
};

const calcEdgeRankScore = (af, ew, td) => (af + ew) / td;

module.exports = {
    getUserIds,
    refreshFeed,
    getLatestComments,
    calcOutgoingLikesOnUserEventfulEdge,
    calcIncomingLikesOnMyEventfulEdge,
    calculateAffinity,
    calcAvgWeightOnEventfulEdge,
    calculateEdgeWeight,
    calcTimeDecayFactor,
    calcEdgeRankScore,
};
