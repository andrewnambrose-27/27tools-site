const glow = document.querySelector(".cursor-glow");
const card = document.getElementById("notFoundCard");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.getElementById("menuPanel");

document.addEventListener("mousemove", (e) => {
  if (!glow) return;
  glow.style.left = `${e.clientX}px`;
  glow.style.top = `${e.clientY}px`;
});

if (card) {
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    const rotateY = (px - 0.5) * 1.1;
    const rotateX = (0.5 - py) * 1.1;

    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-1px)`;
    card.style.setProperty("--mx", `${px * 100}%`);
    card.style.setProperty("--my", `${py * 100}%`);
  });

  card.addEventListener("mouseenter", () => {
    if (!glow) return;
    glow.style.width = "420px";
    glow.style.height = "420px";
    glow.style.opacity = "0.55";
    glow.style.filter = "blur(58px)";
  });

  card.addEventListener("mouseleave", () => {
    if (glow) {
      glow.style.width = "320px";
      glow.style.height = "320px";
      glow.style.opacity = "0.9";
      glow.style.filter = "blur(40px)";
    }

    card.style.transform = "rotateX(0deg) rotateY(0deg) translateY(0px)";
  });
}

if (menuToggle && menuPanel) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuPanel.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!menuPanel.classList.contains("is-open")) return;
    if (event.target.closest(".site-menu")) return;
    menuPanel.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
}
