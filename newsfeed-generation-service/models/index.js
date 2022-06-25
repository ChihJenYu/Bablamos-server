const db = require("../mysql");
const { getValueOr } = require("../../utils/util");
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

// table of how many times each user id has liked my post
// type: eventful_edge, comment
const generateUserLikesTable = async () => {
    const userLikesTable = {};
    const [userLikes] = await db.pool.query(
        `select p.user_id as author_id, lu.user_id, 'eventful_edge' as type
        from post p join like_user lu on p.id = lu.post_id
        where p.user_id != lu.user_id
        union
        select c.user_id as author_id, lu.user_id, 'comment' as type
        from comment c join like_user lu on c.id = lu.comment_id
        where c.user_id != lu.user_id
        `
    );
    for (let userLikeUser of userLikes) {
        if (!userLikesTable[userLikeUser.author_id]) {
            userLikesTable[userLikeUser.author_id] = {};
            userLikesTable[userLikeUser.author_id][userLikeUser.user_id] = {};
            userLikesTable[userLikeUser.author_id][userLikeUser.user_id][
                userLikeUser.type
            ] = 1;
        } else {
            if (!userLikesTable[userLikeUser.author_id][userLikeUser.user_id]) {
                userLikesTable[userLikeUser.author_id][userLikeUser.user_id] =
                    {};
                userLikesTable[userLikeUser.author_id][userLikeUser.user_id][
                    userLikeUser.type
                ] = 1;
            } else {
                if (
                    !userLikesTable[userLikeUser.author_id][
                        userLikeUser.user_id
                    ][userLikeUser.type]
                ) {
                    userLikesTable[userLikeUser.author_id][
                        userLikeUser.user_id
                    ][userLikeUser.type] = 1;
                } else {
                    userLikesTable[userLikeUser.author_id][
                        userLikeUser.user_id
                    ][userLikeUser.type]++;
                }
            }
        }
    }
    return userLikesTable;
};

// table of how many times each user id has commented on my post or comment
// level: 1, 2
const generateUserCommentsTable = async () => {
    const userCommentsTable = {};
    const [userComments] = await db.pool.query(
        `select c.id, p.user_id as commentee_id, c.user_id as commentor_id, 1 as level
        from comment c
        join post p on c.post_id = p.id
        join user u on p.user_id = u.id
        where p.user_id != c.user_id
        UNION
        select c_second_level.id, c.user_id as commentee_id, c_second_level.user_id as commentor_id, 2 as level
        from comment c
        join comment c_second_level
        on c.id = c_second_level.replied_comment_id
        where c.user_id != c_second_level.user_id
        `
    );
    for (let commenteeCommentors of userComments) {
        if (!userCommentsTable[commenteeCommentors.commentee_id]) {
            userCommentsTable[commenteeCommentors.commentee_id] = {};
            userCommentsTable[commenteeCommentors.commentee_id][
                commenteeCommentors.commentor_id
            ] = {};
            userCommentsTable[commenteeCommentors.commentee_id][
                commenteeCommentors.commentor_id
            ][commenteeCommentors.level] = 1;
        } else {
            if (
                !userCommentsTable[commenteeCommentors.commentee_id][
                    commenteeCommentors.commentor_id
                ]
            ) {
                userCommentsTable[commenteeCommentors.commentee_id][
                    commenteeCommentors.commentor_id
                ] = {};
                userCommentsTable[commenteeCommentors.commentee_id][
                    commenteeCommentors.commentor_id
                ][commenteeCommentors.level] = 1;
            } else {
                if (
                    !userCommentsTable[commenteeCommentors.commentee_id][
                        commenteeCommentors.commentor_id
                    ][commenteeCommentors.level]
                ) {
                    userCommentsTable[commenteeCommentors.commentee_id][
                        commenteeCommentors.commentor_id
                    ][commenteeCommentors.level] = 1;
                } else {
                    userCommentsTable[commenteeCommentors.commentee_id][
                        commenteeCommentors.commentor_id
                    ][commenteeCommentors.level]++;
                }
            }
        }
    }
    return userCommentsTable;
};

// table of how many times each user id has mentioned me on posts or comments
// type: eventful_edge, comment
const generateUserMentionsTable = async () => {
    const userMentionsTable = {};
    const [userMentions] = await db.pool.query(
        `select p.user_id as author_id, mu.user_id as mentioned_user, 'eventful_edge' as type
        from post p join mention_user mu on p.id = mu.post_id
        where p.user_id != mu.user_id
        union
        select c.user_id as author_id, mu.user_id as mentioned_user, 'comment' as type
        from comment c join mention_user mu on c.id = mu.comment_id
        where c.user_id != mu.user_id
        `
    );
    for (let authorMentionedUser of userMentions) {
        if (!userMentionsTable[authorMentionedUser.mentioned_user]) {
            userMentionsTable[authorMentionedUser.mentioned_user] = {};
            userMentionsTable[authorMentionedUser.mentioned_user][
                authorMentionedUser.author_id
            ] = {};
            userMentionsTable[authorMentionedUser.mentioned_user][
                authorMentionedUser.author_id
            ][authorMentionedUser.type] = 1;
        } else {
            if (
                !userMentionsTable[authorMentionedUser.mentioned_user][
                    authorMentionedUser.author_id
                ]
            ) {
                userMentionsTable[authorMentionedUser.mentioned_user][
                    authorMentionedUser.author_id
                ] = {};
                userMentionsTable[authorMentionedUser.mentioned_user][
                    authorMentionedUser.author_id
                ][authorMentionedUser.type] = 1;
            } else {
                if (
                    !userMentionsTable[authorMentionedUser.mentioned_user][
                        authorMentionedUser.author_id
                    ][authorMentionedUser.type]
                ) {
                    userMentionsTable[authorMentionedUser.mentioned_user][
                        authorMentionedUser.author_id
                    ][authorMentionedUser.type] = 1;
                } else {
                    userMentionsTable[authorMentionedUser.mentioned_user][
                        authorMentionedUser.author_id
                    ][authorMentionedUser.type]++;
                }
            }
        }
    }
    return userMentionsTable;
};

const generateUserAffinityTable = async () => {
    // { '1': { '2': 300.000, '3': 325.000 }, ... }
    const userLikesTable = await generateUserLikesTable();
    const userCommentsTable = await generateUserCommentsTable();
    const userMentionsTable = await generateUserMentionsTable();
    const userAffinityTable = {};
    const allUserIds = await getUserIds({ type: "all" });

    for (let idObject of allUserIds) {
        const userId = idObject.id;
        userAffinityTable[userId] = {};
        for (let otherIdObject of allUserIds) {
            const otherUserId = otherIdObject.id;
            if (userId == otherUserId) {
                continue;
            }
            // calculate comment score
            const outgoingFirstLevel = getValueOr(
                userCommentsTable,
                otherUserId,
                userId,
                "1",
                0
            );

            const incomingFirstLevel = getValueOr(
                userCommentsTable,
                userId,
                otherUserId,
                "1",
                0
            );

            const outgoingSecondLevel = getValueOr(
                userCommentsTable,
                otherUserId,
                userId,
                "2",
                0
            );
            const incomingSecondLevel = getValueOr(
                userCommentsTable,
                userId,
                otherUserId,
                "2",
                0
            );

            const commentScore =
                4 * outgoingFirstLevel +
                3 * outgoingSecondLevel +
                2 * incomingFirstLevel +
                incomingSecondLevel;

            // calculate mention score
            const outgoingMentionsOnEventfulEdge = getValueOr(
                userMentionsTable,
                otherUserId,
                userId,
                "eventful_edge",
                0
            );
            const incomingMentionsOnEventfulEdge = getValueOr(
                userMentionsTable,
                userId,
                otherUserId,
                "eventful_edge",
                0
            );
            const outgoingMentionsOnNonEventfulEdge = getValueOr(
                userMentionsTable,
                otherUserId,
                userId,
                "comment",
                0
            );
            const incomingMentionsOnNonEventfulEdge = getValueOr(
                userMentionsTable,
                userId,
                otherUserId,
                "comment",
                0
            );
            const mentionScore =
                4 * outgoingMentionsOnEventfulEdge +
                3 * outgoingMentionsOnNonEventfulEdge +
                2 * incomingMentionsOnEventfulEdge +
                incomingMentionsOnNonEventfulEdge;

            // calculate like score
            const outgoingLikesOnEventfulEdge = getValueOr(
                userLikesTable,
                otherUserId,
                userId,
                "eventful_edge",
                0
            );

            const incomingLikesOnEventfulEdge = getValueOr(
                userLikesTable,
                userId,
                otherUserId,
                "eventful_edge",
                0
            );
            const outgoingLikesOnNonEventfulEdge = getValueOr(
                userLikesTable,
                otherUserId,
                userId,
                "comment",
                0
            );
            const incomingLikesOnNonEventfulEdge = getValueOr(
                userLikesTable,
                userId,
                otherUserId,
                "comment",
                0
            );
            const likeScore =
                4 * outgoingLikesOnEventfulEdge +
                3 * outgoingLikesOnNonEventfulEdge +
                2 * incomingLikesOnEventfulEdge +
                incomingLikesOnNonEventfulEdge;

            const affinity =
                COMMENT_WEIGHT * commentScore +
                MENTION_WEIGHT * mentionScore +
                LIKE_WEIGHT * likeScore;

            userAffinityTable[userId][otherUserId] = affinity;
        }
    }
    return userAffinityTable;
};

const calculateIndividualAffinity = async (my_user_id, other_user_id) => {
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

const calculateTimeDecayFactor = (feed) => {
    const feedCreatedAtUnix = feed.created_at;
    const nowUnix = Date.now() / 1000;
    const timeDiff = nowUnix - feedCreatedAtUnix;
    if (timeDiff < 60 * 10) {
        return 1;
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

const calcEdgeRankScore = async (feed, my_user_id) => {
    const affinity = await calculateIndividualAffinity(my_user_id, feed.userid);
    const edgeWeight = await calculateEdgeWeight(feed, my_user_id, feed.id);
    const timeDecayFactor = await calculateTimeDecayFactor(feed);
    return (affinity + edgeWeight) / timeDecayFactor;
};

module.exports = {
    getUserIds,
    generateUserAffinityTable,
    calcEdgeRankScore
};
