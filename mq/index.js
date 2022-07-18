require("dotenv").config();
const Queue = require("bull");
const { REDIS_HOST, REDIS_PORT, REDIS_USER, REDIS_PASSWORD } = process.env;

const popularityCalculatorJobQueue = new Queue(
    "popularity-calculator-job-queue",
    {
        redis: {
            host: REDIS_HOST,
            port: REDIS_PORT,
            username: REDIS_USER,
            password: REDIS_PASSWORD,
        },
    }
);

const updaterJobQueue = new Queue("updater-job-queue", {
    redis: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        username: REDIS_USER,
        password: REDIS_PASSWORD,
    },
});

const notificationDispatcherJobQueue = new Queue(
    "notification-dispatcher-job-queue",
    {
        redis: {
            host: REDIS_HOST,
            port: REDIS_PORT,
            username: REDIS_USER,
            password: REDIS_PASSWORD,
        },
    }
);

module.exports = {
    popularityCalculatorJobQueue,
    updaterJobQueue,
    notificationDispatcherJobQueue,
};
