const db = require("../config/db");
const generateQrId = require("../utils/qrGenerator");
const { generateQrImage } = require("./qrImage.service");


function canCreateQr(userId) {
    return new Promise((resolve, reject) => {

        db.get(
            `SELECT max_qr_slots FROM users WHERE id = ?`,
            [userId],
            (err, user) => {

                if (err) return reject(err);
                if (!user) return resolve(false);

                db.get(
                    `SELECT COUNT(*) as count FROM qr_codes 
                     WHERE user_id = ? AND status = 'active'`,
                    [userId],
                    (err2, result) => {

                        if (err2) return reject(err2);

                        resolve(result.count < user.max_qr_slots);
                    }
                );
            }
        );

    });
}

async function createQr(userId, planType, metallic, phonePrimary, phoneSecondary) {

    const allowed = await canCreateQr(userId);

    if (!allowed) {
        throw new Error("Slot limit reached. Upgrade your plan.");
    }

    const qrId = generateQrId();

    return new Promise((resolve, reject) => {

        db.run(
            `INSERT INTO qr_codes 
            (qr_id, user_id, plan_type, metallic, status) 
            VALUES (?, ?, ?, ?, ?)`,
            [qrId, userId, planType, metallic ? 1 : 0, "active"],
            async function (err) {

                if (err) return reject(err);

                // Insert Primary Number
                db.run(
                    `INSERT INTO qr_numbers (qr_id, phone, type) VALUES (?, ?, ?)`,
                    [qrId, phonePrimary, "primary"]
                );

                // Insert Secondary Number (if provided)
                if (phoneSecondary) {
                    db.run(
                        `INSERT INTO qr_numbers (qr_id, phone, type) VALUES (?, ?, ?)`,
                        [qrId, phoneSecondary, "secondary"]
                    );
                }

                try {
                    await generateQrImage(qrId);
                    resolve(qrId);
                } catch (imageErr) {
                    reject(imageErr);
                }
            }
        );

    });
}

async function getPaginatedQRs({ limit, offset, search }) {
    let searchQuery = '';
    let params = [];

    if (search) {
        searchQuery = `WHERE code LIKE ? OR owner_name LIKE ?`;
        params.push(`%${search}%`, `%${search}%`);
    }

    const totalQuery = `
        SELECT COUNT(*) as total
        FROM qr_codes
        ${searchQuery}
    `;

    const dataQuery = `
        SELECT *
        FROM qr_codes
        ${searchQuery}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;

    const totalResult = await db.get(totalQuery, params);
    const dataResult = await db.all(dataQuery, [...params, limit, offset]);

    return {
        total: totalResult.total,
        pageSize: limit,
        data: dataResult
    };
}
module.exports = {
    getPaginatedQRs,
    // keep other existing exports untouched
};
module.exports = { createQr };