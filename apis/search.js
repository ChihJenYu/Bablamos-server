require("dotenv").config();
const axios = require("axios");
const { ELASTIC_SEARCH_HOST } = process.env;
const search = axios.create({
    baseURL: `${ELASTIC_SEARCH_HOST}`,
});

module.exports = search;
