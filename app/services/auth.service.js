const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

async function registerUser(name, email, password, phone) {
    const hash = await bcrypt.hash(password, 10);

    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO users (name, email, password_hash, phone, role)
             VALUES (?, ?, ?, ?, ?)`,
            [name, email, hash, phone, "owner"],
            function (err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
}

async function loginUser(phone, password) {

    return new Promise((resolve, reject) => {

        db.get(`SELECT * FROM users WHERE phone = ?`, [phone], async (err, user) => {

            if (err) return reject(err);
            if (!user) return reject("User not found");

            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) return reject("Invalid password");

            const token = jwt.sign(
                { id: user.id, role: user.role },
                JWT_SECRET,
                { expiresIn: "7d" }
            );

            resolve(token);
        });
    });
}

module.exports = { registerUser, loginUser };