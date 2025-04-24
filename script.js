let currentSlide = 0;

function moveSlide(direction) {
  const track = document.getElementById('carouselTrack');
  const slides = document.querySelectorAll('.carousel-slide');
  const totalSlides = slides.length;

  currentSlide += direction;

  if (currentSlide < 0) {
    currentSlide = totalSlides - 1;
  } else if (currentSlide >= totalSlides) {
    currentSlide = 0;
  }

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
    const locationElement = card.querySelector("p");
    const location = locationElement ? locationElement.textContent : "Location not available";
    const priceElement = card.querySelector("strong");
    const price = priceElement ? priceElement.textContent : "Price not available";
    const imgElement = card.querySelector("img");
    const image = imgElement ? imgElement.src : "placeholder.jpg";

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    cart.push({ title, location, price, image });
    localStorage.setItem("cart", JSON.stringify(cart));

    alert("Item added to cart!");
  }
});

// DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(autoSlide, 4000);

  // Search filter
  const searchBar = document.getElementById("searchBar");
  if (searchBar) {
    searchBar.addEventListener("keyup", function (event) {
      const keyword = this.value.toLowerCase();
      const products = document.querySelectorAll(".product-card");

      // Filter current page products
      products.forEach(card => {
        const name = card.querySelector("h3")?.textContent.toLowerCase() || "";
        const desc = card.querySelector("p")?.textContent.toLowerCase() || "";
        card.style.display = name.includes(keyword) || desc.includes(keyword) ? "block" : "none";
      });

      // Redirect by keyword on Enter
      if (event.key === "Enter") {
        if (keyword.includes("textbook")) {
          window.location.href = "index.html";
        } else if (keyword.includes("electronics")) {
          window.location.href = "electronics.html";
        } else if (keyword.includes("apparel")) {
          window.location.href = "apparel.html";
        } else if (keyword.includes("student")) {
          window.location.href = "student.html";
        } else if (keyword.includes("decor") || keyword.includes("art")) {
          window.location.href = "art_decor.html";
        } else {
          alert("No matching category found.");
        }
      }
    });
  }

  // Open Post Modal
  const postBtn = document.querySelector(".post-button");
  if (postBtn) {
    postBtn.onclick = () => {
      document.getElementById("postItemModal").style.display = "block";
    };
  }

  // Close Post Modal
  const closeBtn = document.querySelector(".close-post");
  if (closeBtn) {
    closeBtn.onclick = () => {
      document.getElementById("postItemModal").style.display = "none";
    };
  }

  // Prevent dummy form submission
  const postForm = document.getElementById("postForm");
  if (postForm) {
    postForm.onsubmit = (e) => {
      e.preventDefault();
      alert("Post functionality is disabled in this static version. Please add items manually in HTML.");
      document.getElementById("postItemModal").style.display = "none";
    };
  }
});
