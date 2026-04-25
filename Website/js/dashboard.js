/* =============================================
   REACHOUTOWNER — dashboard.js v2
   All bugs fixed:
   - renewQR removed (not needed for 1-year plan at launch)
   - data-label added to all tds for mobile
   - 401 now throws properly
   - deactivate/reactivate have .catch()
   - asset_name uses product_type
   - primary number input has masking
   - XSS escape on user data
   - No alert() — uses toast system
   - Loading states on buttons
   - Setup guide hidden when no inactive QRs
   - Step indicator is dynamic
   ============================================= */

/* ── UTILITIES ──────────────────────────────── */

function esc(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(dateString) {
    if (!dateString) return "";
    const d = new Date(dateString);
    if (isNaN(d)) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function daysUntil(dateString) {
    if (!dateString) return null;
    const d = new Date(dateString);
    if (isNaN(d)) return null;
    return Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24));
}

function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function productIcon(type) {
    const icons = {
        car: "🚗", bike: "🏍️", pet: "🐾", bag: "👜",
        laptop: "💻", keys: "🔑", child: "👶", luggage: "🧳"
    };
    return icons[(type || "").toLowerCase()] || "📦";
}

/* ── TOAST ───────────────────────────────────── */

function showToast(message, type = "info", duration = 3500) {
    const icons = { success: "✓", error: "✕", info: "◎" };
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${esc(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("dismissing");
        toast.addEventListener("animationend", () => toast.remove());
    }, duration);
}

/* ── BUTTON LOADING STATE ────────────────────── */

function setButtonLoading(btn, loading, originalText) {
    if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = "Saving…";
    } else {
        btn.disabled = false;
        btn.innerHTML = originalText || btn.dataset.originalText || "Done";
    }
}

/* ── DASHBOARD INIT ──────────────────────────── */

fetch("/api/dashboard", { credentials: "include" })
    .then(res => {
        if (res.status === 401) {
            window.location.href = "/login.html";
            throw new Error("unauthenticated");
        }
        return res.json();
    })
    .then(data => {
        if (!data || !data.user) return;

        /* Owner details */
        const name = data.user.name || "—";
        document.getElementById("ownerName").textContent = name;
        document.getElementById("ownerMobile").textContent = data.user.phone || "—";
        document.getElementById("ownerEmail").textContent = data.user.email || "—";
        document.getElementById("ownerAvatar").textContent = getInitials(name);
        document.getElementById("headerOwnerName").textContent = name;

        /* Partition QRs */
        const inactiveQRs = (data.qrs || []).filter(q => q.status === "inactive");
        const activeQRs = (data.qrs || []).filter(q => q.status !== "inactive");

        /* Step indicator */
        const pill1 = document.getElementById("stepPill1");
        const pill2 = document.getElementById("stepPill2");
        if (inactiveQRs.length === 0) {
            pill1.classList.remove("active");
            pill1.classList.add("done");
            pill1.innerHTML = `<span class="step-num">✓</span><span>Details added</span>`;
            pill2.classList.add("active");
        }

        /* Hide hero if nothing to set up */
        if (inactiveQRs.length === 0) {
            const heroBanner = document.getElementById("heroBanner");
            if (heroBanner) heroBanner.style.display = "none";
        }

        /* Build setup cards */
        if (inactiveQRs.length > 0) {
            const setupSection = document.getElementById("setupSection");
            const setupTable = document.getElementById("setupTable");

            const labelMap = {
                car: "e.g. Honda City RJ45 6789",
                bike: "e.g. Royal Enfield DL12 AB",
                pet: "e.g. Labrador Brown",
                bag: "e.g. Black Laptop Bag",
                laptop: "e.g. Dell XPS Silver",
                keys: "e.g. Home Keys",
                child: "e.g. Riya Age 6",
                luggage: "e.g. Blue Trolley"
            };

            setupTable.innerHTML = inactiveQRs.map(qr => {
                const placeholder = labelMap[(qr.product_type || "").toLowerCase()] || "e.g. Describe your item";
                const icon = productIcon(qr.product_type);
                return `
        <div class="qr-setup-card">
          <div class="qr-card-header">
            <div class="qr-type-badge">
              <span class="qr-type-icon">${icon}</span>
              ${esc(qr.product_type || "Item")}
            </div>
            <span class="qr-id-tag">${esc(qr.qr_id)}</span>
          </div>

          <div class="qr-form">
            <div class="qr-input-wrap full">
              <label class="input-label" for="label_${esc(qr.qr_id)}">Item description</label>
              <input class="qr-input" id="label_${esc(qr.qr_id)}"
                placeholder="${esc(placeholder)}" maxlength="30" autocomplete="off">
            </div>
            <div class="qr-input-wrap">
              <label class="input-label" for="p_${esc(qr.qr_id)}">Primary WhatsApp</label>
              <input class="qr-input" id="p_${esc(qr.qr_id)}"
                placeholder="10-digit number" type="tel" maxlength="10"
                oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)">
            </div>
            <div class="qr-input-wrap">
              <label class="input-label" for="s_${esc(qr.qr_id)}">Backup WhatsApp <span style="font-weight:400;opacity:0.6">(optional)</span></label>
              <input class="qr-input" id="s_${esc(qr.qr_id)}"
                placeholder="10-digit number" type="tel" maxlength="10"
                oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)">
            </div>
          </div>

          <button class="btn-activate" id="activateBtn_${esc(qr.qr_id)}"
            onclick="activate('${esc(qr.qr_id)}', '${esc(qr.product_type)}')">
            <span>Activate ${esc(qr.product_type ? qr.product_type.charAt(0).toUpperCase() + qr.product_type.slice(1) : "")} QR</span>
            <span class="btn-arrow">→</span>
          </button>
        </div>`;
            }).join("");

            setupSection.style.display = "block";
        } else {
            const setupSection = document.getElementById("setupSection");
            if (setupSection) setupSection.style.display = "none";
        }

        /* Build active QR cards */
        const activeSection = document.getElementById("activeSection");
        const activeGrid = document.getElementById("activeGrid");

        if (activeQRs.length === 0) {
            activeSection.style.display = "none";
        } else {
            activeGrid.innerHTML = activeQRs.map((qr, i) => {
                const isDisabled = qr.status === "disabled";
                const isExpired = qr.status === "expired";
                const icon = productIcon(qr.product_type);

                /* Status badge */
                let statusClass = "status-active";
                let statusText = "Active";
                if (isDisabled) { statusClass = "status-disabled"; statusText = "Disabled"; }
                if (isExpired) { statusClass = "status-expired"; statusText = "Expired"; }

                /* Expiry warning */
                const days = daysUntil(qr.expiry);
                let expiryHtml = esc(formatDate(qr.expiry) || "N/A");
                if (!isExpired && !isDisabled && days !== null && days <= 30) {
                    expiryHtml += ` <span class="expiry-warn">⚠ ${days}d left</span>`;
                }

                /* Secondary number section */
                let secondaryHtml = "";
                if (isDisabled || isExpired) {
                    secondaryHtml = `
            <div class="sec-label-row">
              <span class="sec-key">Backup</span>
              <span class="sec-val">${qr.secondary ? esc(qr.secondary) : "—"}</span>
            </div>`;
                } else if (qr.secondary) {
                    secondaryHtml = `
            <div class="sec-label-row">
              <span class="sec-key">Backup</span>
              <span class="sec-val" id="secondary_${esc(qr.qr_id)}">${esc(qr.secondary)}</span>
            </div>
            <button class="btn-sm btn-secondary" style="margin-top:6px"
              onclick="editSecondary('${esc(qr.qr_id)}')">Edit backup</button>`;
                } else {
                    secondaryHtml = `
            <div class="sec-label-row">
              <span class="sec-key">Backup</span>
            </div>
            <input class="sec-inline-input" id="sec_${esc(qr.qr_id)}"
              placeholder="Add backup number" type="tel" maxlength="10"
              oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)">
            <button class="btn-sm btn-secondary" id="addSecBtn_${esc(qr.qr_id)}"
              onclick="addSecondary('${esc(qr.qr_id)}')">Add backup</button>`;
                }

                /* Action buttons */
                let actionsHtml = "";
                if (!isDisabled && !isExpired) {
                    actionsHtml = `
            <a class="btn-sm btn-download" href="/qrcodes/${esc(qr.qr_id)}.png" download>
              ↓ Download QR
            </a>
            <button class="btn-sm btn-danger" id="deactivateBtn_${esc(qr.qr_id)}"
              onclick="deactivate('${esc(qr.qr_id)}')">Deactivate</button>`;
                } else if (isDisabled) {
                    actionsHtml = `
            <button class="btn-sm btn-success" id="reactivateBtn_${esc(qr.qr_id)}"
              onclick="reactivate('${esc(qr.qr_id)}')">Reactivate</button>`;
                } else if (isExpired) {
                    /* renewQR skipped at launch — 1-year plan, renewals not needed yet */
                    actionsHtml = `<span class="btn-sm" style="color:var(--ink-pale);border-color:transparent;cursor:default">Expired</span>`;
                }

                return `
        <div class="active-card ${isDisabled ? "is-disabled" : ""} ${isExpired ? "is-expired" : ""}"
             style="animation: fadeUp 0.4s var(--ease) ${i * 0.06}s both">
          <div class="active-card-header">
            <div class="active-card-type">
              <span class="active-type-icon">${icon}</span>
              <span class="active-type-label">${esc(qr.product_type || "Item")}</span>
            </div>
            <span class="active-status-badge ${statusClass}">${statusText}</span>
          </div>
          <div class="active-card-body">
            <div class="active-qr-id">${esc(qr.qr_id)}</div>
            <div class="active-label" title="${esc(qr.asset_label || "")}">${esc(qr.asset_label || "—")}</div>
            <div class="active-meta">
              <div class="meta-row">
                <span class="meta-key">Primary</span>
                <span class="meta-val" id="primary_${esc(qr.qr_id)}">${esc(qr.primary || "—")}</span>
              </div>
              <div class="meta-row">
                <span class="meta-key">Activated</span>
                <span class="meta-val">${esc(formatDate(qr.activated_at) || "—")}</span>
              </div>
              <div class="meta-row">
                <span class="meta-key">Expires</span>
                <span class="meta-val">${expiryHtml}</span>
              </div>
            </div>
            <div class="active-divider"></div>
            <div class="secondary-section">${secondaryHtml}</div>
            <div class="active-actions">${actionsHtml}</div>
          </div>
        </div>`;
            }).join("");
        }

        /* Show content, hide skeleton */
        document.getElementById("skeleton").style.display = "none";
        document.getElementById("pageContent").style.display = "block";
    })
    .catch(err => {
        if (err.message === "unauthenticated") return;
        document.getElementById("skeleton").style.display = "none";
        document.getElementById("pageContent").style.display = "block";
        showToast("Could not load dashboard. Please refresh.", "error");
    });

/* ── ADD SECONDARY ───────────────────────────── */

function addSecondary(qrId) {
    const input = document.getElementById("sec_" + qrId);
    const btn = document.getElementById("addSecBtn_" + qrId);
    const num = input ? input.value.trim() : "";
    const primaryEl = document.getElementById("primary_" + qrId);
    const primary = primaryEl ? primaryEl.textContent.trim() : "";

    if (!/^[6-9]\d{9}$/.test(num)) {
        showToast("Please enter a valid 10-digit Indian number", "error");
        if (input) input.classList.add("error");
        return;
    }
    if (input) input.classList.remove("error");

    if (num === primary) {
        showToast("Backup cannot be the same as the primary number", "error");
        return;
    }

    setButtonLoading(btn, true);

    fetch("/api/qr/add-secondary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qr_id: qrId, phone: num })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("Backup number added!", "success");
                setTimeout(() => location.reload(), 900);
            } else {
                showToast(data.message || "Could not add backup number", "error");
                setButtonLoading(btn, false, "Add backup");
            }
        })
        .catch(() => {
            showToast("Network error. Please try again.", "error");
            setButtonLoading(btn, false, "Add backup");
        });
}

/* ── ACTIVATE QR ─────────────────────────────── */

function activate(qrId, productType) {
    const label = document.getElementById("label_" + qrId).value.trim();
    const p = document.getElementById("p_" + qrId).value.trim();
    const s = document.getElementById("s_" + qrId).value.trim();
    const btn = document.getElementById("activateBtn_" + qrId);

    /* Validation */
    if (!label) {
        showToast("Please enter a description for this item", "error");
        document.getElementById("label_" + qrId).classList.add("error");
        return;
    }
    document.getElementById("label_" + qrId).classList.remove("error");

    if (label.length > 30) {
        showToast("Description must be 30 characters or less", "error");
        return;
    }
    if (!/^[6-9]\d{9}$/.test(p)) {
        showToast("Enter a valid 10-digit primary WhatsApp number", "error");
        document.getElementById("p_" + qrId).classList.add("error");
        return;
    }
    document.getElementById("p_" + qrId).classList.remove("error");

    if (s && !/^[6-9]\d{9}$/.test(s)) {
        showToast("Enter a valid 10-digit backup number", "error");
        document.getElementById("s_" + qrId).classList.add("error");
        return;
    }
    if (s) document.getElementById("s_" + qrId).classList.remove("error");

    if (p && s && p === s) {
        showToast("Primary and backup numbers cannot be the same", "error");
        return;
    }

    setButtonLoading(btn, true);

    fetch("/api/qr/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            qr_id: qrId,
            asset_name: productType || "Item",
            asset_label: label,
            primary: p,
            secondary: s
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("QR activated! Reloading…", "success");
                setTimeout(() => location.reload(), 1000);
            } else {
                showToast(data.error || "Activation failed. Please try again.", "error");
                setButtonLoading(btn, false);
            }
        })
        .catch(() => {
            showToast("Server error. Please try again.", "error");
            setButtonLoading(btn, false);
        });
}

/* ── DEACTIVATE QR ───────────────────────────── */

function deactivate(qrId) {
    const btn = document.getElementById("deactivateBtn_" + qrId);
    setButtonLoading(btn, true);

    fetch("/api/qr/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qr_id: qrId })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("QR deactivated", "info");
                setTimeout(() => location.reload(), 900);
            } else {
                showToast("Could not deactivate QR. Please try again.", "error");
                setButtonLoading(btn, false, "Deactivate");
            }
        })
        .catch(() => {
            showToast("Network error. Please try again.", "error");
            setButtonLoading(btn, false, "Deactivate");
        });
}

/* ── REACTIVATE QR ───────────────────────────── */

function reactivate(qrId) {
    const btn = document.getElementById("reactivateBtn_" + qrId);
    setButtonLoading(btn, true);

    fetch("/api/qr/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qr_id: qrId })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("QR reactivated!", "success");
                setTimeout(() => location.reload(), 900);
            } else {
                showToast("Could not reactivate. Please try again.", "error");
                setButtonLoading(btn, false, "Reactivate");
            }
        })
        .catch(() => {
            showToast("Network error. Please try again.", "error");
            setButtonLoading(btn, false, "Reactivate");
        });
}

/* ── EDIT SECONDARY ──────────────────────────── */

function editSecondary(qrId) {
    const el = document.getElementById("secondary_" + qrId);
    if (!el) { showToast("Could not find backup number field", "error"); return; }

    const current = el.textContent.trim();
    const newNumber = prompt("Update backup number:", current);
    if (newNumber === null) return;

    const cleaned = newNumber.replace(/[^0-9]/g, "").slice(0, 10);

    if (!/^[6-9]\d{9}$/.test(cleaned)) {
        showToast("Please enter a valid 10-digit Indian number", "error");
        return;
    }

    const primaryEl = document.getElementById("primary_" + qrId);
    const primary = primaryEl ? primaryEl.textContent.trim() : "";

    if (cleaned === primary) {
        showToast("Backup cannot be the same as the primary number", "error");
        return;
    }

    fetch("/api/qr/update-secondary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ qr_id: qrId, phone: cleaned })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("Backup number updated!", "success");
                setTimeout(() => location.reload(), 900);
            } else {
                showToast(data.message || "Update failed. Please try again.", "error");
            }
        })
        .catch(() => {
            showToast("Network error. Please try again.", "error");
        });
}

/* ── LOGOUT ──────────────────────────────────── */

function logout() {
    fetch("/api/logout", { credentials: "include" })
        .then(res => {
            if (res.ok) {
                window.location.href = "/login.html";
            } else {
                showToast("Logout failed. Please try again.", "error");
            }
        })
        .catch(() => {
            showToast("Network error during logout.", "error");
        });
}