const multer = require("multer");
const aws = require("aws-sdk");

const multerMiddleware = (input_name_attr) =>
    multer({ dest: null }).single(input_name_attr);

const asyncErrorHandler = (fn) => {
    return function (req, res, next) {
        // Make sure to `.catch()` any errors and pass them along to the `next()`
        // middleware in the chain, in this case the error handler.
        fn(req, res, next).catch(next);
    };
};

module.exports = { multerMiddleware, asyncErrorHandler };
