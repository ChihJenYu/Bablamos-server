require("dotenv").config();
const server = require("./app");
const { PORT } = process.env;
server.listen(PORT, async () => {
    console.log(`Listening on port: ${PORT}`);
});
