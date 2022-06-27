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
            edge_rank_score: {
                type: Number,
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