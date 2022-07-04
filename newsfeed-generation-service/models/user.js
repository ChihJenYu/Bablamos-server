const mongoose = require("mongoose");

const UserSchema = mongoose.Schema({
    user_id: {
        type: Number,
        required: true,
    },
    newsfeed: [
        {
            post_id: {
                type: Number,
                required: true,
            },
            user_id: {
                type: Number,
            },
            affinity: {
                type: Number,
                default: 0,
            },
            edge_weight: {
                type: Number,
                default: 0,
            },
            like_score: {
                type: Number,
                default: 0,
            },
            comment_score: {
                type: Number,
                default: 0,
            },
            share_score: {
                type: Number,
                default: 0,
            },
            popularity: {
                type: Number,
                default: 0,
            },
            time_decay_factor: {
                type: Number,
                default: 1,
            },
            created_at: {
                type: Number,
            },
            edge_rank_score: {
                type: Number,
                default: 0,
            },
            is_new: {
                type: Boolean,
                default: false,
            },
            views: {
                type: Number,
                default: 0,
            },
        },
    ],
    affinity: [
        {
            user_id: {
                type: Number,
            },
            affinity: {
                type: Number,
            },
        },
    ],
});

const User = mongoose.model("User", UserSchema);
module.exports = User;
