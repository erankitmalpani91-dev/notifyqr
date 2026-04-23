const axios = require("axios");

async function sendWhatsApp(to, data) {
    try {
        to = to.replace(/\D/g, "");
        if (to.length === 10) to = "91" + to;

        // Determine template name and parameters
        // Format A: { template, params[] } — used by alert.routes.js
        // Format B: { name, link } — used by activate.routes.js and auth.routes.js
        let templateName, parameters;

        if (data.template && data.params) {
            templateName = data.template;
            parameters = data.params.map(p => ({ type: "text", text: String(p) }));
        } else {
            // Magic login / purchase success template
            templateName = "qr_purchase_success";
            parameters = [
                { type: "text", text: data.name || "" },
                { type: "text", text: data.link || "" }
            ];
        }

        const response = await axios.post(
            `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: "en" },
                    components: [
                        {
                            type: "body",
                            parameters
                        }
                    ]
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const messageId = response.data?.messages?.[0]?.id;

        if (!messageId) {
            console.log("⚠️ No messageId returned from WhatsApp:", response.data);
            return null;
        }

        console.log("✅ WHATSAPP SENT:", to);
        console.log("📩 MESSAGE ID:", messageId);

        return messageId;

    } catch (err) {
        console.log("❌ WHATSAPP ERROR:", err.response?.data || err.message);
        return null; // 🔥 IMPORTANT
    }
}

module.exports = { sendWhatsApp };

// Send a free-text WhatsApp message (only works within 24hr window after user messaged you)
async function sendWhatsAppText(to, text) {
    try {
        to = to.replace(/\D/g, "");
        if (to.length === 10) to = "91" + to;

        const response = await axios.post(
            `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const messageId = response.data?.messages?.[0]?.id;
        if (!messageId) {
            console.log("⚠️ No messageId from free-text send:", response.data);
            return null;
        }
        console.log("✅ FREE TEXT SENT:", to);
        console.log("📩 MESSAGE ID:", messageId);
        return messageId;

    } catch (err) {
        console.log("❌ FREE TEXT ERROR:", err.response?.data || err.message);
        return null;
    }
}

module.exports = { sendWhatsApp, sendWhatsAppText };