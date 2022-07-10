require("dotenv").config();
const server = require("./app");
const { NFGS_PORT } = process.env;
const schedule = require("node-schedule");
const { updaterJobQueue } = require("../mq/");

server.listen(NFGS_PORT, async () => {
    console.log(`Listening on port: ${NFGS_PORT}`);

    const recalcAffinity = schedule.scheduleJob("0 0,12 * * *", () => {
        updaterJobQueue.add({ function: "recalcAffinityTable" });
    });
    const recalcTimeDecayFactor = schedule.scheduleJob("*/5 * * * *", () => {
        updaterJobQueue.add({ function: "recalcTimeDecayFactor", type: 1 });
    });

    const dailyRecalcTimeDecayFactor = schedule.scheduleJob("0 0 * * *", () => {
        updaterJobQueue.add({ function: "recalcTimeDecayFactor", type: 2 });
    });
});
