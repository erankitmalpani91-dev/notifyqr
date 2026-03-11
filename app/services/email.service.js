const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendEmail(email, subject, message) {

    await transporter.sendMail({
        from: "ReachOutOwner <support@reachoutowner.com>",
        to: email,
        subject,
        text: message
    });

}

module.exports = { sendEmail };