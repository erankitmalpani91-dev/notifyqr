const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Promisify db.get and db.all
const getQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

const allQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

router.get("/", async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Not logged in" });

    try {
        // Fetch user
        const user = await getQuery(
            `SELECT id, name, phone, email, created_at FROM users WHERE id = ?`,
            [userId]
        );
        if (!user) return res.json({ user: {}, qrs: [] });

        // Fetch QR codes
        const rows = await allQuery(
            `SELECT 
             q.qr_id, q.status, q.asset_name, q.product_type, q.order_id,
             q.source, q.expiry_date, q.created_at, n.phone, n.type
             FROM qr_codes q
             LEFT JOIN qr_numbers n ON q.qr_id = n.qr_id
             WHERE q.user_id = ?
             ORDER BY q.created_at DESC`,
            [userId]
        );

        // Group QR rows
        const grouped = {};
        rows.forEach(r => {
            if (!grouped[r.qr_id]) {
                grouped[r.qr_id] = {
                    qr_id: r.qr_id,
                    status: r.status || "inactive",
                    asset_name: r.asset_name,
                    product_type: r.product_type,
                    order_id: r.order_id,
                    primary: null,
                    secondary: null,
                    expiry: r.expiry_date,
                    created_at: r.created_at,
                    source: r.source
                };
            }

            if (r.type === "primary") grouped[r.qr_id].primary = r.phone;
            if (r.type === "secondary") grouped[r.qr_id].secondary = r.phone;
        });

        // Status logic
        const today = new Date();

        Object.values(grouped).forEach(q => {
            if (q.expiry) {
                const expiry = new Date(q.expiry);

                if (!isNaN(expiry)) {
                    if (today > expiry) q.status = "expired";
                    else if (q.primary) q.status = "active";
                    else q.status = "inactive";
                }
            } else {
                if (q.primary) q.status = "active";
                else q.status = "inactive";
            }
        });

        res.json({ user, qrs: Object.values(grouped) });

    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({ error: "Failed to load dashboard" });
    }
});

module.exports = router;