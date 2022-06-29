const { notificationDispatcherJobQueue } = require("../mq");
const workerFunctions = require("./notification-functions");

notificationDispatcherJobQueue.process(async (job, done) => {
    await workerFunctions[job.data.function]({
        post_id: job.data.post_id,
        type: job.data.type,
        user_id: job.data.user_id,
    });
    done();
});

notificationDispatcherJobQueue.on("completed", () => {
    notificationDispatcherJobQueue.clean(1000);
});
