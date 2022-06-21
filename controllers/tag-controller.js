const redisClient = require("../redis");
const Tag = require("../models/tag");
const LIMIT = 6;

const searchStringInArray = (arr, str) => {
    let resultArr = arr.filter((tag) => {
        return tag.name.indexOf(str) != -1;
    });
    return resultArr.slice(0, LIMIT);
};

// tagsInCache looks like [{id, name}]
const searchTag = async (req, res) => {
    const { kw } = req.query;
    const tagsInCache = await redisClient.LRANGE("tags", 0, -1);
    if (tagsInCache.length === 0) {
        // pull from MySQL
        const tags = await Tag.find();
        const matchingTags = searchStringInArray(tags, kw);
        res.send({ matches: matchingTags });

        // store tags in redis
        for (let i = 0; i < tags.length; i++) {
            redisClient.RPUSH("tags", JSON.stringify(tags[i]));
        }
    } else {
        const tagsInCacheParsed = tagsInCache.map((tag) => JSON.parse(tag));
        const matchingTags = searchStringInArray(tagsInCacheParsed, kw);
        res.send({ matches: matchingTags });
    }
};

module.exports = { searchTag };
