require("dotenv").config();
const server = require("./app");
const { NFGS_PORT } = process.env;
const schedule = require("node-schedule");
const { updaterJobQueue } = require("../mq/");

server.listen(NFGS_PORT, async () => {
    console.log(`Listening on port: ${NFGS_PORT}`);

    // highest priority
    const recalcAffinity = schedule.scheduleJob("50 */12 * * *", () => {
        updaterJobQueue.add(
            { function: "recalcAffinityTable" },
            { priority: 1 }
        );
    });

    const recalcTimeDecayFactor = schedule.scheduleJob("*/5 * * * *", () => {
        updaterJobQueue.add(
            { function: "recalcTimeDecayFactor", type: 1 },
            { priority: 2 }
        );
    });

    const dailyRecalcTimeDecayFactor = schedule.scheduleJob("0 0 * * *", () => {
        updaterJobQueue.add(
            { function: "recalcTimeDecayFactor", type: 2 },
            { priority: 2 }
        );
    });
});
