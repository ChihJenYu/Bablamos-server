require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors());
app.use("/api", [
    require("./routes/post-route"),
    require("./routes/comment-route"),
    require("./routes/user-route"),
    require("./routes/tag-route"),
    require("./routes/notification-route"),
]);

app.use((err, req, res, next) => {
    console.log(err);
    res.status(500).send("Internal Server Error");
});

const server = require("http").createServer(app);

module.exports = server;
