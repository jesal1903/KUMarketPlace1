let currentSlide = 0;

function moveSlide(direction) {
  const track = document.getElementById('carouselTrack');
  const slides = document.querySelectorAll('.carousel-slide');
  const totalSlides = slides.length;

  currentSlide += direction;
  if (currentSlide < 0) currentSlide = totalSlides - 1;
  else if (currentSlide >= totalSlides) currentSlide = 0;

  track.style.transform = `translateX(-${currentSlide * 100}%)`;
}

// Auto slide every 4 seconds
function autoSlide() {
  moveSlide(1);
  setTimeout(autoSlide, 4000);
}

// Handle Add to Cart
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("add-to-cart-btn")) {
    const card = e.target.closest(".product-card");
    const title = card.querySelector("h3").textContent;
    const location = card.querySelector("p")?.textContent || "N/A";
    const price = card.querySelector("strong")?.textContent || "N/A";
    const image = card.querySelector("img")?.src || "placeholder.jpg";

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    cart.push({ title, location, price, image });
    localStorage.setItem("cart", JSON.stringify(cart));

    alert("Item added to cart!");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(autoSlide, 4000);

  // 🔍 Search filter
  const searchBar = document.getElementById("searchBar");
  if (searchBar) {
    searchBar.addEventListener("keyup", function (event) {
      const keyword = this.value.toLowerCase();
      const products = document.querySelectorAll(".product-card");

      products.forEach(card => {
        const name = card.querySelector("h3")?.textContent.toLowerCase() || "";
        const desc = card.querySelector("p")?.textContent.toLowerCase() || "";
        card.style.display = name.includes(keyword) || desc.includes(keyword) ? "block" : "none";
      });

      if (event.key === "Enter") {
        if (keyword.includes("textbook")) window.location.href = "index.html";
        else if (keyword.includes("electronics")) window.location.href = "electronics.html";
        else if (keyword.includes("apparel")) window.location.href = "apparel.html";
        else if (keyword.includes("student")) window.location.href = "student.html";
        else if (keyword.includes("decor") || keyword.includes("art")) window.location.href = "art_decor.html";
        else alert("No matching category found.");
      }
    });
  }

  // 📦 Post Modal
  const postBtn = document.querySelector(".post-button");
  postBtn?.addEventListener("click", () => {
    document.getElementById("postItemModal").style.display = "block";
  });

  const closeBtn = document.querySelector(".close-post");
  closeBtn?.addEventListener("click", () => {
    document.getElementById("postItemModal").style.display = "none";
  });

  const postForm = document.getElementById("postForm");
  postForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Post feature is disabled for demo.");
    document.getElementById("postItemModal").style.display = "none";
  });
});

// ✅ SIGNUP to backend (REPLACE with your backend link)
const backendURL = "https://kumarketplace1-backend.onrender.com";

document.getElementById("signupForm")?.addEventListener("submit", function (e) {
  e.preventDefault();

  const fullname = document.getElementById("fullname").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  fetch(`${backendURL}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fullname, email, password })
  })
    .then(res => res.json())
    .then(data => {
      if (data.token) {
        alert("Signup successful!");
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        window.location.href = "dashboard.html";
      } else {
        alert(data.error || "Signup failed. Please try again.");
      }
    })
    .catch(err => {
      console.error("Signup error:", err);
      alert("Server error. Check network or backend.");
    });
});
