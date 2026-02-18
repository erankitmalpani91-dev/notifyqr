const Contact = require("../models/contact.model");

exports.submitEnquiry = (req, res) => {
    const { name, phone, email, company, message } = req.body;

    if (!name || !phone || !email) {
        return res.json({ success: false });
    }

    Contact.create(
        { name, phone, email, company, message, source: "FORM" },
        (err, id) => {
            if (err) {
                console.error(err);
                return res.json({ success: false });
            }

            res.json({ success: true });
        }
    );
};

exports.getEnquiries = (req, res) => {
    Contact.getAll((err, rows) => {
        if (err) return res.json([]);
        res.json(rows);
    });
};
