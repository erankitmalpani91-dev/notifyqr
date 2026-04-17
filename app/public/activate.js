// Pre-fill QR ID from URL param if present
const urlParams = new URLSearchParams(window.location.search);
const qrFromUrl = urlParams.get("qr");
if (qrFromUrl) {
    document.getElementById("qrIdInput").value = qrFromUrl.toUpperCase();
}

// Emoji map for product types
const typeEmoji = {
    car: "🚗", bike: "🏍️", auto: "🛺", CV: "🚚",
    bag: "👝", laptop: "💻", mobile: "📱", schoolbag: "🎒",
    kids: "🧒", elderly: "👴", pet: "🐶",
    homedelivery: "🏠", key: "🔑",
    employee: "🧑‍💼", shop: "🏪"
};

const typeLabel = {
    car: "Car Safety QR", bike: "Bike Safety QR", auto: "Auto Safety QR", CV: "Commercial Vehicle Safety QR",
    bag: "Bag Safety QR", laptop: "Laptop Safety QR", mobile: "Mobile Safety QR", schoolbag: "School Bag Safety QR",
    kids: "Kids Safety QR", elderly: "Elderly Safety QR", pet: "Pet Safety QR",
    homedelivery: "Home Safety & Delivery QR", key: "Key Safety QR",
    employee: "Employee Safety QR", shop: "Shop Safety QR"
};

const assetLabelPlaceholder = {
    car: "e.g. Honda City RJ45 6789",
    bike: "e.g. Royal Enfield DL12 AB34",
    auto: "e.g. Bajaj Auto DL12 AB34",
    CV: "e.g. Eicher Truck DL12 AB34",
    bag: "e.g. Black Laptop Bag",
    laptop: "e.g. Dell XPS Silver",
    mobile: "e.g. iPhone 18",
    schoolbag: "e.g. Black School Bag with Name Tag",
    kids: "e.g. Riya Age 6",
    elderly: "e.g. Ajeet Age 65",
    pet: "e.g. Labrador Brown Male",
    homedelivery: "e.g. Flat/House No 2026",
    key: "e.g. Home Front Door Keys",
    employee: "e.g. KPMG Id/Access Card",
    shop: "e.g. Ganpati Departmental Store",
    default: "e.g. Describe your asset"
};

let verifiedQrId = null;
let verifiedProductType = null;

// STEP 1 — Verify QR ID + PIN
function verifyQR() {
    const qrId = document.getElementById("qrIdInput").value.trim();
    const pin = document.getElementById("pinInput").value.trim();
    const btn = document.getElementById("lookupBtn");
    const status = document.getElementById("lookupStatus");

    status.className = "status-box";
    status.removeAttribute("style");

    if (!qrId) {
        showStatus("lookupStatus", "error", "Please enter your QR ID");
        return;
    }
    if (!pin || pin.length !== 6) {
        showStatus("lookupStatus", "error", "Please enter the 6-digit activation PIN");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Verifying...";

    fetch(window.location.origin + "/api/activate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_id: qrId, pin })
    })
        .then(res => {
            console.log("RESPONSE STATUS:", res.status);
            return res.json();
        })
        .then(data => {
            btn.disabled = false;
            btn.innerText = "Verify QR →";

            if (!data.success) {
                showStatus("lookupStatus", "error", data.message || "Invalid QR ID or PIN");
                return;
            }

            // Store verified values
            verifiedQrId = qrId;
            verifiedProductType = data.product_type;

            // Update QR type badge
            const emoji = typeEmoji[data.product_type] || "📦";
            const label = typeLabel[data.product_type] || data.product_type;

            document.getElementById("qrTypeEmoji").innerText = emoji;
            document.getElementById("qrTypeText").innerText = label;
            document.getElementById("qrIdDisplay").innerText = `· ${qrId}`;

            // Set asset label placeholder
            const placeholder = assetLabelPlaceholder[data.product_type] || assetLabelPlaceholder.default;
            document.getElementById("assetLabel").placeholder = placeholder;

            // Move to step 2
            setStep(2);
            document.getElementById("lookupSection").style.display = "none";
            document.getElementById("formSection").style.display = "block";
        })
        .catch(() => {
            btn.disabled = false;
            btn.innerText = "Verify QR →";
            showStatus("lookupStatus", "error", "Network error. Please try again.");
        });
}

// STEP 2 — Submit activation form
function submitActivation() {
    const name = document.getElementById("ownerName").value.trim();
    const email = document.getElementById("ownerEmail").value.trim();
    const phone = document.getElementById("ownerPhone").value.trim();
    const phone2 = document.getElementById("ownerPhone2").value.trim();
    const label = document.getElementById("assetLabel").value.trim();
    const btn = document.getElementById("activateBtn");

    // Validate
    if (!name) {
        showStatus("formStatus", "error", "Please enter your full name");
        return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showStatus("formStatus", "error", "Please enter a valid email address");
        return;
    }
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
        showStatus("formStatus", "error", "Enter valid 10-digit WhatsApp number starting with 6-9");
        return;
    }
    if (phone2 && !/^[6-9]\d{9}$/.test(phone2)) {
        showStatus("formStatus", "error", "Secondary number must be a valid 10-digit WhatsApp number");
        return;
    }
    if (phone2 && phone2 === phone) {
        showStatus("formStatus", "error", "Primary and secondary numbers cannot be the same");
        return;
    }
    if (!label) {
        showStatus("formStatus", "error", "Please enter an asset label to identify this QR");
        return;
    }
    if (label.length > 30) {
        showStatus("formStatus", "error", "Asset label must be 30 characters or less");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Activating...";
    showStatus("formStatus", "info", "Processing your activation...");

    fetch("/api/activate/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            qr_id: verifiedQrId,
            name,
            email,
            phone,
            phone2: phone2 || null,
            asset_label: label,
            product_type: verifiedProductType
        })
    })
        .then(res => res.json())
        .then(data => {
            btn.disabled = false;
            btn.innerText = "Activate QR ✓";

            if (!data.success) {
                showStatus("formStatus", "error", data.message || "Activation failed. Please try again.");
                return;
            }

            // Show success
            setStep(3);
            document.getElementById("formSection").style.display = "none";
            document.getElementById("successSection").style.display = "block";
        })
        .catch(() => {
            btn.disabled = false;
            btn.innerText = "Activate QR ✓";
            showStatus("formStatus", "error", "Network error. Please try again.");
        });
}

// Helper: update step dots
function setStep(step) {
    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById("dot" + i);
        if (i < step) dot.className = "step-dot done";
        else if (i === step) dot.className = "step-dot active";
        else dot.className = "step-dot";
    }
}

// Helper: show status message
function showStatus(id, type, message) {
    const box = document.getElementById(id);
    box.className = "status-box " + type;
    box.innerText = message;
}

// Allow Enter key on lookup inputs
document.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        if (document.getElementById("lookupSection").style.display !== "none") {
            verifyQR();
        } else if (document.getElementById("formSection").style.display !== "none") {
            submitActivation();
        }
    }
});