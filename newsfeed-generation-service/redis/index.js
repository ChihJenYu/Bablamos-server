require("dotenv").config();
const redis = require("redis");
const { REDIS_HOST, REDIS_USER, REDIS_PASSWORD, REDIS_PORT } = process.env;

const redisClient = redis.createClient({
    url: `redis://${REDIS_USER}:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`,
});

redisClient.ready = false;

redisClient.on("ready", () => {
    redisClient.ready = true;
    console.log("Redis is ready");
});

redisClient.on("error", () => {
    redisClient.ready = false;
    if (process.env.NODE_ENV == "production") {
        console.log("Error in Redis");
    }
});

redisClient.on("end", () => {
    redisClient.ready = false;
    console.log("Redis is disconnected");
});

redisClient.connect();

module.exports = redisClient;
