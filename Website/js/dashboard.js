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
        setupRows += `
          <tr>
            <td>${setupIndex++}</td>
            <td>${qr.product_type || "-"}</td>
            <td>${qr.qr_id}</td>
            <td>${qr.created_at ? new Date(qr.created_at).toLocaleDateString() : "-"}</td>
            <td>
              <select id="asset_${qr.qr_id}">
                <option ${qr.asset_name === "Car" ? "selected" : ""}>Car</option>
                <option ${qr.asset_name === "Bike" ? "selected" : ""}>Bike</option>
                <option ${qr.asset_name === "Laptop" ? "selected" : ""}>Laptop</option>
                <option ${qr.asset_name === "Bag" ? "selected" : ""}>Bag</option>
                <option ${qr.asset_name === "Keys" ? "selected" : ""}>Keys</option>
                <option ${qr.asset_name === "Pet" ? "selected" : ""}>Pet</option>
              </select>
            </td>
            <td><input id="p_${qr.qr_id}" placeholder="Primary"></td>
            <td><input id="s_${qr.qr_id}" placeholder="Secondary"></td>
            <td><button onclick="activate('${qr.qr_id}')">Activate</button></td>
          </tr>`;
      } else {
        // ACTIVE / EXPIRED / DISABLED TABLE
        const isDisabled = qr.status === "disabled";
        const isExpired = qr.status === "expired";

        let secondarySection = qr.secondary
          ? `<small id="secondary_${qr.qr_id}">S: ${qr.secondary}</small><br>
             <button onclick="editSecondary('${qr.qr_id}')">Edit</button>`
          : `<input id="sec_${qr.qr_id}" placeholder="Add Secondary"><br>
             <button onclick="addSecondary('${qr.qr_id}')">Add</button>`;

        activeRows += `
          <tr ${(isDisabled || isExpired) ? "style='opacity:0.5;'" : ""}>
            <td>${activeIndex++}</td>
            <td>${qr.qr_id}</td>
            <td>
              ${qr.asset_name || "Not Assigned"}<br>
              <small id="primary_${qr.qr_id}">P: ${qr.primary || "-"}</small><br>
              ${secondarySection}
            </td>
            <td>${qr.expiry ? new Date(qr.expiry).toLocaleDateString() : "N/A"}</td>
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
  const asset = document.getElementById("asset_" + qrId).value;
  const p = document.getElementById("p_" + qrId).value.trim();
  const s = document.getElementById("s_" + qrId).value.trim();

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
    body: JSON.stringify({ qr_id: qrId, asset_name: asset, primary: p, secondary: s })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) location.reload();
      else alert(data.error || "Activation failed");
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
  fetch("/logout", { credentials: "include" })
    .then(() => {
      window.location.href = "/login.html";
    });
}

/* RENEW QR */
async function renewQR() {
  const res = await fetch("/order/create-renewal-order", {
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
    name: "ReachOutOwnerHere’s the **complete refined `dashboard.js` file** with all the improvements applied — consistent phone validation, safer error handling, efficient DOM updates, and robust fetch calls. This version is production‑ready and aligns with your backend routes:

```js
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
        setupRows += `
          <tr>
            <td>${setupIndex++}</td>
            <td>${qr.product_type || "-"}</td>
            <td>${qr.qr_id}</td>
            <td>${qr.created_at ? new Date(qr.created_at).toLocaleDateString() : "-"}</td>
            <td>
              <select id="asset_${qr.qr_id}">
                <option ${qr.asset_name === "Car" ? "selected" : ""}>Car</option>
                <option ${qr.asset_name === "Bike" ? "selected" : ""}>Bike</option>
                <option ${qr.asset_name === "Laptop" ? "selected" : ""}>Laptop</option>
                <option ${qr.asset_name === "Bag" ? "selected" : ""}>Bag</option>
                <option ${qr.asset_name === "Keys" ? "selected" : ""}>Keys</option>
                <option ${qr.asset_name === "Pet" ? "selected" : ""}>Pet</option>
              </select>
            </td>
            <td><input id="p_${qr.qr_id}" placeholder="Primary"></td>
            <td><input id="s_${qr.qr_id}" placeholder="Secondary"></td>
            <td><button onclick="activate('${qr.qr_id}')">Activate</button></td>
          </tr>`;
      } else {
        // ACTIVE / EXPIRED / DISABLED TABLE
        const isDisabled = qr.status === "disabled";
        const isExpired = qr.status === "expired";

        let secondarySection = qr.secondary
          ? `<small id="secondary_${qr.qr_id}">S: ${qr.secondary}</small><br>
             <button onclick="editSecondary('${qr.qr_id}')">Edit</button>`
          : `<input id="sec_${qr.qr_id}" placeholder="Add Secondary"><br>
             <button onclick="addSecondary('${qr.qr_id}')">Add</button>`;

        activeRows += `
          <tr ${(isDisabled || isExpired) ? "style='opacity:0.5;'" : ""}>
            <td>${activeIndex++}</td>
            <td>${qr.qr_id}</td>
            <td>
              ${qr.asset_name || "Not Assigned"}<br>
              <small id="primary_${qr.qr_id}">P: ${qr.primary || "-"}</small><br>
              ${secondarySection}
            </td>
            <td>${qr.expiry ? new Date(qr.expiry).toLocaleDateString() : "N/A"}</td>
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
  const asset = document.getElementById("asset_" + qrId).value;
  const p = document.getElementById("p_" + qrId).value.trim();
  const s = document.getElementById("s_" + qrId).value.trim();

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
    body: JSON.stringify({ qr_id: qrId, asset_name: asset, primary: p, secondary: s })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) location.reload();
      else alert(data.error || "Activation failed");
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
  fetch("/logout", { credentials: "include" })
    .then(() => {
      window.location.href = "/login.html";
    });
}

/* RENEW QR */
async function renewQR() {
  const res = await fetch("/order/create-renewal-order", {
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
    name: "ReachOut