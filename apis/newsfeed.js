require("dotenv").config();
const axios = require("axios");
const { NFGS_PORT } = process.env;
const newsfeed = axios.create({
    baseURL: `http://localhost:${NFGS_PORT}/api/newsfeed`,
});

module.exports = newsfeed;
