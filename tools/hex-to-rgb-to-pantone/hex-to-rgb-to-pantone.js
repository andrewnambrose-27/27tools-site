const SAMPLE_HEX = "#D31A3B";
const PANTONE_RESULTS_LIMIT = 18;

const glow = document.querySelector(".cursor-glow");
const card = document.getElementById("tool-page-card");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.getElementById("menuPanel");
const hexInput = document.getElementById("hexInput");
const copyRgbButton = document.getElementById("copyRgbButton");
const copyPantoneButton = document.getElementById("copyPantoneButton");
const resetButton = document.getElementById("resetButton");
const statusBanner = document.getElementById("statusBanner");
const hexValue = document.getElementById("hexValue");
const rgbValue = document.getElementById("rgbValue");
const redValue = document.getElementById("redValue");
const greenValue = document.getElementById("greenValue");
const blueValue = document.getElementById("blueValue");
const bestPantoneValue = document.getElementById("bestPantoneValue");
const hexPreviewValue = document.getElementById("hexPreviewValue");
const hexPreviewMeta = document.getElementById("hexPreviewMeta");
const pantonePreviewValue = document.getElementById("pantonePreviewValue");
const pantonePreviewMeta = document.getElementById("pantonePreviewMeta");
const hexSwatch = document.getElementById("hexSwatch");
const pantoneSwatch = document.getElementById("pantoneSwatch");
const pantoneResults = document.getElementById("pantoneResults");
const pantoneSummary = document.getElementById("pantoneSummary");

const pantoneDataset = (window.PANTONE_DATA || []).map((item) => {
  const normalized = {
    name: item.name || item.Name,
    r: item.r ?? item.R,
    g: item.g ?? item.G,
    b: item.b ?? item.B,
    hex: item.hex || item.Hex
  };

  return {
    ...normalized,
    lab: rgbToLab(normalized)
  };
});

const pantoneCodeDataset = pantoneDataset.filter((item) => /\d/.test(item.name));

let currentMatches = [];
let selectedMatchIndex = 0;
let comparedMatchIndex = 0;

function setStatus(message, tone) {
  statusBanner.textContent = message;
  statusBanner.dataset.tone = tone || "neutral";
}

function normalizeHex(rawValue) {
  const compact = String(rawValue || "").trim().replace(/^#/, "").replace(/\s+/g, "");

  if (compact.length === 3 && /^[0-9a-f]{3}$/i.test(compact)) {
    return `#${compact.split("").map((character) => `${character}${character}`).join("").toUpperCase()}`;
  }

  if (compact.length === 6 && /^[0-9a-f]{6}$/i.test(compact)) {
    return `#${compact.toUpperCase()}`;
  }

  return null;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}

function rgbToLab(rgb) {
  const convert = (channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };

  const r = convert(rgb.r);
  const g = convert(rgb.g);
  const b = convert(rgb.b);

  const x = ((r * 0.4124) + (g * 0.3576) + (b * 0.1805)) / 0.95047;
  const y = ((r * 0.2126) + (g * 0.7152) + (b * 0.0722)) / 1.0;
  const z = ((r * 0.0193) + (g * 0.1192) + (b * 0.9505)) / 1.08883;

  const pivot = (value) => (
    value > 0.008856
      ? value ** (1 / 3)
      : (7.787 * value) + (16 / 116)
  );

  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

function deltaE(left, right) {
  return Math.sqrt(
    ((left.l - right.l) ** 2) +
    ((left.a - right.a) ** 2) +
    ((left.b - right.b) ** 2)
  );
}

function rgbString(rgb) {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function getMatchScore(distance) {
  return Math.max(0, Math.min(100, 100 - Math.round(distance)));
}

function getClosestPantones(rgb) {
  const targetLab = rgbToLab(rgb);

  return pantoneCodeDataset
    .map((item) => ({
      ...item,
      distance: Math.round(deltaE(targetLab, item.lab))
    }))
    .map((item) => ({
      ...item,
      score: getMatchScore(item.distance)
    }))
    .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name))
    .slice(0, PANTONE_RESULTS_LIMIT);
}

function renderPantoneCards(sourceHex) {
  if (currentMatches.length === 0) {
    pantoneResults.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>No Pantone data available</strong>
        <span>The Pantone dataset could not be loaded for matching.</span>
      </div>
    `;
    pantoneSummary.textContent = "Pantone matches unavailable";
    return;
  }

  pantoneResults.innerHTML = currentMatches.map((match, index) => `
    <button
      type="button"
      class="pantone-match-card${index === comparedMatchIndex ? " is-comparing" : ""}${index === selectedMatchIndex ? " is-active" : ""}"
      data-index="${index}"
      aria-label="Compare ${match.name}"
    >
      <div class="pantone-match-swatch" aria-hidden="true">
        <div class="pantone-match-swatch-base" style="background:${match.hex};"></div>
        <div
          class="pantone-match-swatch-compare"
          style="background:linear-gradient(90deg, ${sourceHex} 0%, ${sourceHex} 50%, ${match.hex} 50%, ${match.hex} 100%);"
        >
          <span>HEX</span>
          <span>Pantone</span>
        </div>
      </div>
      <div class="pantone-match-copy">
        ${index === 0 ? '<span class="pantone-badge">Best match</span>' : ""}
        <strong class="pantone-match-name">${match.name}</strong>
        <span class="pantone-match-score">Match score ${match.score}%</span>
        <span class="pantone-match-rgb">${rgbString(match)}</span>
      </div>
    </button>
  `).join("");

  pantoneSummary.textContent = `Showing the ${currentMatches.length} closest matches`;
}

function updateComparedPantone(index) {
  if (!currentMatches[index]) {
    return;
  }

  comparedMatchIndex = index;
  const match = currentMatches[index];

  pantonePreviewValue.textContent = match.name;
  pantonePreviewMeta.textContent = `${rgbString(match)} - Match score ${match.score}%`;
  pantoneSwatch.style.background = match.hex;

  Array.from(pantoneResults.querySelectorAll(".pantone-match-card")).forEach((cardElement) => {
    const cardIndex = Number(cardElement.dataset.index);
    cardElement.classList.toggle("is-comparing", cardIndex === comparedMatchIndex);
    cardElement.classList.toggle("is-active", cardIndex === selectedMatchIndex);
  });
}

function renderInvalidState() {
  hexInput.classList.add("is-invalid");
  bestPantoneValue.textContent = "Need a valid HEX";
  pantonePreviewValue.textContent = "No Pantone match";
  pantonePreviewMeta.textContent = "Enter a valid HEX to compare colour matches.";
  pantoneResults.innerHTML = `
    <div class="empty-state compact-empty">
      <strong>Enter a valid HEX colour</strong>
      <span>Closest Pantone options will appear here automatically.</span>
    </div>
  `;
  pantoneSummary.textContent = "Waiting for a valid HEX colour";
  setStatus("Use a valid 3-digit or 6-digit HEX code, with or without #.", "danger");
}

function renderValidState(normalizedHex, rgb) {
  const rgbText = rgbString(rgb);
  const sourceHex = normalizedHex;

  hexInput.classList.remove("is-invalid");
  hexValue.textContent = normalizedHex;
  rgbValue.textContent = rgbText;
  redValue.textContent = String(rgb.r);
  greenValue.textContent = String(rgb.g);
  blueValue.textContent = String(rgb.b);
  hexPreviewValue.textContent = normalizedHex;
  hexPreviewMeta.textContent = rgbText;
  hexSwatch.style.background = normalizedHex;

  currentMatches = getClosestPantones(rgb);
  selectedMatchIndex = 0;
  comparedMatchIndex = 0;

  const bestMatch = currentMatches[0];

  if (bestMatch) {
    bestPantoneValue.textContent = bestMatch.name;
  } else {
    bestPantoneValue.textContent = "Unavailable";
  }

  renderPantoneCards(sourceHex);
  updateComparedPantone(0);
  setStatus("HEX converted successfully. Hover or tap a Pantone card to compare colours.", "success");
}

function updateConversion() {
  const normalizedHex = normalizeHex(hexInput.value);

  if (!normalizedHex) {
    renderInvalidState();
    return;
  }

  const rgb = hexToRgb(normalizedHex);
  renderValidState(normalizedHex, rgb);
}

async function copyRgbValue() {
  const normalizedHex = normalizeHex(hexInput.value);

  if (!normalizedHex) {
    setStatus("Enter a valid HEX code before copying the RGB value.", "danger");
    return;
  }

  const rgbText = rgbString(hexToRgb(normalizedHex));

  try {
    await navigator.clipboard.writeText(rgbText);
    setStatus(`Copied ${rgbText} to your clipboard.`, "success");
  } catch {
    setStatus("Could not copy the RGB value automatically, but it is visible on the page.", "warning");
  }
}

async function copyPantoneValue() {
  const match = currentMatches[selectedMatchIndex];

  if (!match) {
    setStatus("No Pantone match is available to copy yet.", "danger");
    return;
  }

  try {
    await navigator.clipboard.writeText(match.name);
    setStatus(`Copied ${match.name} to your clipboard.`, "success");
  } catch {
    setStatus("Could not copy the Pantone name automatically, but it is visible on the page.", "warning");
  }
}

function resetSample() {
  hexInput.value = SAMPLE_HEX;
  updateConversion();
}

document.addEventListener("mousemove", (event) => {
  if (!glow) return;
  glow.style.left = `${event.clientX}px`;
  glow.style.top = `${event.clientY}px`;
});

if (card) {
  card.addEventListener("mouseenter", () => {
    if (!glow) return;
    glow.style.width = "420px";
    glow.style.height = "420px";
    glow.style.opacity = "0.55";
    glow.style.filter = "blur(58px)";
  });

  card.addEventListener("mouseleave", () => {
    if (!glow) return;
    glow.style.width = "320px";
    glow.style.height = "320px";
    glow.style.opacity = "0.9";
    glow.style.filter = "blur(40px)";
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

hexInput.addEventListener("input", updateConversion);
hexInput.addEventListener("blur", () => {
  const normalizedHex = normalizeHex(hexInput.value);
  if (normalizedHex) {
    hexInput.value = normalizedHex;
    updateConversion();
  }
});

copyRgbButton.addEventListener("click", copyRgbValue);
copyPantoneButton.addEventListener("click", copyPantoneValue);
resetButton.addEventListener("click", resetSample);

pantoneResults.addEventListener("click", (event) => {
  const cardElement = event.target.closest("[data-index]");
  if (!cardElement) return;

  selectedMatchIndex = Number(cardElement.dataset.index);
  updateComparedPantone(selectedMatchIndex);
});

pantoneResults.addEventListener("mouseover", (event) => {
  const cardElement = event.target.closest("[data-index]");
  if (!cardElement) return;
  updateComparedPantone(Number(cardElement.dataset.index));
});

pantoneResults.addEventListener("focusin", (event) => {
  const cardElement = event.target.closest("[data-index]");
  if (!cardElement) return;
  updateComparedPantone(Number(cardElement.dataset.index));
});

pantoneResults.addEventListener("mouseout", (event) => {
  const nextTarget = event.relatedTarget;
  if (nextTarget && pantoneResults.contains(nextTarget)) {
    return;
  }
  updateComparedPantone(selectedMatchIndex);
});

pantoneResults.addEventListener("focusout", (event) => {
  const nextTarget = event.relatedTarget;
  if (nextTarget && pantoneResults.contains(nextTarget)) {
    return;
  }
  updateComparedPantone(selectedMatchIndex);
});

resetSample();
