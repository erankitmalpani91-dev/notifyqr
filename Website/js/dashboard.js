//Date Format

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// DASHBOARD INITIALIZATION
fetch("/api/dashboard", { credentials: "include" })
  .then(res => {
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    return res.json();
  })
  .then(data => {
    if (!data || !data.user) return;

    // OWNER DETAILS
    document.getElementById("ownerName").innerText = data.user.name || "-";
    document.getElementById("ownerMobile").innerText = data.user.phone || "-";
    document.getElementById("ownerEmail").innerText = data.user.email || "-";

    let setupRows = "";
    let activeRows = "";
    let setupIndex = 1;
    let activeIndex = 1;

    data.qrs.forEach(qr => {
      if (qr.status === "inactive") {
        // INACTIVE → SETUP TABLE
          const labelPlaceholder = {
              car: "e.g. Honda City RJ45 6789",
              bike: "e.g. Royal Enfield DL12 AB",
              pet: "e.g. Labrador Brown",
              bag: "e.g. Black Laptop Bag",
              laptop: "e.g. Dell XPS Silver",
              keys: "e.g. Home Keys",
              child: "e.g. Riya Age 6",
              luggage: "e.g. Blue Trolley"
          }[qr.product_type?.toLowerCase()] || "e.g. Describe your asset";

          setupRows += `
                  <tr>
                    <td>${setupIndex++}</td>
                    <td data-label="ID">${qr.qr_id}</td>
                    <td data-label="Asset Type Secured">${qr.product_type || "-"}</td>
                    <td data-label="Purchased On">${formatDate(qr.created_at) || "-"}</td>
                    <td data-label="Asset Details"><input id="label_${qr.qr_id}" placeholder="${labelPlaceholder}" maxlength="30" title="Max 25 characters" style="min-width:160px"></td>
                    <td data-label="Main WhatsApp Number"><input id="p_${qr.qr_id}" placeholder="Primary No."></td>
                    <td data-label="Backup WhatsApp Number"><input id="s_${qr.qr_id}" placeholder="Secondary No."></td>
                    <td data-label="Action"><button onclick="activate('${qr.qr_id}')">Activate QR</button></td>
                  </tr>`;
            } else {
        // ACTIVE / EXPIRED / DISABLED TABLE
        const isDisabled = qr.status === "disabled";
        const isExpired = qr.status === "expired";

        let secondarySection = "";

                if (isDisabled || isExpired) {
                    secondarySection = qr.secondary
                        ? `<small>S: ${qr.secondary}</small>`
                        : `<small>No secondary</small>`;
                } else {
                    secondarySection = qr.secondary
                        ? `<small id="secondary_${qr.qr_id}">S: ${qr.secondary}</small><br>
                           <button onclick="editSecondary('${qr.qr_id}')">Edit</button>`
                        : `<input id="sec_${qr.qr_id}" placeholder="Add Secondary" type="tel" maxlength="10" 
                            oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10)"><br>
                           <button onclick="addSecondary('${qr.qr_id}')">Add</button>`;
                }

        activeRows += `
        <tr>
            <td>${activeIndex++}</td>
              <td class="${isDisabled || isExpired ? 'disabled-text' : ''}">${qr.qr_id}</td>
              <td class="${isDisabled || isExpired ? 'disabled-text' : ''}">
              <strong>${qr.product_type ? qr.product_type.charAt(0).toUpperCase() + qr.product_type.slice(1) : "-"}</strong><br>
              <small style="color:#555;display:block;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" 
                title="${qr.asset_label || ''}">${qr.asset_label || "-"}</small><br>
              <small id="primary_${qr.qr_id}">P: ${qr.primary || "-"}</small><br>
              ${secondarySection}
            </td>
              <td class="${isDisabled || isExpired ? 'disabled-text' : ''}">
                ${formatDate(qr.activated_at) || "-"}
              </td>
              <td class="${isDisabled || isExpired ? 'disabled-text' : ''}">
                ${formatDate(qr.expiry) || "N/A"}
              </td>
              <td>
                ${(isDisabled || isExpired)
                            ? "-"
                            : `<a href="/qrcodes/${qr.qr_id}.png" download>Download</a>`}
              </td>
              <td>
                ${isExpired
                            ? `<button onclick="renewQR()">Renew</button>`
                            : isDisabled
                                ? `<button onclick="reactivate('${qr.qr_id}')">Reactivate</button>`
                                : `<button onclick="deactivate('${qr.qr_id}')">Deactivate</button>`}
              </td>
            </tr>`;
        }
    });

    document.getElementById("setupTable").innerHTML = setupRows;
    document.getElementById("activeTable").innerHTML = activeRows;
  });

/* ADD SECONDARY */
function addSecondary(qrId) {
  const num = document.getElementById("sec_" + qrId).value.trim();
  const primaryText = document.querySelector(`#primary_${qrId}`)?.innerText || "";
  const primary = primaryText.replace("P:", "").trim();

  if (!/^[6-9]\d{9}$/.test(num)) {
    alert("Enter valid 10 digit number");
    return;
  }
  if (num === primary) {
    alert("Primary and Secondary number cannot be same");
    return;
  }

  fetch("/api/qr/add-secondary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ qr_id: qrId, phone: num })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert("Secondary added successfully");
        location.reload();
      } else {
        alert(data.message || "Error adding number");
      }
    });
}

/* ACTIVATE QR */
function activate(qrId) {
    const asset = "Asset";
    const label = document.getElementById("label_" + qrId).value.trim();
    const p = document.getElementById("p_" + qrId).value.trim();
    const s = document.getElementById("s_" + qrId).value.trim();


    if (!label) {
        alert("Please enter an asset label (e.g. Honda City RJ45 6789)");
        return;
    }
    if (label.length > 30) {
        alert("Asset label must be 30 characters or less");
        return;
    }
  if (!/^[6-9]\d{9}$/.test(p)) {
    alert("Enter valid 10 digit primary number");
    return;
  }
  if (s && !/^[6-9]\d{9}$/.test(s)) {
    alert("Enter valid secondary number");
    return;
  }
  if (p && s && p === s) {
    alert("Primary and Secondary cannot be same");
    return;
  }

  fetch("/api/qr/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ qr_id: qrId, asset_name: asset, asset_label: label, primary: p, secondary: s })
  })
    .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert("QR activated successfully!");
                location.reload();
            } else {
                alert(data.error || "Activation failed");
            }
        })
        .catch(err => {
            console.error(err);
            alert("Server error");
        });
}

/* DEACTIVATE QR */
function deactivate(qrId) {
  fetch("/api/qr/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ qr_id: qrId })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) location.reload();
      else alert("Failed to deactivate QR");
    });
}

/* REACTIVATE QR */
function reactivate(qrId) {
  fetch("/api/qr/reactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ qr_id: qrId })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) location.reload();
      else alert("Failed to reactivate QR");
    });
}

/* EDIT SECONDARY */
function editSecondary(qrId) {
  const el = document.getElementById("secondary_" + qrId);
  if (!el) {
    alert("Secondary element not found");
    return;
  }

  const current = el.innerText.replace("S:", "").trim();
  const newNumber = prompt("Update Secondary Number:", current);
  if (newNumber === null) return;

  if (!/^[6-9]\d{9}$/.test(newNumber)) {
    alert("Enter valid 10 digit number");
    return;
  }

  const primaryEl = document.getElementById("primary_" + qrId);
  const primary = primaryEl ? primaryEl.innerText.replace("P:", "").trim() : "";

  if (newNumber === primary) {
    alert("Primary and Secondary cannot be same");
    return;
  }

  fetch("/api/qr/update-secondary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ qr_id: qrId, phone: newNumber })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert("Updated successfully");
        location.reload();
      } else {
        alert(data.message || "Update failed");
      }
    });
}

/* LOGOUT */
function logout() {
  fetch("/api/logout", { credentials: "include" })
    .then(res => {
      if (res.ok) {
        window.location.href = "/login.html";
      } else {
        alert("Logout failed");
      }
    })
    .catch(() => {
      alert("Server error during logout");
    });
}

/* RENEW QR */
async function renewQR() {
  try {
    const res = await fetch("/api/order/create-renewal-order", {
      method: "POST",
      credentials: "include"
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.message || "Unable to start renewal");
      return;
    }

    const options = {
      key: data.key,
      amount: data.amount,
      currency: "INR",
      name: "ReachOutOwner",
      description: "QR Renewal",
      order_id: data.orderId,
      handler: async function (response) {
        // Verify payment with backend
        const verifyRes = await fetch("/api/order/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(response)
        });
        const result = await verifyRes.json();
        if (result.success) {
          alert("QR renewed successfully");
          window.location.reload();
        } else {
          alert("Payment verification failed");
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (err) {
    console.error("Renewal error:", err);
    alert("Server error during renewal");
  }
}