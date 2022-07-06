const SEARCH_PAGE_SIZE = 10;
const search = require("../apis/search");

const searchTerm = async (req, res) => {
    let { kw, paging } = req.query;
    paging = paging || 0;
    const searchResult = await search.get(
        "/bablamos_post,bablamos_user/_search",
        {
            data: {
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
    res.send({ data: searchResult.data.hits.hits });
};

module.exports = { searchTerm };
