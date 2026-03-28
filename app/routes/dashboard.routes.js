const express = require("express");
const router = express.Router();
const db = require("../config/db");

router.get("/", (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: "Not logged in" });
    }

    db.get(
        `SELECT name, phone, email, plan_type, max_qr_slots, subscription_expiry
         FROM users WHERE id = ?`,
        [userId],
        (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.json({ user: {}, qrs: [] });

            db.all(
                `
                SELECT 
                    q.qr_id,
                    q.status,
                    q.asset_name,
                    q.source,
                    q.expiry_date,
                    q.created_at,
                    n.phone,
                    n.type
                FROM qr_codes q
                LEFT JOIN qr_numbers n 
                ON q.qr_id = n.qr_id
                WHERE q.user_id = ?
                `,
                [userId],
                (err2, rows) => {
                    if (err2) return res.status(500).json({ error: err2.message });

                    const grouped = {};

                    rows.forEach(r => {
                        if (!grouped[r.qr_id]) {
                            grouped[r.qr_id] = {
                                qr_id: r.qr_id,
                                status: r.status,
                                asset_name: r.asset_name,
                                primary: null,
                                secondary: null,
                                expiry: r.expiry_date,
                                created_at: r.created_at,
                                source: r.source
                            };
                        }

                        if (r.type === "primary") {
                            grouped[r.qr_id].primary = r.phone;
                        }

                        if (r.type === "secondary") {
                            grouped[r.qr_id].secondary = r.phone;
                        }
                    });

                    const today = new Date();

                    Object.values(grouped).forEach(q => {

                        if (q.status === "disabled") {
                            return;
                        }

                        if (q.expiry) {
                            const expiry = new Date(q.expiry);
                            if (today > expiry) {
                                q.status = "expired";
                            } else {
                                q.status = "active";
                            }
                            return;
                        }

                        if (q.primary) {
                            q.status = "active";
                        } else {
                            q.status = "inactive";
                        }
                    });

                    res.json({
                        user,
                        qrs: Object.values(grouped)
                    });
                }
            ); // closes db.all
        }
    ); // closes outer db.get
}); // closes router.get

module.exports = router;