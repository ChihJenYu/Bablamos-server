require("dotenv").config();
const server = require("./app");
const schedule = require("node-schedule");
const { notificationDispatcherJobQueue } = require("./mq");
const { PORT } = process.env;
server.listen(PORT, async () => {
    console.log(`Listening on port: ${PORT}`);
    const clearReadNotifications = schedule.scheduleJob("0 */3 * * *", () => {
        notificationDispatcherJobQueue.add({ function: "clearNotifications" });
    });
});
