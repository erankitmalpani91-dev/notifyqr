const db = require("../config/db");

function checkSubscription(req, res, next) {

    const userId = req.user.id;

    db.get(
        `SELECT subscription_expiry, subscription_status 
         FROM users WHERE id = ?`,
        [userId],
        (err, user) => {

            if (err) return res.status(500).json({ error: "Server error" });

            if (!user.subscription_expiry) {
                return res.status(403).json({ error: "No active subscription" });
            }

            const today = new Date();
            const expiry = new Date(user.subscription_expiry);

            if (today > expiry) {
                db.run(
                    `UPDATE users SET subscription_status = 'expired' WHERE id = ?`,
                    [userId]
                );
                return res.status(403).json({ error: "Subscription expired" });
            }

            next();
        }
    );
}

module.exports = checkSubscription;