const { updaterJobQueue } = require("../mq");
const newsfeedFunctions = require("./newsfeed-functions");

updaterJobQueue.process(async (job, done) => {
    await newsfeedFunctions[job.data.function]();
    done();
});

updaterJobQueue.on("completed", () => {
    updaterJobQueue.clean(1000);
});
