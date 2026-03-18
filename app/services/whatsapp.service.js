const axios = require("axios");

async function sendWhatsAppAlert(phone, message, location, qrId) {

    const url = "https://api.gupshup.io/sm/api/v1/msg";

    const payload = {
        channel: "whatsapp",
        source: "YOUR_GUPSHUP_NUMBER",
        destination: phone,
        message: JSON.stringify({
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: `🚨 Alert\n\n${message}\n\n📍 ${location}`
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: `coming_${qrId}`,
                                title: "I'm coming"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: `2min_${qrId}`,
                                title: "2 mins"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: `call_${qrId}`,
                                title: "Call me"
                            }
                        }
                    ]
                }
            }
        })
    };

    await axios.post(url, payload, {
        headers: {
            apikey: process.env.GUPSHUP_API_KEY,
            "Content-Type": "application/json"
        }
    });
}

module.exports = { sendWhatsAppAlert };