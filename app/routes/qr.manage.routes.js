const express = require("express");
const router = express.Router();
const db = require("../config/db");
const verify = require("../middlewares/auth.middleware");

router.post("/activate", verify, (req, res) => {

    const { qr_id, asset_name, primary, secondary } = req.body;
    db.run(
        `UPDATE qr_codes
     SET status='active',
         asset_name = ?,
         expiry_date = DATE('now', '+365 days'),
         claimed_at = CURRENT_TIMESTAMP
     WHERE qr_id=? AND user_id=?`,
        [asset_name, qr_id, req.user.id],
        () => {

            db.run(`DELETE FROM qr_numbers WHERE qr_id=?`, [qr_id]);

            db.run(`INSERT INTO qr_numbers (qr_id, phone, type) VALUES (?, ?, ?)`,
                [qr_id, primary, "primary"]);

            if (secondary) {
                db.run(`INSERT INTO qr_numbers (qr_id, phone, type) VALUES (?, ?, ?)`,
                    [qr_id, secondary, "secondary"]);
            }

            res.json({ success: true });
        }
    );
    

    });


router.post("/deactivate", verify, (req, res) => {

    const { qr_id } = req.body;

    db.run(
        `UPDATE qr_codes
SET status='disabled'
WHERE qr_id=? AND user_id=?`,
        [qr_id, req.user.id],
        () => res.json({ success: true })
    );

});

router.post("/reactivate", verify, (req, res) => {

    const { qr_id } = req.body;

    db.run(
        `UPDATE qr_codes
         SET status='active'
         WHERE qr_id=? AND user_id=?`,
        [qr_id, req.user.id],
        () => res.json({ success: true })
    );

});
router.post("/deactivate", verify, (req, res) => {

    const { qr_id } = req.body;

    db.run(
        `UPDATE qr_codes
SET status='disabled'
WHERE qr_id=? AND user_id=?`,
        [qr_id, req.user.id],
        () => res.json({ success: true })
    );

});

router.post("/reactivate", verify, (req, res) => {

    const { qr_id } = req.body;

    db.run(
        `UPDATE qr_codes
         SET status='active'
         WHERE qr_id=? AND user_id=?`,
        [qr_id, req.user.id],
        () => res.json({ success: true })
    );

});

router.post("/add-secondary", verify, (req, res) => {

    const { qr_id, phone } = req.body;

    // Check if already exists
    db.get(
        `SELECT * FROM qr_numbers WHERE qr_id=? AND type='secondary'`,
        [qr_id],
        (err, existing) => {

            if (existing) {
                return res.json({ success: false, message: "Secondary already exists" });
            }

            db.run(
                `INSERT INTO qr_numbers (qr_id, phone, type)
                 VALUES (?, ?, 'secondary')`,
                [qr_id, phone],
                function (err) {

                    if (err) {
                        return res.json({ success: false, message: "DB Error" });
                    }

                    res.json({ success: true });

                }
            );

        }
    );

});

router.post("/update-secondary", verify, (req, res) => {

    const { qr_id, phone } = req.body;

    db.run(
        `UPDATE qr_numbers 
         SET phone=? 
         WHERE qr_id=? AND type='secondary'`,
        [phone, qr_id],
        function (err) {

            if (err) {
                return res.json({ success: false });
            }

            res.json({ success: true });
        }
    );

});

module.exports = router;