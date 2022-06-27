const { popularityCalculatorJobQueue } = require("../mq");
const workerFunctions = require("./worker-functions");

popularityCalculatorJobQueue.process(async (job, done) => {
    await workerFunctions[job.data.function]({
        post_id: job.data.post_id,
        type: job.data.type,
    });
    done();
});

popularityCalculatorJobQueue.on("completed", () => {
    popularityCalculatorJobQueue.clean(1000);
});
