/* ═══════════════════════════════════════════════════════════════
   scan.js  —  3-screen flow
   
   DESIGN RULES:
   - No rate-limit timer. No session expiry timer.
   - After notify is sent, Screen 2 (waiting) stays open.
   - If user presses Back or refreshes → they see "Scan Again" card.
     This is the natural gate against repeat sends — must re-scan QR.
   - After full conversation (owner reply2), polling stops. Done.
   - All backend API calls unchanged.
═══════════════════════════════════════════════════════════════ */

const params = new URLSearchParams(window.location.search);
const qrId = params.get("qr");
const messageCache = new Set();

let selectedMessage = "";
let allMessages = [];
let pollInterval = null;
let currentScanId = null;

/* Conversation render flags — prevent double-rendering on each poll tick */
const rendered = {
    ownerReply: false,
    finderFollowup: false,
    ownerReply2: false
};

/* ══════════════════════════════════════════════════════════════
   SCAN-ONCE GATE  (localStorage + timestamp)
   
   Why localStorage not sessionStorage:
   Safari iOS clears sessionStorage on page reload/back-navigation,
   so the gate was invisible on iPhone — Screen 1 always showed.
   localStorage persists across reloads within the same browser.
   
   A timestamp is stored alongside scan_id so we know when the
   session was created. This also powers the 30-min expiry below.
══════════════════════════════════════════════════════════════ */
const GATE_KEY = "roo_gate_" + (qrId || "none");
const EXPIRY_MS = 15 * 60 * 1000;   // 10 minutes wall-clock

function getGate() {
    try {
        const raw = localStorage.getItem(GATE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);   // { scanId, ts }
    } catch (e) { return null; }
}
function setGate(scanId) {
    localStorage.setItem(GATE_KEY, JSON.stringify({ scanId, ts: Date.now() }));
}
function clearGate() {
    localStorage.removeItem(GATE_KEY);
}
function gateIsExpired(gate) {
    return !gate || (Date.now() - gate.ts) > EXPIRY_MS;
}

/* ══════════════════════════════════════════════════════════════
   PREDEFINED MESSAGES  (unchanged)
══════════════════════════════════════════════════════════════ */
const messageMap = {
    car: ["Your car is blocking the way", "Your car lights are on", "Please move your car", "Car parked in a no parking zone", "Car alarm is ringing", "Car window is open", "Smoke or fire seen in your car", "Fluid leaking from your car", "Your car was hit or damaged"],
    bike: ["Your bike is blocking the way", "Your bike lights are on", "Please move your bike", "Bike parked in a no parking zone", "Bike alarm is ringing", "Bike has fallen or tipped over", "Fuel or oil leaking from your bike"],
    auto: ["Your auto is blocking the way", "Please move your auto", "Auto parked in a no parking zone", "Your auto lights are on", "Auto seems to have an issue"],
    CV: ["Your vehicle is blocking the way", "Please move your vehicle", "Vehicle parked in a restricted area", "Your vehicle lights are on", "Possible issue noticed in your vehicle"],
    bag: ["I found your bag", "Your bag is unattended", "Your bag was left behind", "Bag found at this location"],
    
    luggage: ["I found your luggage", "Your luggage is unattended", "Luggage found at this location"],
    laptop: ["I found your laptop", "Your laptop is unattended", "Laptop left behind at this location"],
    mobile: ["I found your mobile phone", "Mobile phone left behind", "Your phone is unattended"],
    key: ["I found your keys", "Your keys were left behind", "Keys found at this location"],
    pet: ["I found your pet", "Your pet seems lost", "Your pet is unattended", "Pet found roaming nearby"],
    kids: ["I found a child with this tag", "Child needs assistance", "Child appears lost", "Child is alone and needs help"],
    elderly: ["An elderly person needs assistance", "Elderly person seems lost", "Found elderly person with this tag", "Elderly person needs help"],
    homedelivery: ["Someone standing at your house door", "Cylinder delivery boy is waiting for you", "Relative is waiting outside", "Please contact regarding your delivery", "Delivery person tried to reach you"],
 
    default: ["I found your item", "Your item is unattended", "Please contact me", "Item found at this location"]
};

/* ══════════════════════════════════════════════════════════════
   SCREEN NAVIGATION
══════════════════════════════════════════════════════════════ */
function showScreen(n) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = document.getElementById("screen" + n);
    if (el) el.classList.add("active");
}

function showInfoCard(msg, isError) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const card = document.getElementById("infoCard");
    card.innerHTML = msg;
    card.className = "info-card active" + (isError ? " error" : "");
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
if (!qrId) {
    showInfoCard("❌ Invalid QR Code", true);
} else {
    const gate = getGate();
    if (!gate) {
        // No prior notification — fresh scan, show Screen 1
        loadQR();
    } else if (gateIsExpired(gate)) {
        // Gate exists but 30 min elapsed — clear it, show Screen 1 fresh
        clearGate();
        loadQR();
    } else {
        // Valid gate — Back/Refresh case: show Scan Again
        showScanAgain();
    }
}

function loadQR() {
    fetch("/api/alerts/qr-info/" + qrId)
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                showInfoCard("⚠️ " + (data.message || "QR Not Active"), true);
                return;
            }
            const assetType = (data.product_type || "default").toLowerCase();
            allMessages = messageMap[assetType] || messageMap["default"];
            renderButtons(allMessages.slice(0, 3));
            showScreen(1);
        })
        .catch(() => showInfoCard("Unable to load. Please try again.", true));
}

/* ══════════════════════════════════════════════════════════════
   "SCAN AGAIN" card — shown on Back/Refresh after notify
══════════════════════════════════════════════════════════════ */
function showScanAgain() {
    showInfoCard(
        `<div style="font-size:32px;margin-bottom:12px">📷</div>
         <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#1a1a2e">
           Already notified the owner
         </div>
         <div style="font-size:13px;color:#666;line-height:1.6;margin-bottom:16px">
           To send a new message,<br>please <strong>scan the QR code again</strong>.
         </div>`,
        false
    );
}

/* ══════════════════════════════════════════════════════════════
   SCREEN 1 — Issue buttons
══════════════════════════════════════════════════════════════ */
function renderButtons(msgs) {
    const container = document.getElementById("issueButtons");
    container.innerHTML = "";
    msgs.forEach(msg => {
        const btn = document.createElement("button");
        btn.className = "issue-btn";
        btn.innerHTML = `<span>${msg}</span><span class="tick">✓</span>`;
        btn.onclick = () => {
            selectedMessage = msg;
            container.querySelectorAll(".issue-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            const box = document.getElementById("customMsg");
            box.value = msg;
            document.getElementById("charCount").innerText = msg.length;
        };
        container.appendChild(btn);
    });
    const first = container.querySelector(".issue-btn");
    if (first) first.click();
}

function showMore() {
    renderButtons(allMessages);
    document.getElementById("moreLink").style.display = "none";
}

function onCustomInput() {
    const val = document.getElementById("customMsg").value;
    document.getElementById("charCount").innerText = val.length;
    document.querySelectorAll(".issue-btn").forEach(b => b.classList.remove("selected"));
    selectedMessage = "";
}

/* ══════════════════════════════════════════════════════════════
   NOTIFY
══════════════════════════════════════════════════════════════ */
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

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => sendAlert(finalMessage,
                `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`),
            () => sendAlert(finalMessage, null),
            { timeout: 5000 }
        );
    } else {
        sendAlert(finalMessage, null);
    }
}

function sendAlert(message, location) {
    fetch("/api/alerts/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_id: qrId, message, location })
    })
        .then(async res => {
            let data = null;
            try { data = await res.json(); } catch (e) { }
            return { ok: res.ok, data };
        })
        .then(({ ok, data }) => {
            const btn = document.getElementById("notifyBtn");
            if (!ok || !data || !data.success) {
                btn.disabled = false;
                btn.innerText = "Notify Owner";
                alert(data?.message || "Failed to notify. Please try again.");
                return;
            }

            currentScanId = data.scan_id;

            /* ── Gate: localStorage so Back/Refresh shows "Scan Again" on all browsers ── */
            setGate(currentScanId);

            /* Reset conversation state */
            rendered.ownerReply = false;
            rendered.finderFollowup = false;
            rendered.ownerReply2 = false;
            messageCache.clear();
            document.getElementById("convoThread").innerHTML = "";
            document.getElementById("followupMsg").value = "";
            document.getElementById("followupArea").style.display = "block";
            document.getElementById("miniWaiting").style.display = "none";

            window._finderMessage = message;

            showScreen(2);
            startPolling(currentScanId);
        })
        .catch(() => {
            const btn = document.getElementById("notifyBtn");
            btn.disabled = false;
            btn.innerText = "Notify Owner";
            alert("Network error. Please try again.");
        });
}

/* ══════════════════════════════════════════════════════════════
   POLLING  (5s, unchanged API)
══════════════════════════════════════════════════════════════ */
function startPolling(scanId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(() => {

        /* Wall-clock expiry: works even after phone is minimised.
           Browser throttles setInterval when minimised, but the
           timestamp comparison fires correctly the moment the tab
           is foregrounded again. */
        const gate = getGate();
        if (gateIsExpired(gate)) {
            clearInterval(pollInterval);
            clearGate();
            const hint = document.querySelector(".waiting-hint");
            const label = document.querySelector(".waiting-label");
            const core = document.querySelector(".ripple-core");
            if (hint) hint.innerHTML = "This session has expired (30 min).<br><strong>Scan the QR again</strong> to send a new message.";
            if (label) { label.innerText = "Session Expired"; label.style.color = "#e74c3c"; }
            if (core) { core.style.background = "#e74c3c"; }
            document.querySelectorAll(".ripple-ring").forEach(r => r.style.borderColor = "#e74c3c");
            return;
        }

        fetch("/api/alerts/reply/" + scanId)
            .then(r => r.json())
            .then(data => {
                if (!data.success) return;

                /* Owner reply 1 → move to Screen 3 */
                if (data.reply && !rendered.ownerReply) {
                    rendered.ownerReply = true;
                    addBubble("finder", window._finderMessage || "");
                    addBubble("owner", data.reply);
                    showScreen(3);
                }

                /* Finder follow-up rendered in thread */
                if (data.finder_followup && !rendered.finderFollowup) {
                    rendered.finderFollowup = true;
                    document.getElementById("followupArea").style.display = "none";
                    addBubble("finder", data.finder_followup);
                    document.getElementById("miniWaiting").style.display = "block";
                }

                /* Owner reply 2 → conversation complete */
                if (data.owner_reply2 && !rendered.ownerReply2) {
                    rendered.ownerReply2 = true;
                    document.getElementById("miniWaiting").style.display = "none";
                    addBubble("owner", data.owner_reply2);
                    document.getElementById("followupArea").style.display = "none";
                    clearInterval(pollInterval);
                    clearGate();   // conversation done — next scan gets fresh Screen 1
                }
            })
            .catch(() => { });
    }, 5000);
}

/* ══════════════════════════════════════════════════════════════
   FOLLOW-UP  (unchanged logic)
══════════════════════════════════════════════════════════════ */
function sendFollowup() {
    const msg = document.getElementById("followupMsg").value.trim();
    if (!msg) { alert("Please type a follow-up message"); return; }
    if (!currentScanId) return;

    const btn = document.getElementById("followupBtn");
    btn.disabled = true;
    btn.innerText = "Sending...";
    rendered.finderFollowup = true;

    fetch("/api/alerts/send-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: currentScanId, message: msg })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                document.getElementById("followupArea").style.display = "none";
                addBubble("finder", msg);
                document.getElementById("miniWaiting").style.display = "block";
            } else {
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

/* ══════════════════════════════════════════════════════════════
   BUBBLE HELPER  (unchanged)
══════════════════════════════════════════════════════════════ */
function addBubble(who, text) {
    if (!text || !text.trim()) return;
    const thread = document.getElementById("convoThread");
    const key = who + "|" + text.trim();
    if (messageCache.has(key)) return;
    messageCache.add(key);

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;align-items:" +
        (who === "owner" ? "flex-end" : "flex-start");

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
}