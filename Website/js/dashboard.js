fetch("/api/dashboard")

    .then(res => {
        if (res.status === 401) {
            window.location.href = "/login.html";
            return;
        }
        return res.json();
    })
    .then(data => {

        // OWNER DETAILS
        document.getElementById("ownerName").innerText = data.user.name || "-";
        document.getElementById("ownerMobile").innerText = data.user.phone || "-";
        document.getElementById("ownerEmail").innerText = data.user.email || "-";
        document.getElementById("maxSlots").innerText = data.user.max_qr_slots || "-";
        // PLAN DISPLAY FIX
        let planText = data.user.max_qr_slots + " QR Plan";
        document.getElementById("planType").innerText = planText;
   

        // SPLIT QR
        let setupIndex = 1;
        let activeIndex = 1;

        data.qrs.forEach(qr => {

            if (qr.status === "inactive" && qr.source === "web") {

                // SETUP TABLE
                document.getElementById("setupTable").innerHTML += `
        <tr>
        <td>${setupIndex++}</td>
        <td>${data.user.plan_type}</td>
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

        <td>
        <button onclick="activate('${qr.qr_id}')">Activate</button>
        </td>
        </tr>
        `;

            } else {

                // ACTIVE TABLE
                const isDisabled = qr.status === "disabled";
                const isExpired = qr.status === "expired";

                document.getElementById("activeTable").innerHTML += `
        <tr ${(isDisabled || isExpired) ? "style='opacity:0.5;'" : ""}>
        <td>${activeIndex++}</td>
        <td>${qr.qr_id}</td>

        <td>
        ${qr.asset_name || "Not Assigned"}<br>
        <small id="primary_${qr.qr_id}">P: ${qr.primary || "-"}</small><br>

        ${qr.secondary
                        ? `<small id="secondary_${qr.qr_id}">S: ${qr.secondary}</small><br>
               <button onclick="editSecondary('${qr.qr_id}')">Edit</button>`
                        : `<input id="sec_${qr.qr_id}" placeholder="Add Secondary"><br>
               <button onclick="addSecondary('${qr.qr_id}')">Add</button>`
                    }
        </td>

        <td>${qr.expiry ? new Date(qr.expiry).toLocaleDateString() : "N/A"}</td>

        <td>
        ${(isDisabled || isExpired)
                        ? "-"
                        : `<a href="/qrcodes/${qr.qr_id}.png" download>Download</a>`
                    }
        </td>

        <td>
        ${isExpired
                        ? `<button onclick="renewSubscriptionPlan()">Renew</button>`
                        : isDisabled
                            ? `<button onclick="reactivate('${qr.qr_id}')">Reactivate</button>`
                            : `<button onclick="deactivate('${qr.qr_id}')">Deactivate</button>`
                    }
        </td>
        </tr>
        `;
            }

        });


function addSecondary(qrId) {

    const num = document.getElementById("sec_" + qrId).value;

    // Get primary number from UI
    const primaryText = document.querySelector(`#primary_${qrId}`)?.innerText || "";

    const primary = primaryText.replace("P:", "").trim();

    if (!/^[0-9]{10}$/.test(num)) {
        alert("Enter valid 10 digit number");
        return;
    }

    if (num === primary) {
        alert("Primary and Secondary number cannot be same");
        return;
    }

    fetch("/api/qr/add-secondary", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            
        },
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

function activate(qrId) {

    const assetEl = document.getElementById("asset_" + qrId);
    const asset = assetEl ? assetEl.value : null;
    const p = document.getElementById("p_" + qrId).value.trim();
    const s = document.getElementById("s_" + qrId).value.trim();

    // Primary validation
    if (!/^[6-9]\d{9}$/.test(p)) {
        alert("Enter valid 10 digit primary number");
        return;
    }

    // Secondary validation (optional)
    if (s && !/^[6-9]\d{9}$/.test(s)) {
        alert("Enter valid secondary number");
        return;
    }

    // Same number check
    if (p && s && p === s) {
        alert("Primary and Secondary cannot be same");
        return;
    }

    fetch("/api/qr/activate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
          
        },
        body: JSON.stringify({
            qr_id: qrId,
            asset_name: asset,
            primary: p,
            secondary: s
        })
    }).then(() => location.reload());
}


function deactivate(qrId) {

    fetch("/api/qr/deactivate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
           
        },
        body: JSON.stringify({ qr_id: qrId })
    }).then(() => location.reload());

}


function logout() {
    fetch("/api/logout", { method: "POST" })
        .then(() => {
            window.location.href = "/login.html";
        });
}

async function createQR() {

    const res = await fetch("/api/qr/create-qr", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            
        },
        body: JSON.stringify({
            planType: "299", // default, backend handles slots
            metallic: 0,
            phonePrimary: "9999999999"
        })
    });

    const data = await res.json();

    if (data.qrId) {
        alert("QR Created Successfully");
        location.reload();
    } else {
        alert("QR limit reached or error");
    }
}

function reactivate(qrId) {

    fetch("/api/qr/reactivate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            
        },
        body: JSON.stringify({ qr_id: qrId })
    }).then(() => location.reload());

}


function editSecondary(qrId) {

    console.log("Edit clicked:", qrId);

    const el = document.getElementById("secondary_" + qrId);
    if (!el) {
        alert("Secondary element not found");
        return;
    }

    const current = el.innerText.replace("S:", "").trim();

    const newNumber = prompt("Update Secondary Number:", current);

    if (newNumber === null) return;

    if (!/^[0-9]{10}$/.test(newNumber)) {
        alert("Enter valid 10 digit number");
        return;
    }

    const primaryEl = document.getElementById("primary_" + qrId);

    const primary = primaryEl
        ? primaryEl.innerText.replace("P:", "").trim()
        : "";

    if (newNumber === primary) {
        alert("Primary and Secondary cannot be same");
        return;
    }

    fetch("/api/qr/update-secondary", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
           
        },
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
        })
        .catch(err => {
            console.error(err);
            alert("Something went wrong");
        });

}

async function renewSubscriptionPlan() {

    
    const res = await fetch("/order/create-renewal-order", {
        method: "POST"
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
        description: `Renewal for ${data.totalQR} QR`,
        order_id: data.orderId,
        handler: async function (response) {

            const verify = await fetch("/order/verify-payment", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature
                })
            });

            const result = await verify.json();

            if (result.success) {
                alert("Subscription renewed successfully");
                location.reload();
            } else {
                alert("Payment verification failed");
            }
        }
    };

    const rzp = new Razorpay(options);
    rzp.open();
}