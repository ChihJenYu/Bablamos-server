const { closeConnection } = require("./fake-data-generator");
const { requester } = require("./setup");

after(async () => {
    await closeConnection();
    requester.close();
});
