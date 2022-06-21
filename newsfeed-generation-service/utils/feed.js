class Feed {
    constructor({
        id, // required
        user_id, // required
        username, // required
        profile_pic_url, // required
        content, // required
        created_at, // required
        audience_type_id, // required
        shared_post_id,
        like_count,
        comment_count,
        share_count,
        edge_rank_score,
        latest_comments,
        mentioned_users,
        photo_urls,
        tags,
    }) {
        this.id = id;
        this.user_id = user_id;
        this.username = username;
        this.profile_pic_url = profile_pic_url;
        this.content = content;
        this.created_at = created_at;
        this.audience_type_id = audience_type_id;
        this.shared_post_id = shared_post_id || null;
        this.like_count = like_count || 0;
        this.comment_count = comment_count || 0;
        this.share_count = share_count || 0;
        this.edge_rank_score = edge_rank_score || 0;
        this.latest_comments = latest_comments || [];
        this.mentioned_users = mentioned_users || [];
        this.photo_urls = photo_urls || [];
        this.tags = tags || [];
    }
}

module.exports = { Feed };
