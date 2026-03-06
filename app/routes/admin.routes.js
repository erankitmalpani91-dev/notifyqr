const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");
const path = require("path");

/* ---------------- ADMIN LOGIN PAGE ---------------- */
router.get("/login", (req, res) => {
    res.sendFile(
        path.join(__dirname, "../public/admin-login.html")
    );
});
/* ---------------- ADMIN LOGIN ---------------- */
router.post("/login", (req, res) => {

    const { username, password } = req.body;

    db.get(
        `SELECT * FROM users WHERE email = ? AND role = 'admin'`,
        [username],
        async (err, user) => {

            if (err) return res.status(500).json({ success: false });

            if (!user) {
                return res.json({ success: false });
            }

            const match = await bcrypt.compare(password, user.password_hash);

            if (!match) {
                return res.json({ success: false });
            }

            req.session.admin = {
                id: user.id,
                email: user.email
            };

            if (req.body.remember) {
                req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            }

            res.json({ success: true });
        }
    );
});

/* ---------------- ADMIN LOGOUT ---------------- */
router.post("/logout", (req, res) => {

    req.session.destroy(() => {

        res.json({ success: true });

    });

});

/* ---------------- SESSION CHECK MIDDLEWARE ---------------- */
function checkAdmin(req, res, next) {
    if (!req.session.admin) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

router.get("/dashboard", (req, res) => {
    if (!req.session.admin) {
        return res.redirect("/admin/login");
    }

    res.sendFile(
        path.join(__dirname, "../public/admin-dashboard.html")
    );
});

/* ---------------- ISSUE SINGLE STICKER ---------------- */
router.get("/issue-sticker/:id", checkAdmin, (req, res) => {

    const stickerId = req.params.id;

    db.run(
        `INSERT INTO qr_codes (qr_id, user_id, plan_type, status)
         VALUES (?, ?, ?, ?)`,
        [stickerId, 1, "admin-issued", "inactive"],
        function (err) {
            if (err) return res.send("Failed to issue");
            res.send("Sticker issued successfully");
        }
    );
});

/* ---------------- ISSUE BULK ---------------- */
router.post("/issue-batch", checkAdmin, (req, res) => {

    const { prefix, from, to } = req.body;

    let issued = 0;

    const stmt = db.prepare(
        `INSERT INTO qr_codes (qr_id, user_id, plan_type, status)
         VALUES (?, ?, ?, ?)`
    );

    for (let i = from; i <= to; i++) {
        const id = `${prefix}-${i}`;
        stmt.run(id, 1, "admin-issued", "inactive");
        issued++;
    }

    stmt.finalize();

    res.json({ issued });
});

/* ---------------- ANALYTICS ---------------- */
router.get("/analytics", checkAdmin, (req, res) => {

    db.all(
        `SELECT q.qr_id as sticker_id,
                COUNT(s.id) as total_scans,
                0 as emergencies,
                MAX(s.scanned_at) as last_scan
         FROM qr_codes q
         LEFT JOIN scan_logs s ON q.qr_id = s.qr_id
         GROUP BY q.qr_id`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json([]);
            res.json(rows);
        }
    );
});

/* ---------------- QR INVENTORY ---------------- */

router.get("/qr", checkAdmin, (req, res) => {

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const offset = (page - 1) * limit;

    const query = `
    SELECT
    qr_codes.qr_id as code,
    qr_codes.status,
    users.email as owner_email,
    (
        SELECT scanned_at
        FROM scan_logs
        WHERE qr_id = qr_codes.qr_id
        ORDER BY scanned_at DESC
        LIMIT 1
    ) as last_scan
    FROM qr_codes
    LEFT JOIN users
    ON qr_codes.user_id = users.id
    ORDER BY qr_codes.id DESC
    LIMIT ? OFFSET ?
    `;

    db.all(query, [limit, offset], (err, rows) => {

        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database error" });
        }

        res.json({
            data: rows
        });

    });

});


/* ---------------- GENERATE QR ---------------- */

router.post("/generate-qr", checkAdmin, (req, res) => {

    const { prefix, count } = req.body;

    if (!prefix || !count) {
        return res.json({ message: "Invalid input" });
    }

    const stmt = db.prepare(`
        INSERT INTO qr_codes (qr_id, user_id, plan_type, status)
        VALUES (?, ?, ?, ?)
    `);

    for (let i = 1; i <= count; i++) {

        const qr = `${prefix}-${Date.now()}-${i}`;

        stmt.run(qr, 1, "admin-generated", "inactive");

    }

    stmt.finalize();

    res.json({
        message: `${count} QR codes generated`
    });

});

module.exports = router;