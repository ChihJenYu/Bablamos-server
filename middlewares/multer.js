const multer = require("multer");
const multerMiddleware = multer({
    dest: null,
    limits: {
        fileSize: 512000,
    },
    fileFilter(req, file, cb) {
        if (
            !(
                file.originalname.endsWith(".jpg") ||
                file.originalname.endsWith(".jpeg") ||
                file.originalname.endsWith(".png")
            )
        ) {
            return cb(new Error("Please upload an image"));
        }
        return cb(undefined, true);
    },
}).fields([{ name: "cover-pic" }, { name: "profile-pic" }]);

module.exports = multerMiddleware;
