const glow = document.querySelector(".cursor-glow");
const card = document.getElementById("about-card");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.getElementById("menuPanel");
const aboutContent = document.getElementById("aboutContent");

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAboutText(rawText) {
  const lines = rawText.split(/\r?\n/);
  const html = [];
  let paragraphLines = [];
  let listItems = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    html.push(`<p>${escapeHtml(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    html.push("<ul>");
    listItems.forEach((item) => {
      html.push(`<li>${escapeHtml(item)}</li>`);
    });
    html.push("</ul>");
    listItems = [];
  }

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph();
      flushList();
      html.push(`<h2 class="about-heading">${escapeHtml(trimmed.slice(3))}</h2>`);
      return;
    }

    if (trimmed.startsWith("- ")) {
      flushParagraph();
      listItems.push(trimmed.slice(2));
      return;
    }

    flushList();
    paragraphLines.push(trimmed);
  });

  flushParagraph();
  flushList();

  return html.join("");
}

fetch("./about-27tools-content.txt")
  .then((response) => {
    if (!response.ok) {
      throw new Error("Unable to load about page content.");
    }
    return response.text();
  })
  .then((text) => {
    aboutContent.innerHTML = renderAboutText(text);
  })
  .catch(() => {
    aboutContent.innerHTML = `
      <p>About content could not be loaded right now.</p>
      <p>You can add or edit the page text in <code>about-27tools-content.txt</code>.</p>
    `;
  });

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
    const rotateY = (px - 0.5) * 1.05;
    const rotateX = (0.5 - py) * 1.05;

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
