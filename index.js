const glow = document.querySelector(".cursor-glow");
const card = document.getElementById("tilt-card");
const tiltSurfaces = document.querySelectorAll(".tilt-surface");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.getElementById("menuPanel");
const toolsTitleImage = document.querySelector(".tools-title-image");

document.addEventListener("mousemove", (e) => {
  if (!glow) return;

  glow.style.left = `${e.clientX}px`;
  glow.style.top = `${e.clientY}px`;
});

function attachTilt(surface, strength) {
  if (!surface) return;

  surface.addEventListener("mousemove", (e) => {
    const rect = surface.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    const rotateY = (px - 0.5) * strength;
    const rotateX = (0.5 - py) * strength;

    surface.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-1px)`;
    surface.style.setProperty("--mx", `${px * 100}%`);
    surface.style.setProperty("--my", `${py * 100}%`);
  });

  surface.addEventListener("mouseenter", () => {
    if (glow) {
      glow.style.width = "420px";
      glow.style.height = "420px";
      glow.style.opacity = "0.55";
      glow.style.filter = "blur(58px)";
    }

    surface.style.transition =
      "transform 0.16s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease";
  });

  surface.addEventListener("mouseleave", () => {
    if (glow) {
      glow.style.width = "320px";
      glow.style.height = "320px";
      glow.style.opacity = "0.9";
      glow.style.filter = "blur(40px)";
    }

    surface.style.transition =
      "transform 0.45s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease";
    surface.style.transform = "rotateX(0deg) rotateY(0deg) translateY(0px)";
  });
}

attachTilt(card, 1.35);
tiltSurfaces.forEach((surface) => attachTilt(surface, 0.8));

if (toolsTitleImage) {
  toolsTitleImage.addEventListener("error", () => {
    const wrap = toolsTitleImage.closest(".tools-title-wrap");
    if (wrap) {
      wrap.style.display = "none";
    }
  });
}

if (menuToggle && menuPanel) {
  const menuToggleText = menuToggle.querySelector(".sr-only");
  const setMenuState = (isOpen) => {
    menuPanel.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));

    if (menuToggleText) {
      menuToggleText.textContent = isOpen ? "Close navigation menu" : "Open navigation menu";
    }
  };

  menuToggle.addEventListener("click", () => {
    setMenuState(!menuPanel.classList.contains("is-open"));
  });

  document.addEventListener("click", (event) => {
    if (!menuPanel.classList.contains("is-open")) return;
    if (event.target.closest(".site-menu")) return;
    setMenuState(false);
  });
}
