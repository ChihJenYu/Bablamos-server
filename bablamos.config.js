module.exports = {
    apps: [
        {
            name: "application-server",
            script: "./server.js",
        },
        {
            name: "NFGS-server",
            script: "./newsfeed-generation-service/server.js",
        },
        {
            name: "popularity-calculator",
            script: "./mq-workers/popularity-calculator.js",
        },
        {
            name: "schedule-updater",
            script: "./mq-workers/schedule-updater.js",
        },
        {
            name: "socket-server",
            script: "./socket-server/server.js",
        },
        {
            name: "notification-service",
            script: "./mq-workers/notification-service.js",
        },
        {
            name: "user-simulation",
            script: "./simulation/user.js",
        },
        {
            name: "post-simulation",
            script: "./simulation/post.js",
        },
        {
            name: "comment-simulation",
            script: "./simulation/comment.js",
        },
    ],
};
