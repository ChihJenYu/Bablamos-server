const { initialization } = require("./utils/init");
require("./mongoose/");
const cors = require("cors");
const express = require("express");
const app = express();
app.use(express.json());
app.use(cors());
app.use("/api", require("./routes"));

if (process.argv.indexOf("init") != -1) {
    initialization().then(() => {
        console.log("News feed generation service initialization complete.");
    });
}

module.exports = app;
