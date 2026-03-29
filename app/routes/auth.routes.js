const express = require("express");
const router = express.Router();
const { registerUser, loginUser } = require("../services/auth.service");
const db = require("../config/db");   // <-- Fix
const bcrypt = require("bcrypt");     // <-- Needed for hashing


router.get("/quick-register", async (req, res) => {
    try {
        const userId = await registerUser(
            "Ankit",
            "ankit@test.com",
            "123456",
            "9876543210"
        );

        res.send("User Created with ID: " + userId);
    } catch (err) {
        res.send("Error: " + err);
    }
});

router.post("/register", async (req, res) => {
    const { name, email, password, phone } = req.body;

    try {
        const userId = await registerUser(name, email, password, phone);
        res.json({ success: true, userId });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message || err });
    }
});

router.post("/login", async (req, res) => {

    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ error: "Phone and password required" });
    }

    try {

        const token = await loginUser(phone, password);

        res.json({ token });

    } catch (err) {

        console.log("LOGIN ERROR:", err);

        res.status(400).json({ error: err });

    }

});

const crypto = require("crypto");

router.post("/forgot-password", (req, res) => {

    const { phone } = req.body;

    db.get(`SELECT * FROM users WHERE phone=?`, [phone], async (err, user) => {

        if (!user) return res.json({ message: "User not found" });

        const token = crypto.randomBytes(32).toString("hex");

        db.run(
            `UPDATE users SET login_token=? WHERE id=?`,
            [token, user.id]
        );

        const loginLink = `https://reachoutowner.com/magic-login/${token}`;

        await sendWhatsApp(user.phone, {
            name: user.name,
            link: loginLink
        });

        await sendEmail(user.email, "Login Link", `
            Click here to login:
            <a href="${loginLink}">Login</a>
        `);

        res.json({ success: true, message: "Login link sent" });

    });

});

router.post("/reset-password", async (req, res) => {

    const { token, password } = req.body;

    db.get(
        `SELECT * FROM users WHERE reset_token=?`,
        [token],
        async (err, user) => {

            if (!user) return res.json({ message: "Invalid token" });

            if (new Date() > new Date(user.reset_expiry)) {
                return res.json({ message: "Token expired" });
            }

            const hash = await require("bcrypt").hash(password, 10);

            db.run(
                `UPDATE users 
                 SET password_hash=?, reset_token=NULL, reset_expiry=NULL 
                 WHERE id=?`,
                [hash, user.id]
            );

            res.json({ success: true, message: "Password updated" });

        }
    );

});

// Magic Link//

const { sendWhatsApp } = require("../services/whatsapp.service");
const { sendEmail } = require("../services/email.service");

router.post("/send-login-link", (req, res) => {

    const { phone } = req.body;

    db.get(`SELECT * FROM users WHERE phone=?`, [phone], async (err, user) => {

        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        const token = crypto.randomBytes(32).toString("hex");

        db.run(
            `UPDATE users SET login_token=? WHERE id=?`,
            [token, user.id]
        );

        const loginLink = `https://reachoutowner.com/magic-login/${token}`;

        await sendWhatsApp(user.phone, {
            name: user.name,
            link: loginLink
        });

        await sendEmail(user.email, "Login Link", `
            Click here to login:
            <a href="${loginLink}">Login</a>
        `);

        res.json({ success: true });

    });

});

module.exports = router;