const { notificationDispatcherJobQueue } = require("../mq");
const workerFunctions = require("./notification-functions");

console.log("Notification service is listening...");

notificationDispatcherJobQueue.process(async (job, done) => {
    await workerFunctions[job.data.function]({
        type: job.data.type,
        post_id: job.data.post_id,
        comment_id: job.data.comment_id,
        user_id: job.data.user_id,
        for_user_id: job.data.for_user_id,
    });
    done();
});

notificationDispatcherJobQueue.on("completed", () => {
    notificationDispatcherJobQueue.clean(1000);
});
