const express = require("express");
const router = express.Router();
const db = require("../config/db");
const verify = require("../middlewares/auth.middleware");

router.post("/attach", verify, (req, res) => {

    const { qr_id, asset_name } = req.body;

    db.run(
        `UPDATE qr_codes
SET asset_name=?
WHERE qr_id=? AND user_id=?`,
        [asset_name, qr_id, req.user.id],
        () => res.json({ success: true })
    );

});

module.exports = router;