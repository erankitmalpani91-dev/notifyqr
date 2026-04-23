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

    // Auto slide
    let autoSlide = setInterval(() => moveSlide(index + 1), 6000);

    function resetAutoSlide() {
        clearInterval(autoSlide);
        autoSlide = setInterval(() => moveSlide(index + 1), 6000);
    }

    // Manual navigation
    prevBtn.addEventListener("click", () => {
        moveSlide(index - 1);
        resetAutoSlide();
    });
    nextBtn.addEventListener("click", () => {
        moveSlide(index + 1);
        resetAutoSlide();
    });
});



document.addEventListener("DOMContentLoaded", function() {

    const howSection = document.querySelector(".how-section");

    if (!howSection) return;

    function revealHowSection() {
        const sectionTop = howSection.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;

        if (sectionTop < windowHeight - 100) {
            howSection.classList.add("active");
        }
    }

    window.addEventListener("scroll", revealHowSection);
    revealHowSection(); // trigger on load
});

document.addEventListener("DOMContentLoaded", function () {

    const cards = document.querySelectorAll(".reach-card");

    cards.forEach(card => {
        card.addEventListener("click", () => {

            // Optional: close others
            cards.forEach(c => {
                if (c !== card) {
                    c.classList.remove("active");
                }
            });

            card.classList.toggle("active");
        });
    });

});



/* Contact Sales*/
function openSalesModal() {
    document.getElementById("salesModal").classList.add("active");
}

function closeSalesModal() {
    document.getElementById("salesModal").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", function () {

    const nameInput = document.getElementById("contactName");
    const phoneInput = document.getElementById("contactPhone");
    const emailInput = document.getElementById("contactEmail");
    const messageInput = document.getElementById("contactMessage");

    // PHONE: only numbers
    phoneInput.addEventListener("input", function () {
        this.value = this.value.replace(/[^0-9]/g, "");
        if (this.value.length !== 10) {
            this.setCustomValidity("Enter 10 digit number");
        } else {
            this.setCustomValidity("");
        }
    });

    // EMAIL live validation
    emailInput.addEventListener("input", function () {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(this.value)) {
            this.setCustomValidity("Enter valid email");
        } else {
            this.setCustomValidity("");
        }
    });

});

document.addEventListener("DOMContentLoaded", function () {

    const form = document.getElementById("salesForm");

    form.addEventListener("submit", async function (e) {
        e.preventDefault(); // 🔥 THIS STOPS PAGE RELOAD

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
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name,
                    phone,
                    email,
                    company,
                    message
                })
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
            body: JSON.stringify({
                name,
                phone,
                email,
                company,
                message
            })
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

/*toggle Menu*/

function toggleMenu() {
        document.getElementById("mobileMenu").classList.toggle("active");
    }

    document.querySelectorAll("#mobileMenu a").forEach(link => {
        link.addEventListener("click", () => {
            document.getElementById("mobileMenu").classList.remove("active");
        });
    });




/* CART SYSTEM */
const defaultCart = {
        car: 0,
        bike: 0,
        auto: 0,
        CV: 0,
        bag: 0,
        laptop: 0,
        mobile: 0,
        schoolbag: 0,
        kids: 0,
        elderly: 0,
        pet: 0,
        homedelivery: 0,
        key: 0,
        fleet: 0,
        employee: 0,
        shop: 0,
    };

    let cart = Object.assign({}, defaultCart, JSON.parse(localStorage.getItem("cart")) || {});

updateCart();
function changeQty(type, change) {
    let qtyEl = document.getElementById("qty-" + type);
    let qty = parseInt(qtyEl.innerText);
    qty += change;

    if (qty < 0) qty = 0;

    qtyEl.innerText = qty;
}

function addToCart(type) {
  let qtyEl = document.getElementById("qty-" + type);
  let qty = parseInt(qtyEl.innerText);
  cart[type] += qty;
  qtyEl.innerText = 0; // reset after adding
  updateCart();
}


function removeFromCart(type) {
    if (cart[type] > 0) {
        cart[type]--;
    }
    updateCart();
}

function updateCart() {
    let total = 0;
    let cartHTML = "";

    for (let item in cart) {
        if (cart[item] > 0) {
            total += cart[item];

            let name = item.replace("combo", " Combo");
            name = name.charAt(0).toUpperCase() + name.slice(1);

            cartHTML += `
                <div class="cart-item">
                    ${name} QR ${cart[item]}
                    <button onclick="removeFromCart('${item}')">−</button>
                </div>
            `;
        }
    }

    document.getElementById("cartItems").innerHTML = cartHTML;
    document.getElementById("cartTotal").innerText = total;
}

function goToCheckout() {
    let total = 0;
    for (let item in cart) {
        total += cart[item];
    }

    if (total === 0) {
        alert("Add items to cart first");
        return;
    }

    let filteredCart = {};
    for (let item in cart) {
        if (cart[item] > 0) {
            filteredCart[item] = cart[item];
        }
    }

    localStorage.setItem("cart", JSON.stringify(filteredCart));
    window.location.href = "checkout.html";
}
/* CATEGORY TABS */
function showCategory(category, el) {

    // Hide all category sliders
    document.querySelectorAll(".product-slider").forEach(section => {
        section.classList.remove("active");
    });

    // Show selected category
    let selected = document.querySelector("." + category);
    if (selected) {
        selected.classList.add("active");
    }

    // Update active tab
    document.querySelectorAll(".tab").forEach(tab => {
        tab.classList.remove("active");
    });

    if (el) {
        el.classList.add("active");
    }
}


document.addEventListener("DOMContentLoaded", function () {

    const slides = document.querySelectorAll(".slide");

    if (slides.length === 0) {
        console.log("❌ No slides found");
        return;
    }

    let current = 0;

    function nextSlide() {
        slides[current].classList.remove("active");
        current = (current + 1) % slides.length;
        slides[current].classList.add("active");
    }

    setInterval(nextSlide, 4000);
});