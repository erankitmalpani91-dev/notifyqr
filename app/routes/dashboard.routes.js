const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/auth.middleware");
const db = require("../config/db");

router.get("/dashboard", verifyToken, (req, res) => {

    db.all(
        `
    SELECT 
        q.*,
        COUNT(s.id) as scan_count,
        MAX(s.scanned_at) as last_scan
    FROM qr_codes q
    LEFT JOIN scan_logs s ON q.qr_id = s.qr_id
    WHERE q.user_id = ?
    GROUP BY q.qr_id
    `,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "Server error" });
            res.json({ user: req.user, qrs: rows });
        }
    );
});

module.exports = router;