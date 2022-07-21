const db = require("../../mysql");
const { getValueOr } = require("../../utils/util");
// AFFINITY
const {
    AFFINITY_MENTION_WEIGHT,
    AFFINITY_COMMENT_WEIGHT,
    AFFINITY_LIKE_WEIGHT,
    POP_SHARE_WEIGHT,
    POP_COMMENT_WEIGHT,
    POP_LIKE_WEIGHT,
    TEN_MINUTE_TIME_DECAY,
    ONE_HOUR_TIME_DECAY,
    SIX_HOUR_TIME_DECAY,
    ONE_DAY_TIME_DECAY,
    DAYS_BASE,
    ALREADY_SEEN_BASE,
} = process.env;

// EDGE WEIGHT
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

// table of how many times each user id has liked my post
// type: eventful_edge, comment
// { 1: { 2: { eventful_edge: 12, comment: 3 } } };
const generateUserLikesTable = async () => {
    const userLikesTable = {};
    const [userLikes] = await db.pool.query(
        `select @rownum := @rownum + 1 as inc_id, p.user_id as author_id, lu.user_id, 'eventful_edge' as type
        from post p join like_user lu on p.id = lu.post_id 
        cross join (select @rownum := 0) r
        where p.user_id != lu.user_id
        union
        select @rownum := @rownum + 1 as inc_id, c.user_id as author_id, lu.user_id, 'comment' as type
        from comment c join like_user lu on c.id = lu.comment_id
        cross join (select @rownum := 0) r
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

// table of how many times each user id has commented on my post
// { 1: { 2: 12, 3: 1 } };
const generateUserCommentsTable = async () => {
    const userCommentsTable = {};
    const [userComments] = await db.pool.query(
        `select c.id, p.user_id as commentee_id, c.user_id as commentor_id, 1 as level
        from comment c
        join post p on c.post_id = p.id
        join user u on p.user_id = u.id
        where p.user_id != c.user_id
        `
    );
    for (let commenteeCommentors of userComments) {
        if (!userCommentsTable[commenteeCommentors.commentee_id]) {
            userCommentsTable[commenteeCommentors.commentee_id] = {};
            userCommentsTable[commenteeCommentors.commentee_id][
                commenteeCommentors.commentor_id
            ] = 1;
        } else {
            if (
                !userCommentsTable[commenteeCommentors.commentee_id][
                    commenteeCommentors.commentor_id
                ]
            ) {
                userCommentsTable[commenteeCommentors.commentee_id][
                    commenteeCommentors.commentor_id
                ] = 1;
            } else {
                userCommentsTable[commenteeCommentors.commentee_id][
                    commenteeCommentors.commentor_id
                ]++;
            }
        }
    }
    return userCommentsTable;
};

// table of how many times each user id has mentioned me in comments
// { 1: { 2: 12, 3: 1 } };
const generateUserMentionsTable = async () => {
    const userMentionsTable = {};
    const [userMentions] = await db.pool.query(
        `select c.user_id as author_id, mu.user_id as mentioned_user
        from comment c join mention_user mu on c.id = mu.comment_id
        where c.user_id != mu.user_id
        `
    );
    for (let authorMentionedUser of userMentions) {
        if (!userMentionsTable[authorMentionedUser.mentioned_user]) {
            userMentionsTable[authorMentionedUser.mentioned_user] = {};
            userMentionsTable[authorMentionedUser.mentioned_user][
                authorMentionedUser.author_id
            ] = 1;
        } else {
            if (
                !userMentionsTable[authorMentionedUser.mentioned_user][
                    authorMentionedUser.author_id
                ]
            ) {
                userMentionsTable[authorMentionedUser.mentioned_user][
                    authorMentionedUser.author_id
                ] = 1;
            } else {
                userMentionsTable[authorMentionedUser.mentioned_user][
                    authorMentionedUser.author_id
                ]++;
            }
        }
    }
    return userMentionsTable;
};

// { '1': { '2': 300.000, '3': 325.000 }, ... }
const generateUserAffinityTable = async () => {
    const userLikesTable = await generateUserLikesTable();
    const userCommentsTable = await generateUserCommentsTable();
    const userMentionsTable = await generateUserMentionsTable();
    const userAffinityTable = {};
    const allUserIds = await getUserIds({ type: "all" });

    for (let idObject of allUserIds) {
        const userId = idObject.id;
        userAffinityTable[userId] = [];
        for (let otherIdObject of allUserIds) {
            const otherUserId = otherIdObject.id;
            if (userId == otherUserId) {
                continue;
            }
            // calculate comment score
            const outgoingComments = getValueOr(
                userCommentsTable,
                [otherUserId, userId],
                0
            );

            const incomingComments = getValueOr(
                userCommentsTable,
                [userId, otherUserId],
                0
            );

            const commentScore = 2 * outgoingComments + incomingComments;

            // calculate mention score
            const outgoingMentions = getValueOr(
                userMentionsTable,
                [otherUserId, userId],
                0
            );
            const incomingMentions = getValueOr(
                userMentionsTable,
                [userId, otherUserId],
                0
            );
            const mentionScore = 2 * outgoingMentions + incomingMentions;

            // calculate like score
            const outgoingLikesOnEventfulEdge = getValueOr(
                userLikesTable,
                [otherUserId, userId, "eventful_edge"],
                0
            );

            const incomingLikesOnEventfulEdge = getValueOr(
                userLikesTable,
                [userId, otherUserId, "eventful_edge"],
                0
            );
            const outgoingLikesOnNonEventfulEdge = getValueOr(
                userLikesTable,
                [otherUserId, userId, "comment"],
                0
            );
            const incomingLikesOnNonEventfulEdge = getValueOr(
                userLikesTable,
                [userId, otherUserId, "comment"],
                0
            );
            const likeScore =
                4 * outgoingLikesOnEventfulEdge +
                3 * outgoingLikesOnNonEventfulEdge +
                2 * incomingLikesOnEventfulEdge +
                incomingLikesOnNonEventfulEdge;

            const affinity =
                +AFFINITY_COMMENT_WEIGHT * commentScore +
                +AFFINITY_MENTION_WEIGHT * mentionScore +
                +AFFINITY_LIKE_WEIGHT * likeScore;

            userAffinityTable[userId][otherUserId] =
                affinity == 0 ? undefined : affinity;
        }
    }
    return userAffinityTable;
};

const calculateLikeScore = (lc) => +POP_LIKE_WEIGHT * lc;

const calculateCommentScore = (cc) => +POP_COMMENT_WEIGHT * cc;

const calculateShareScore = (sc) => +POP_SHARE_WEIGHT * sc;

const calculatePopularity = (ls, cs, ss) => ls + cs + ss;

const calculateTimeDecayFactor = (feed) => {
    const feedCreatedAtUnix = feed.created_at;
    const nowUnix = Date.now() / 1000;
    const timeDiff = nowUnix - feedCreatedAtUnix;
    if (timeDiff < 60 * 10) {
        return +TEN_MINUTE_TIME_DECAY;
    } else if ((timeDiff >= 60 * 10) & (timeDiff < 60 * 60)) {
        return +ONE_HOUR_TIME_DECAY;
    } else if ((timeDiff >= 60 * 60 * 1) & (timeDiff < 60 * 60 * 6)) {
        return +SIX_HOUR_TIME_DECAY;
    } else if ((timeDiff >= 60 * 60 * 6) & (timeDiff < 60 * 60 * 24)) {
        return +ONE_DAY_TIME_DECAY;
    } else {
        const daysPassed = Math.floor(timeDiff / (60 * 60 * 24));
        return Math.pow(+DAYS_BASE, daysPassed);
    }
};

const calculateAlreadySeenFactor = (views) => {
    return Math.pow(ALREADY_SEEN_BASE, views);
};

const calcEdgeRankScore = (af, pop, td, v) =>
    ((1 + af) * pop) / td / calculateAlreadySeenFactor(v);

module.exports = {
    getUserIds,
    generateUserAffinityTable,
    calculateLikeScore,
    calculateCommentScore,
    calculateShareScore,
    calculatePopularity,
    calculateTimeDecayFactor,
    calcEdgeRankScore,
};
