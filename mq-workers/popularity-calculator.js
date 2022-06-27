const { popularityCalculatorJobQueue } = require("../mq");
const workerFunctions = require("./worker-functions");

popularityCalculatorJobQueue.process(async (job, done) => {
    await workerFunctions[job.data.function]();
    done();
});

popularityCalculatorJobQueue.on("completed", () => {
    popularityCalculatorJobQueue.clean(1000);
});
