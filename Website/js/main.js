document.addEventListener("DOMContentLoaded", function () {
    const track = document.querySelector(".testimonial-track");
    const cards = document.querySelectorAll(".testimonial-card");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    if (!track || cards.length === 0) {
        console.log("Slider elements not found");
        return;
    }

    let index = 0;

    function moveSlide(newIndex) {
        if (newIndex < 0) {
            index = cards.length - 1;
        } else if (newIndex >= cards.length) {
            index = 0;
        } else {
            index = newIndex;
        }
        const cardWidth = cards[0].getBoundingClientRect().width + 30;
        track.style.transform = "translateX(-" + (index * cardWidth) + "px)";
    }

    let autoSlide = setInterval(() => moveSlide(index + 1), 6000);

    function resetAutoSlide() {
        clearInterval(autoSlide);
        autoSlide = setInterval(() => moveSlide(index + 1), 6000);
    }

    prevBtn.addEventListener("click", () => { moveSlide(index - 1); resetAutoSlide(); });
    nextBtn.addEventListener("click", () => { moveSlide(index + 1); resetAutoSlide(); });
});


document.addEventListener("DOMContentLoaded", function () {
    const howSection = document.querySelector(".how-section");
    if (!howSection) return;

    function revealHowSection() {
        const sectionTop = howSection.getBoundingClientRect().top;
        if (sectionTop < window.innerHeight - 100) {
            howSection.classList.add("active");
        }
    }

    window.addEventListener("scroll", revealHowSection);
    revealHowSection();
});


document.addEventListener("DOMContentLoaded", function () {
    const cards = document.querySelectorAll(".reach-card");
    cards.forEach(card => {
        card.addEventListener("click", () => {
            cards.forEach(c => { if (c !== card) c.classList.remove("active"); });
            card.classList.toggle("active");
        });
    });
});


/* Contact Sales */
function openSalesModal() {
    document.getElementById("salesModal").classList.add("active");
}

function closeSalesModal() {
    document.getElementById("salesModal").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", function () {
    const phoneInput = document.getElementById("contactPhone");
    const emailInput = document.getElementById("contactEmail");

    if (phoneInput) {
        phoneInput.addEventListener("input", function () {
            this.value = this.value.replace(/[^0-9]/g, "");
            this.setCustomValidity(this.value.length !== 10 ? "Enter 10 digit number" : "");
        });
    }

    if (emailInput) {
        emailInput.addEventListener("input", function () {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            this.setCustomValidity(emailPattern.test(this.value) ? "" : "Enter valid email");
        });
    }
});

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("salesForm");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        const name = document.getElementById("contactName").value.trim();
        const phone = document.getElementById("contactPhone").value.trim();
        const email = document.getElementById("contactEmail").value.trim();
        const company = document.getElementById("companyName").value.trim();
        const message = document.getElementById("contactMessage").value.trim();

        if (!name || !phone || !email || !message) {
            alert("Please fill all required fields");
            return;
        }

        try {
            const response = await fetch("/api/contact-sales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, phone, email, company, message })
            });
            const data = await response.json();
            if (data.success) {
                alert("Enquiry submitted successfully!");
                form.reset();
                closeSalesModal();
            } else {
                alert("Error submitting enquiry");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Server error");
        }
    });
});


async function connectWhatsApp() {
    const name = document.getElementById("contactName").value.trim();
    const phone = document.getElementById("contactPhone").value.trim();
    const email = document.getElementById("contactEmail").value.trim();
    const company = document.getElementById("companyName").value.trim();
    const message = document.getElementById("contactMessage").value.trim();

    if (!name || !phone || !email || !message) {
        alert("Please fill all required fields before connecting to WhatsApp");
        return;
    }

    try {
        const response = await fetch("/api/whatsapp-contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, phone, email, company, message })
        });
        const data = await response.json();
        if (data.success) {
            window.location.href = data.redirect;
        } else {
            alert("Something went wrong");
        }
    } catch (err) {
        console.error(err);
        alert("Server error");
    }
}


/* Toggle Menu */
function toggleMenu() {
    document.getElementById("mobileMenu").classList.toggle("active");
}

document.querySelectorAll("#mobileMenu a").forEach(link => {
    link.addEventListener("click", () => {
        document.getElementById("mobileMenu").classList.remove("active");
    });
});


/* ============================================================
   CART SYSTEM
   All cart logic runs inside DOMContentLoaded so the DOM
   is guaranteed to exist before we touch it.
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {

    const defaultCart = {
        // Individual products — NEVER rename these (live QRs depend on keys)
        car: 0, bike: 0, auto: 0, CV: 0,
        bag: 0, laptop: 0, mobile: 0, schoolbag: 0,
        kids: 0, elderly: 0, pet: 0, homedelivery: 0,
        key: 0, fleet: 0, employee: 0, shop: 0, luggage: 0,
        // Combo packs — new keys, safe to add
        combo_vehicle: 0, combo_family: 0, combo_personal: 0, combo_home: 0,
    };

    // Combo → components map (used by checkout for fulfillment expansion)
    // This is the source of truth for what each combo contains
    window.COMBO_DEFINITIONS = {
        combo_vehicle: ['car', 'bike', 'auto'],
        combo_family: ['car', 'kids', 'elderly'],
        combo_personal: ['bag', 'laptop', 'key'],
        combo_home: ['car', 'bike', 'kids', 'key'],
    };

    // Load cart from localStorage, fill in any missing keys with 0
    window.cart = Object.assign({}, defaultCart, JSON.parse(localStorage.getItem("cart")) || {});

    // ── Render the header cart panel ──────────────────────────
    function updateCart() {
        let total = 0;
        let cartHTML = "";

        for (let item in window.cart) {
            if (window.cart[item] > 0) {
                total += window.cart[item];

                // Nice display names for combos and individual items
                const displayNames = {
                    combo_vehicle: '🚗 Vehicle Combo',
                    combo_family: '👨‍👩‍👧 Family Combo',
                    combo_personal: '💼 Personal Essentials Combo',
                    combo_home: '🏠 Complete Home Combo',
                    car: 'Car', bike: 'Bike', auto: 'Auto', CV: 'Commercial Vehicle',
                    bag: 'Bag', laptop: 'Laptop', mobile: 'Mobile', schoolbag: 'School Bag',
                    luggage: 'Luggage Bag', kids: 'Kids', elderly: 'Elderly', pet: 'Pet',
                    homedelivery: 'Home & Delivery', key: 'Key', fleet: 'Fleet',
                    employee: 'Employee', shop: 'Shop',
                };
                let name = displayNames[item] || (item.charAt(0).toUpperCase() + item.slice(1));
                const isCombo = item.startsWith('combo_');
                const suffix = isCombo ? '' : ' QR';

                cartHTML += `
                    <div class="cart-item">
                        ${name}${suffix} &times; ${window.cart[item]}
                        <button class="remove-btn" onclick="removeFromCart('${item}')">−</button>
                    </div>`;
            }
        }

        const cartItemsEl = document.getElementById("cartItems");
        const cartTotalEl = document.getElementById("cartTotal");

        if (cartItemsEl) cartItemsEl.innerHTML = cartHTML || "<p style='font-size:13px;color:#888'>No items yet</p>";
        if (cartTotalEl) cartTotalEl.innerText = total;

        // Update every badge — mobile and desktop
        document.querySelectorAll(".cartCount, #cartCountDesktop").forEach(el => {
            el.innerText = total;
        });
    }

    // Expose updateCart globally so addToCartDirect can call it
    window.updateCart = updateCart;

    // Run on page load to populate badge from saved cart
    updateCart();

    // ── Product card counter ───────────────────────────────────
    window.changeQty = function (type, change) {
        const qtyEl = document.getElementById("qty-" + type);
        if (!qtyEl) return;
        let qty = parseInt(qtyEl.innerText) + change;
        if (qty < 0) qty = 0;
        qtyEl.innerText = qty;
    };

    // ── Modal counter ──────────────────────────────────────────
    window.changeModalQty = function (change) {
        const qtyEl = document.getElementById("modal-qty");
        if (!qtyEl) return;
        let qty = parseInt(qtyEl.innerText) + change;
        if (qty < 1) qty = 1;
        qtyEl.innerText = qty;
    };

    // ── Add from product card (reads card counter) ─────────────
    window.addToCart = function (type) {
        const qtyEl = document.getElementById("qty-" + type);
        if (!qtyEl) {
            console.error("qty element missing: qty-" + type);
            return;
        }

        const qty = parseInt(qtyEl.innerText.trim()) || 0;

        if (qty <= 0) {
            alert("Please select a quantity using + before adding to cart.");
            return;
        }

        window.cart[type] = (window.cart[type] || 0) + qty;
        qtyEl.innerText = 0;                          // reset card counter

        localStorage.setItem("cart", JSON.stringify(window.cart));
        updateCart();
        showCartToast(qty);
    };

    // ── Add from modal (qty passed directly) ──────────────────
    window.addToCartDirect = function (type, qty) {
        if (!qty || qty <= 0) qty = 1;
        window.cart[type] = (window.cart[type] || 0) + qty;
        localStorage.setItem("cart", JSON.stringify(window.cart));
        updateCart();
        showCartToast(qty);
    };

    // ── Remove one from header cart panel ─────────────────────
    window.removeFromCart = function (type) {
        if (window.cart[type] > 0) window.cart[type]--;
        localStorage.setItem("cart", JSON.stringify(window.cart));
        updateCart();
    };

    // ── Go to checkout ─────────────────────────────────────────
    window.goToCheckout = function () {
        const total = Object.values(window.cart).reduce((a, b) => a + b, 0);
        if (total === 0) {
            alert("Add items to cart first");
            return;
        }
        const filteredCart = {};
        for (let item in window.cart) {
            if (window.cart[item] > 0) filteredCart[item] = window.cart[item];
        }
        localStorage.setItem("cart", JSON.stringify(filteredCart));
        window.location.href = "checkout.html";
    };

    // ── Toast notification ─────────────────────────────────────
    window.showCartToast = function (qty) {
        const toast = document.getElementById("cartToast");
        if (!toast) return;
        toast.innerText = `+${qty} added to cart ✓`;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2000);
    };

});  // end DOMContentLoaded — CART


/* ============================================================
   CATEGORY TABS  (no DOM dependency, safe outside)
   ============================================================ */
function showCategory(category, el) {
    document.querySelectorAll(".product-slider").forEach(s => s.classList.remove("active"));
    const selected = document.querySelector("." + category);
    if (selected) selected.classList.add("active");

    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    if (el) el.classList.add("active");
}


/* Hero / banner slide */
document.addEventListener("DOMContentLoaded", function () {
    const slides = document.querySelectorAll(".slide");
    if (slides.length === 0) return;

    let current = 0;
    function nextSlide() {
        slides[current].classList.remove("active");
        current = (current + 1) % slides.length;
        slides[current].classList.add("active");
    }
    setInterval(nextSlide, 4000);
});

// ─────────────────────────────────────────────────────────────
// ✅ FIX (Bug 1 — MODAL NOT OPENING):
//
// REMOVED: 4 conflicting openProductModal/closeProductModal
// definitions that were here previously.
//
// Root cause: the last plain `function openProductModal()` was
// a hoisted function declaration that silently overwrote the
// correct window.openProductModal above it. Plain function
// declarations always win over window assignments at runtime.
// That stub only called modal.classList.add("active") with no
// content population — so the modal opened blank.
//
// Fix: openProductModal and closeProductModal are defined ONCE
// in the inline <script> at the bottom of index.html, where
// productData and all pmodal-* DOM IDs are guaranteed present.
// main.js must NOT redefine them.
// ─────────────────────────────────────────────────────────────