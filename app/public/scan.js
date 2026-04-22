const params = new URLSearchParams(window.location.search);
const qrId = params.get("qr");
const messageCache = new Set();


let selectedMessage = "";
let allMessages = [];
let pollInterval = null;
let currentScanId = null;

// Single source of truth for what has been rendered
// Initialised here at module level so sendFollowup() can access it too
const rendered = {
    ownerReply: false,
    finderFollowup: false,
    ownerReply2: false
};

// Predefined messages per asset type
const messageMap = {
    car: [
        "Your car is blocking the way",
        "Your car lights are on",
        "Please move your car",
        "Car parked in a no parking zone",
        "Car alarm is ringing",
        "Car window is open",
        "Smoke or fire seen in your car",
        "Fluid leaking from your car",
        "Your car was hit or damaged"
    ],
    bike: [
        "Your bike is blocking the way",
        "Your bike lights are on",
        "Please move your bike",
        "Bike parked in a no parking zone",
        "Bike alarm is ringing",
        "Bike has fallen or tipped over",
        "Fuel or oil leaking from your bike"
    ],
    auto: [
        "Your auto is blocking the way",
        "Please move your auto",
        "Auto parked in a no parking zone",
        "Your auto lights are on",
        "Auto seems to have an issue"
    ],
    CV: [
        "Your vehicle is blocking the way",
        "Please move your vehicle",
        "Vehicle parked in a restricted area",
        "Your vehicle lights are on",
        "Possible issue noticed in your vehicle"
    ],
    bag: [
        "I found your bag",
        "Your bag is unattended",
        "Your bag was left behind",
        "Bag found at this location"
    ],
    schoolbag: [
        "I found a school bag",
        "School bag left behind",
        "Your child's bag is unattended"
    ],
    laptop: [
        "I found your laptop",
        "Your laptop is unattended",
        "Laptop left behind at this location"
    ],
    mobile: [
        "I found your mobile phone",
        "Mobile phone left behind",
        "Your phone is unattended"
    ],
    key: [
        "I found your keys",
        "Your keys were left behind",
        "Keys found at this location"
    ],
    pet: [
        "I found your pet",
        "Your pet seems lost",
        "Your pet is unattended",
        "Pet found roaming nearby"
    ],
    kids: [
        "I found a child with this tag",
        "Child needs assistance",
        "Child appears lost",
        "Child is alone and needs help"
    ],
    elderly: [
        "An elderly person needs assistance",
        "Elderly person seems lost",
        "Found elderly person with this tag",
        "Elderly person needs help"
    ],
    homedelivery: [
        "Delivery attempt failed",
        "Package could not be delivered",
        "Please contact regarding your delivery",
        "Delivery person tried to reach you"
    ],
    employee: [
        "Employee ID found",
        "Employee needs assistance",
        "ID card was found",
        "Please contact regarding employee ID"
    ],
    shop: [
        "Shop is closed, customer waiting",
        "Issue at your shop location",
        "Please contact regarding your shop",
        "Customer needs assistance at your shop"
    ],
    default: [
        "I found your item",
        "Your item is unattended",
        "Please contact me",
        "Item found at this location"
    ]
};

if (!qrId) {
    document.getElementById("title").innerText = "Invalid QR Code";
} else {
    loadQR();
}

function loadQR() {
    fetch("/api/alerts/qr-info/" + qrId)
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                document.getElementById("title").innerText = data.message || "QR Not Active";
                return;
            }
            const assetType = (data.product_type || "default").toLowerCase();
            document.getElementById("title").innerText = "Notify Owner";
            document.getElementById("mainContent").style.display = "block";
            allMessages = messageMap[assetType] || messageMap["default"];
            renderButtons(allMessages.slice(0, 3));
        })
        .catch(() => {
            document.getElementById("title").innerText = "Unable to load QR";
        });
}

function renderButtons(msgs) {
    const btnDiv = document.getElementById("buttons");
    btnDiv.innerHTML = "";
    msgs.forEach(msg => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.innerText = msg;
        btn.onclick = () => {
            selectedMessage = msg;
            document.querySelectorAll("#buttons .btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            const customBox = document.getElementById("customMsg");
            customBox.value = msg;
            customBox.dataset.prefilled = "true";
            updateCharCount();
        };
        btnDiv.appendChild(btn);
    });
    const first = btnDiv.querySelector(".btn");
    if (first) first.click();
}

function showMore() {
    renderButtons(allMessages);
    document.getElementById("moreOptions").style.display = "none";
}

function updateCharCount() {
    const val = document.getElementById("customMsg").value.length;
    document.getElementById("charCount").innerText = val;
    document.getElementById("customMsg").dataset.prefilled = "false";
}

function notifyOwner() {
    const customText = document.getElementById("customMsg").value.trim();
    const finalMessage = customText || selectedMessage;

    if (!finalMessage) {
        alert("Please select an issue or write a message");
        return;
    }

    const btn = document.getElementById("notifyBtn");
    btn.disabled = true;
    btn.innerText = "Sending...";
    showStatus("sending", "Sending notification...");

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const location = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
                sendAlert(finalMessage, location);
            },
            () => sendAlert(finalMessage, null),
            { timeout: 5000 }
        );
    } else {
        sendAlert(finalMessage, null);
    }
}


// Replace existing sendAlert with this version
function sendAlert(message, location) {
    const btn = document.getElementById("notifyBtn");

    fetch("/api/alerts/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_id: qrId, message, location })
    })
        .then(async res => {
            // Try to parse JSON, but handle parse errors
            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                console.error("Failed to parse JSON from /send-alert:", e);
            }
            return { ok: res.ok, status: res.status, data };
        })
        .then(({ ok, status, data }) => {
            // Ensure button reference exists
            const btn = document.getElementById("notifyBtn");

            if (!ok || !data) {
                console.error("Bad response from /send-alert", status, data);
                btn.disabled = false;
                btn.innerText = "Notify Owner";
                showStatus("error", "Network error. Please try again.");
                return;
            }

            if (data.success) {
                // Wrap UI updates so DOM errors don't fall into network catch
                try {
                    currentScanId = data.scan_id;
                    btn.innerText = "✅ Owner Notified";
                    showStatus("success", "Owner has been notified. Waiting for reply...");

                    document.getElementById("convoThread").style.display = "flex";
                    addBubble("finder", message);

                    rendered.ownerReply = false;
                    rendered.finderFollowup = false;
                    rendered.ownerReply2 = false;

                    startPolling(currentScanId);
                    setTimeout(() => startCooldown(), 2000);
                } catch (uiErr) {
                    console.error("UI update error after send-alert:", uiErr);
                    // Keep success state; do not show network error
                }
            } else {
                btn.disabled = false;
                btn.innerText = "Notify Owner";
                showStatus("error", data.message || "Failed to notify. Please try again.");
            }
        })
        .catch(err => {
            console.error("sendAlert fetch error:", err);
            const btn = document.getElementById("notifyBtn");
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Notify Owner";
            }
            showStatus("error", "Network error. Please try again.");
        });
}

function startPolling(scanId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(() => {
        fetch("/api/alerts/reply/" + scanId)
            .then(res => res.json())
            .then(data => {
                if (!data.success) return;

                // Owner's first reply
                if (data.reply && !rendered.ownerReply) {
                    rendered.ownerReply = true;
                    addBubble("owner", data.reply);
                    showStatus("success", "✅ Owner has responded!");
                    // Only show follow-up box if finder hasn't sent one yet
                    if (!rendered.finderFollowup) {
                        document.getElementById("followupBox").style.display = "block";
                    }
                }

                // Finder's follow-up — only add from poll if NOT already added by sendFollowup()
                if (data.finder_followup && !rendered.finderFollowup) {
                    rendered.finderFollowup = true;
                    document.getElementById("followupBox").style.display = "none";
                    // ❌ DO NOT addBubble here
                    // Only acknowledge
                    showStatus("success", "✅ Follow-up delivered");
                }

                // Owner's second reply
                if (data.owner_reply2 && !rendered.ownerReply2) {
                    rendered.ownerReply2 = true;
                    addBubble("owner", data.owner_reply2);
                    showStatus("success", "✅ Owner replied again!");
                    clearInterval(pollInterval);
                }
            })
            .catch(() => { });
    }, 5000);

    setTimeout(() => clearInterval(pollInterval), 900000);
}

function addBubble(who, text) {
    try {
        if (!text || !text.trim()) return;

        const thread = document.getElementById("convoThread");
        const key = who + "|" + text.trim();
        if (messageCache.has(key)) return;
        messageCache.add(key);

        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";
        wrapper.style.alignItems = who === "owner" ? "flex-end" : "flex-start";

        const label = document.createElement("div");
        label.className = "bubble-label" + (who === "owner" ? " right" : "");
        label.innerText = who === "owner" ? "Owner" : "You";

        const bubble = document.createElement("div");
        bubble.className = "bubble bubble-" + who;
        bubble.innerText = text.trim();

        wrapper.appendChild(label);
        wrapper.appendChild(bubble);
        thread.appendChild(wrapper);
        wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
        console.error("addBubble error:", err);
    }
}


function sendFollowup() {
    const msg = document.getElementById("followupMsg").value.trim();
    if (!msg) { alert("Please type a follow-up message"); return; }
    if (!currentScanId) return;

    const btn = document.getElementById("followupBtn");
    btn.disabled = true;
    btn.innerText = "Sending...";

    // Mark as rendered IMMEDIATELY before the fetch
    // so polling can never add it even if it fires during the request
    rendered.finderFollowup = true;

    fetch("/api/alerts/send-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: currentScanId, message: msg })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                document.getElementById("followupBox").style.display = "none";
                addBubble("finder", msg);
                showStatus("success", "✅ Follow-up sent. Waiting for owner...");
            } else {
                // Failed — unmark so user can try again
                rendered.finderFollowup = false;
                btn.disabled = false;
                btn.innerText = "Send Follow-up";
                alert(data.message || "Failed to send. Please try again.");
            }
        })
        .catch(() => {
            rendered.finderFollowup = false;
            btn.disabled = false;
            btn.innerText = "Send Follow-up";
            alert("Network error. Please try again.");
        });
}

function startCooldown() {
    const btn = document.getElementById("notifyBtn");
    const timer = document.getElementById("timer");

    let time = 180;
    btn.disabled = true;
    btn.style.background = "#95a5a6";

    const interval = setInterval(() => {
        const min = Math.floor(time / 60);
        const sec = time % 60;
        timer.innerText = `Can notify again in ${min}:${sec < 10 ? "0" + sec : sec}`;
        time--;
        if (time < 0) {
            clearInterval(interval);
            btn.disabled = false;
            btn.innerText = "Notify Again";
            btn.style.background = "#27ae60";
            timer.innerText = "";
        }
    }, 1000);
}

function showStatus(type, message) {
    const box = document.getElementById("statusBox");
    box.className = "status-box " + type;
    box.innerHTML = message;
}