require("dotenv").config();
const Queue = require("bull");
const server = require("./app");
const { NFGS_PORT, REDIS_HOST, REDIS_PORT, REDIS_USER, REDIS_PASSWORD } =
    process.env;
const schedule = require("node-schedule");
const updaterJobQueue = new Queue("updater-job-queue", {
    redis: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        username: REDIS_USER,
        password: REDIS_PASSWORD,
    },
});

server.listen(NFGS_PORT, async () => {
    console.log(`Listening on port: ${NFGS_PORT}`);

    // send 'recalculateAffinity' job to updaterJobQueue every 12 hours
    const recalcAffinity = schedule.scheduleJob("* */12 * * *", () => {
        updaterJobQueue.add({ function: "recalcAffinityTable" });
    });

    // send 'recalcTimeDecayFactor' job to updaterJobQueue every 5 minutes
    const recalcTimeDecayFactor = schedule.scheduleJob("*/5 * * * *", () => {
        updaterJobQueue.add({ function: "recalcTimeDecayFactor" });
    });
});
