const { popularityCalculatorJobQueue } = require("../mq");
const newsfeedFunctions = require("./newsfeed-functions");

popularityCalculatorJobQueue.process(async (job, done) => {
    await newsfeedFunctions[job.data.function]({
        post_id: job.data.post_id,
        type: job.data.type,
    });
    done();
});

popularityCalculatorJobQueue.on("completed", () => {
    popularityCalculatorJobQueue.clean(1000);
});
