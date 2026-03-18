const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendEmail(email, subject, message) {
    try {
        await transporter.sendMail({
            from: "ReachOutOwner <reachoutowner@gmail.com>",
            to: email,
            subject,
            html: `<pre style="font-family:Arial">${message}</pre>`
        });

        console.log("EMAIL SENT TO:", email);

    } catch (err) {
        console.log("EMAIL ERROR:", err);
    }
}

module.exports = { sendEmail };