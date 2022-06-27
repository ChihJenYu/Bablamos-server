const { updaterJobQueue } = require("../mq");
const workerFunctions = require("./worker-functions");

updaterJobQueue.process(async (job, done) => {
    await workerFunctions[job.data.function]();
    done();
});

updaterJobQueue.on("completed", () => {
    updaterJobQueue.clean(1000);
});
