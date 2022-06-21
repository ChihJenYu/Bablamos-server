const axios = require("axios");

const newsfeed = axios.create({
    baseURL: "http://localhost:3001/api/newsfeed",
});

module.exports = newsfeed;
