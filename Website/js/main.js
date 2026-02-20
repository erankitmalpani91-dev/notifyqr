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
    let autoSlide = setInterval(() => moveSlide(index + 1), 4000);

    function resetAutoSlide() {
        clearInterval(autoSlide);
        autoSlide = setInterval(() => moveSlide(index + 1), 4000);
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



document.addEventListener("DOMContentLoaded", function () {

    const howSection = document.querySelector(".how-section");

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
        document.querySelectorAll("#mobileMenu a").forEach(link => {
            link.addEventListener("click", () => {
                document.getElementById("mobileMenu").classList.remove("active");
            });
        });
}





