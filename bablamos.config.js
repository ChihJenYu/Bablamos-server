module.exports = {
    apps: [
        {
            name: "web-server",
            script: "./server.js",
            watch: true,
        },
        {
            name: "NFGS-server",
            script: "./newsfeed-generation-service/server.js",
            watch: true,
        },
        {
            name: "popularity-calculator",
            script: "./mq-workers/popularity-calculator.js",
            watch: true,
        },
        {
            name: "schedule-updater",
            script: "./mq-workers/schedule-updater.js",
            watch: true,
        },
        {
            name: "socket-server",
            script: "./socket-server/server.js",
            watch: true,
        },
    ],
};
