const getValueOr = (table, keysArray, or) => {
    try {
        let value;
        for (let key of keysArray) {
            value = table[key];
            table = table[key];
        }
        return value || or;
    } catch (e) {
        return or;
    }
};

const asyncErrorHandler = (fn) => {
    return function (req, res, next) {
        fn(req, res, next).catch(next);
    };
};

module.exports = {
    getValueOr,
    asyncErrorHandler,
};
