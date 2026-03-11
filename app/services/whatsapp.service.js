async function sendWhatsApp(phone, message) {

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    console.log("Send this WhatsApp message:", url);

}

module.exports = { sendWhatsApp };