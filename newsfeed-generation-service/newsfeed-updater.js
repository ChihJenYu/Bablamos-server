require("dotenv").config();
const { REDIS_HOST, REDIS_PORT, REDIS_USER, REDIS_PASSWORD } = process.env;
const Queue = require("bull");
const updaterFunctions = require("./utils/newsfeed-updater");
const updaterJobQueue = new Queue("updater-job-queue", {
    redis: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        username: REDIS_USER,
        password: REDIS_PASSWORD,
    },
});

updaterJobQueue.process(async (job, done) => {
    await updaterFunctions[job.data.function]();
    done();
});

updaterJobQueue.on("completed", () => {
    updaterJobQueue.clean(1000);
});
