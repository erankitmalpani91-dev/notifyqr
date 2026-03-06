const express = require("express");
const router = express.Router();
const { registerUser, loginUser } = require("../services/auth.service");

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
    const { email, password } = req.body;

    try {
        const token = await loginUser(email, password);
        res.json({ success: true, token });
    } catch (err) {
        res.status(400).json({ success: false, error: err });
    }
});

module.exports = router;