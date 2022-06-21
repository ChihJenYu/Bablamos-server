require("dotenv").config();
const server = require("./app");
const { NFGS_PORT } = process.env;
server.listen(NFGS_PORT, async () => {
    console.log(`Listening on port: ${NFGS_PORT}`);
});
