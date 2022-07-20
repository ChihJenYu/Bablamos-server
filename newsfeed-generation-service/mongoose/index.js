const mongoose = require("mongoose");
const { NODE_ENV, MONGODB_URL, TEST_MONGODB_URL } = process.env;
mongoose.connect(
    NODE_ENV === "test" ? TEST_MONGODB_URL : MONGODB_URL,
    null,
    (err) => {
        if (err) console.log(err);
        else console.log("MongoDB is connected");
    }
);
