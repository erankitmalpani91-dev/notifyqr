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

    db.get(`SELECT * FROM users WHERE phone=?`, [phone], (err, user) => {

        if (!user) return res.json({ message: "User not found" });

        const token = crypto.randomBytes(20).toString("hex");

        const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        db.run(
            `UPDATE users SET reset_token=?, reset_expiry=? WHERE id=?`,
            [token, expiry, user.id]
        );

        console.log(`RESET LINK: http://localhost:3000/reset.html?token=${token}`);

        res.json({
            message: "Reset link generated (check console for now)"
        });

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

module.exports = router;