const db = require("../config/db");

exports.create = (data, callback) => {
    const { name, phone, email, company, message, source } = data;

    db.run(
        `INSERT INTO contact_sales 
    (name, phone, email, company, message, source) 
    VALUES (?, ?, ?, ?, ?, ?)`,
        [name, phone, email, company || null, message || null, source || "FORM"],
        function (err) {
            callback(err, this?.lastID);
        }
    );
};

exports.getAll = (callback) => {
    db.all(
        `SELECT * FROM contact_sales ORDER BY created_at DESC`,
        [],
        callback
    );
};
