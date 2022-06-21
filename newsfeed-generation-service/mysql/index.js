const mysql = require("mysql2/promise");
const pool = mysql.createPool({
    host: process.env.DBHOST,
    user: process.env.DBUSER,
    password: process.env.DBPASSWORD,
    database: process.env.DATABASE,
});

const translateFilter = (filter) => {
    let args = [];
    let whereClause = "";

    let filterColumns = [];
    if (filter) {
        whereClause = "WHERE ";
        filterColumns = Object.keys(filter);
    }

    for (let col of filterColumns) {
        if (filter[col].not) {
            if (filter[col].not.like) {
                args.push(filter[col].not.like);
                whereClause += `${col} not like ? and `;
            } else if (filter[col].not.in) {
                args.push([filter[col].not.in]);
                whereClause += `${col} not in ? and `;
            } else {
                args.push(filter[col].not);
                whereClause += `${col} != ? and `;
            }
        } else if (filter[col].in) {
            args.push([filter[col].in]);
            whereClause += `${col} in ? and `;
        } else {
            if (filter[col].like) {
                args.push(filter[col].like);
                whereClause += `${col} like ? and `;
            } else {
                args.push(filter[col]);
                whereClause += `${col} = ? and `;
            }
        }
    }
    whereClause = whereClause.substring(0, whereClause.length - 5);
    return { whereClause, args };
};

const translateUpdate = (update) => {
    if (!update) {
        throw new Error(
            "Update object is necessary in a Model.update statement"
        );
    }
    let args = [];
    let setClause = "SET ";

    const updateColumns = Object.keys(update); // {category: "men", title: "sometitle"}
    for (let col of updateColumns) {
        args.push(update[col]);
        setClause += `${col} = ?, `;
    }
    setClause = setClause.substring(0, setClause.length - 2);
    return { setClause, args };
};

module.exports = {
    pool,
    translateFilter,
    translateUpdate,
};
