const db = require("../config/db");

// Activate or Upgrade Plan
function activateOrUpgrade(userId, planType) {

    planType = String(planType);

    let maxSlots = 0;
    let amount = 0;

    if (planType === "299") {
        maxSlots = 1;
        amount = 299;
    }

    if (planType === "499") {
        maxSlots = 3;
        amount = 499;
    }

    return new Promise((resolve, reject) => {

        db.serialize(() => {

            db.run(
                `
                UPDATE users SET
                plan_type = ?,
                max_qr_slots = ?,
                subscription_expiry = DATE('now', '+1 year'),
                subscription_status = 'active'
                WHERE id = ?
                `,
                [planType, maxSlots, userId]
            );

            db.run(
                `
                INSERT INTO orders 
                (user_id, plan_type, amount, payment_status, transaction_type, slots)
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [userId, planType, amount, "paid", "upgrade", maxSlots]
            );

        });

        resolve();
    });
}

// Renewal with Slot Selection
function renewSubscription(userId, selectedSlots) {

    let baseAmount = 0;

    return new Promise((resolve, reject) => {

        db.get(
            `SELECT plan_type FROM users WHERE id = ?`,
            [userId],
            (err, user) => {

                if (err) return reject(err);

                if (user.plan_type === "299") baseAmount = 199;
                if (user.plan_type === "499") baseAmount = 249;

                const extraSlots = selectedSlots - (user.plan_type === "299" ? 1 : 3);
                const extraAmount = extraSlots > 0 ? extraSlots * 99 : 0;

                const totalAmount = baseAmount + extraAmount;

                db.get(
                    `SELECT COUNT(*) as activeCount FROM qr_codes 
                     WHERE user_id = ? AND status = 'active'`,
                    [userId],
                    (err2, result) => {

                        if (err2) return reject(err2);

                        if (selectedSlots < result.activeCount) {
                            return reject(
                                new Error("Deactivate extra QRs before reducing slots.")
                            );
                        }

                        db.serialize(() => {

                            db.run(
                                `
                                UPDATE users SET
                                max_qr_slots = ?,
                                subscription_expiry = DATE('now', '+1 year'),
                                subscription_status = 'active'
                                WHERE id = ?
                                `,
                                [selectedSlots, userId]
                            );

                            db.run(
                                `
                                INSERT INTO orders 
                                (user_id, plan_type, amount, payment_status, transaction_type, slots)
                                VALUES (?, ?, ?, ?, ?, ?)
                                `,
                                [userId, user.plan_type, totalAmount, "paid", "renewal", selectedSlots]
                            );

                        });

                        resolve();
                    }
                );

            }
        );

    });
}

module.exports = {
    activateOrUpgrade,
    renewSubscription
};