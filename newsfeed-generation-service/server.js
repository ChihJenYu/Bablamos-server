require("dotenv").config();
const server = require("./app");
const { NFGS_PORT } = process.env;
const schedule = require("node-schedule");
const { updaterJobQueue } = require("../mq/");

server.listen(NFGS_PORT, async () => {
    console.log(`Listening on port: ${NFGS_PORT}`);

    // send 'recalculateAffinity' job to updaterJobQueue every 12 hours
    // highest priority
    const recalcAffinity = schedule.scheduleJob("* */12 * * *", () => {
        updaterJobQueue.add(
            { function: "recalcAffinityTable" },
            { priority: 1 }
        );
    });

    // send 'recalcTimeDecayFactor' job to updaterJobQueue every 5 minutes
    const recalcTimeDecayFactor = schedule.scheduleJob("*/5 * * * *", () => {
        updaterJobQueue.add(
            { function: "recalcTimeDecayFactor" },
            { priority: 2 }
        );
    });
});
