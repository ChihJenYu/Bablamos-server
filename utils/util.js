const multer = require("multer");

const multerMiddleware = () => multer().any();

const getValueOr = (table, keysArray, or) => {
    try {
        let value;
        for (let key of keysArray) {
            value = table[key];
            table = table[key];
        }
        return value || 0;
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
    multerMiddleware,
    getValueOr,
    asyncErrorHandler,
};
