const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contact.controller");
const db = require("../config/db");

router.post("/contact-sales", contactController.submitEnquiry);
router.get("/contact-sales", contactController.getEnquiries);
router.post("/whatsapp-contact", (req, res) => {
    const { name, phone, email, company, message } = req.body;

    console.log("Incoming WhatsApp enquiry:", req.body);

    db.run(
        `INSERT INTO contact_sales 
        (name, phone, email, company, message, source)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
            name || null,
            phone || null,
            email || null,
            company || null,
            message || null,
            "WHATSAPP"
        ],
        function (err) {

            if (err) {
                console.error("DB Error:", err);   // 🔥 ADD THIS
                return res.json({ success: false });
            }

            const whatsappUrl =
                "https://wa.me/919999999999?text=Hi%20ReachOutOwner%20Team,%20I%20want%20bulk%20pricing.";

            res.json({
                success: true,
                redirect: whatsappUrl
            });
        }
    );
});


module.exports = router;


