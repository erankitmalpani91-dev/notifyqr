const crypto = require("crypto");

function generateQrId() {

    const prefix = "RO";

    // 4 random bytes
    const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();

    // last 4 digits of timestamp
    const timePart = Date.now().toString().slice(-4);

    return `${prefix}${timePart}${randomPart}`;
}

module.exports = generateQrId;