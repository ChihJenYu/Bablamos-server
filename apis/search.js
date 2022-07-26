require("dotenv").config();
const axios = require("axios");
const { ELASTIC_SEARCH_HOST, ELASTIC_POST_INDEX, ELASTIC_USER_INDEX } =
    process.env;
const SEARCH_POST_PAGE_SIZE = 8;
const SEARCH_USER_PAGE_SIZE = 6;
const FUZZINESS = 1;
const MINIMUM_SHOULD_MATCH = "3<-20%";
const search = axios.create({
    baseURL: `${ELASTIC_SEARCH_HOST}`,
});

const elasticSearchPosts = async (query, paging) => {
    const searchResults = await search.get(`/${ELASTIC_POST_INDEX}/_search`, {
        data: {
            from: SEARCH_POST_PAGE_SIZE * paging,
            size: SEARCH_POST_PAGE_SIZE,
            query: {
                function_score: {
                    query: {
                        multi_match: {
                            query,
                            fields: ["content^2", "username"],
                            fuzziness: FUZZINESS,
                            minimum_should_match: MINIMUM_SHOULD_MATCH,
                        },
                    },
                },
            },
        },
    });
    const postIds = searchResults.data.hits.hits.map((result) => {
        return result._source.id;
    });
    return postIds;
};

// type: ["detail", "simple"]
const elasticSearchUsers = async (type, query, paging) => {
    const queryObj =
        type === "detail"
            ? {
                  function_score: {
                      query: {
                          match: {
                              username: {
                                  query,
                                  fuzziness: FUZZINESS,
                              },
                          },
                      },
                  },
              }
            : {
                  function_score: {
                      query: {
                          match_phrase_prefix: {
                              username: {
                                  query,
                              },
                          },
                      },
                  },
              };
    const searchResults = await search.get(`/${ELASTIC_USER_INDEX}/_search`, {
        data: {
            from: SEARCH_USER_PAGE_SIZE * paging,
            size: SEARCH_USER_PAGE_SIZE,
            query: queryObj,
        },
    });
    const users = searchResults.data.hits.hits.map((res) => ({
        user_id: res._source.id,
        username: res._source.username,
        profile_pic_url: User.generatePictureUrl({
            has_profile: res._source.user_profile_pic === 1,
            id: res._source.id,
        }),
    }));
    return users;
};

module.exports = {
    search,
    elasticSearchPosts,
    elasticSearchUsers,
};
