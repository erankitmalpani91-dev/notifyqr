const bcrypt = require("bcrypt");
const db = require("../config/db");

(async () => {
    const hash = await bcrypt.hash("admin123", 10);

    db.run(
        `INSERT INTO users 
        (name, email, password_hash, role, subscription_status, max_qr_slots)
        VALUES (?, ?, ?, ?, ?, ?)`,
        ["Admin", "admin", hash, "admin", "active", 9999],
        function (err) {
            if (err) {
                console.error("Admin exists or error:", err.message);
            } else {
                console.log("Admin created successfully");
            }
            process.exit();
        }
    );
})();