const mongoose = require("mongoose");
mongoose.connect(process.env.MONGODB_URL, null, (err) => {
    if (err) console.log(err);
    else console.log("MongoDB is connected");
});
