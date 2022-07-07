const INDEX_SEARCH_PAGE_SIZE = 6;
const DETAIL_SEARCH_PAGE_SIZE = 10;
const search = require("../apis/search");
const User = require("../models/user");
const Feed = require("../models/feed");

const mapQueryResult = (elastic_object) => {
    const returnObj = {};
    if (elastic_object._index === "bablamos_user") {
        returnObj.index = "user";
        returnObj.user_id = elastic_object._source.id;
        returnObj.username = elastic_object._source.username;
        returnObj.profile_pic_url = User.generatePictureUrl({
            has_profile: elastic_object._source.user_profile_pic === 1,
            id: elastic_object._source.id,
        });
        return returnObj;
    }
    if (elastic_object._index === "bablamos_post") {
        returnObj.index = "post";
        returnObj.user_id = elastic_object._source.user_id;
        returnObj.username = elastic_object._source.username;
        returnObj.post_id = elastic_object._source.id;
        returnObj.content = elastic_object._source.content;
        returnObj.profile_pic_url = User.generatePictureUrl({
            has_profile: elastic_object._source.user_profile_pic === 1,
            id: elastic_object._source.user_id,
        });
        return returnObj;
    }
};

const searchTerm = async (req, res) => {
    let { kw, paging, at: whichPage } = req.query;
    // paging = paging || 0;
    paging = isNaN(+paging) ? 0 : +paging;
    let searchResult = await search.get(
        "/bablamos_post,bablamos_user/_search",
        {
            data: {
                from:
                    whichPage == "detail"
                        ? DETAIL_SEARCH_PAGE_SIZE * paging
                        : INDEX_SEARCH_PAGE_SIZE * paging,
                size:
                    whichPage == "detail"
                        ? DETAIL_SEARCH_PAGE_SIZE
                        : INDEX_SEARCH_PAGE_SIZE,
                query: {
                    function_score: {
                        query: {
                            multi_match: {
                                query: kw,
                                fields: ["username", "content"],
                                fuzziness: 2,
                            },
                        },
                    },
                },
            },
        }
    );
    searchResult = searchResult.data.hits.hits.map((res) =>
        mapQueryResult(res)
    );
    res.send({ data: searchResult });
};

const searchUser = async (req, res) => {
    let { kw, paging, at: whichPage } = req.query;
    console.log(kw);
    paging = isNaN(+paging) ? 0 : +paging;
    let searchResult = await search.get("/bablamos_user/_search", {
        data: {
            from:
                whichPage == "detail"
                    ? DETAIL_SEARCH_PAGE_SIZE * paging
                    : INDEX_SEARCH_PAGE_SIZE * paging,
            size:
                whichPage == "detail"
                    ? DETAIL_SEARCH_PAGE_SIZE
                    : INDEX_SEARCH_PAGE_SIZE,
            query: {
                fuzzy: {
                    username: {
                        value: kw,
                        fuzziness: 2,
                    },
                },
            },
        },
    });
    searchResult = searchResult.data.hits.hits.map((res) =>
        mapQueryResult(res)
    );
    res.send({ data: searchResult });
};

const searchPost = async (req, res) => {
    let { kw, paging, at: whichPage } = req.query;
    paging = isNaN(+paging) ? 0 : +paging;
    const userAsking = req.user.id;
    let searchResult = await search.get("/bablamos_post/_search", {
        data: {
            from:
                whichPage == "detail"
                    ? DETAIL_SEARCH_PAGE_SIZE * paging
                    : INDEX_SEARCH_PAGE_SIZE * paging,
            size:
                whichPage == "detail"
                    ? DETAIL_SEARCH_PAGE_SIZE
                    : INDEX_SEARCH_PAGE_SIZE,
            query: {
                function_score: {
                    query: {
                        multi_match: {
                            query: kw,
                            fields: ["username", "content"],
                            fuzziness: 2,
                        },
                    },
                },
            },
        },
    });
    // searchResult = searchResult.data.hits.hits.map((res) =>
    //     mapQueryResult(res)
    // );
    searchResult = searchResult.data.hits.hits;
    for (let i = 0; i < searchResult.length; i++) {
        const feedId = searchResult[i].post_id;
        const feedContent = await Feed.getFeedDetail(feedId, userAsking);
        if (!feedContent) {
            continue;
        }
        feedContent.profile_pic_url = User.generatePictureUrl({
            has_profile: feedContent.user_profile_pic == 1,
            id: feedContent.user_id,
        });
        delete feedContent.user_profile_pic;
        feedContent.latest_comments = feedContent.latest_comments.map(
            (comment) => {
                const newObj = {
                    ...comment,
                    profile_pic_url: User.generatePictureUrl({
                        has_profile: comment.user_profile_pic == 1,
                        id: comment.user_id,
                    }),
                };
                delete newObj.user_profile_pic;
                return newObj;
            }
        );
        if (feedContent.shared_post_id) {
            feedContent.shared_post_data = await Post.getSharedData(
                feedContent.shared_post_id
            );
        }
        feedContent.is_new = searchResult[i].is_new;
        searchResult[i] = feedContent;
        console.log(feedContent);
    }
    res.send({ data: searchResult });
};

module.exports = { searchTerm, searchUser, searchPost };
