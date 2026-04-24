const glow = document.querySelector(".cursor-glow");
const card = document.getElementById("tool-page-card");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.getElementById("menuPanel");
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const analyzeButton = document.getElementById("analyzeButton");
const clearButton = document.getElementById("clearButton");
const copyExifButton = document.getElementById("copyExifButton");
const statusBanner = document.getElementById("statusBanner");
const fileSurface = document.getElementById("fileSurface");
const resultSurface = document.getElementById("resultSurface");
const exifSurface = document.getElementById("exifSurface");
const fileCount = document.getElementById("fileCount");
const fileSize = document.getElementById("fileSize");
const scanState = document.getElementById("scanState");
const resultState = document.getElementById("resultState");
const dailyLimitValue = document.getElementById("dailyLimitValue");

const DAILY_SCAN_LIMIT = 30;
const LIMIT_STORAGE_KEY = "nikonShutterCountDailyLimit";

let selectedFile = null;
let parsedResult = null;
let parsedExif = null;
let scanning = false;

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLimitState() {
  const today = getTodayKey();

  try {
    const parsed = JSON.parse(localStorage.getItem(LIMIT_STORAGE_KEY) || "{}");
    if (parsed.date === today && Number.isFinite(parsed.count)) {
      return parsed;
    }
  } catch (error) {
    console.warn("Daily limit state could not be read.", error);
  }

  return { date: today, count: 0 };
}

function saveLimitState(state) {
  localStorage.setItem(LIMIT_STORAGE_KEY, JSON.stringify(state));
}

function getRemainingLimit() {
  const state = getLimitState();
  return Math.max(0, DAILY_SCAN_LIMIT - state.count);
}

function refreshLimitDisplay() {
  dailyLimitValue.textContent = `${getRemainingLimit()} remaining`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function setStatus(message, tone) {
  statusBanner.textContent = message;
  statusBanner.dataset.tone = tone || "neutral";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resetResult() {
  parsedResult = null;
  parsedExif = null;
  resultSurface.innerHTML = `
    <div class="empty-state">
      <strong>No result yet</strong>
      <span>Your shutter count result will appear here after scanning.</span>
    </div>
  `;
  exifSurface.innerHTML = `
    <div class="empty-state">
      <strong>No metadata loaded yet</strong>
      <span>Run a scan to view the full EXIF and maker-note data we can read from the file.</span>
    </div>
  `;
  resultState.textContent = "None";
  copyExifButton.disabled = true;
}

function updateSummary() {
  fileCount.textContent = selectedFile ? "1" : "0";
  fileSize.textContent = selectedFile ? formatBytes(selectedFile.size) : "0 KB";
  scanState.textContent = scanning ? "Scanning" : selectedFile ? "Ready" : "Waiting";
  analyzeButton.disabled = !selectedFile || scanning || getRemainingLimit() === 0;
}

function renderFileSurface() {
  if (!selectedFile) {
    fileSurface.innerHTML = `
      <div class="empty-state">
        <strong>No file selected yet</strong>
        <span>Add an original Nikon NEF to begin.</span>
      </div>
    `;
    return;
  }

  const extension = selectedFile.name.includes(".")
    ? selectedFile.name.split(".").pop().toUpperCase()
    : "FILE";
  const safeFileName = escapeHtml(selectedFile.name);
  const safeFileType = escapeHtml(selectedFile.type || extension);
  const safeExtension = escapeHtml(extension);

  fileSurface.innerHTML = `
    <div class="result-summary">
      <div class="meta-card">
        <span class="eyebrow">Loaded file</span>
        <strong>${safeFileName}</strong>
        <span>${formatBytes(selectedFile.size)} - ${safeFileType}</span>
      </div>
      <div class="tag-list">
        <span class="tag-chip">Original file recommended</span>
        <span class="tag-chip">Metadata scanned locally</span>
        <span class="tag-chip">${safeExtension}</span>
      </div>
    </div>
  `;
}

function getTypeSize(type) {
  switch (type) {
    case 1:
    case 2:
    case 6:
    case 7:
      return 1;
    case 3:
    case 8:
      return 2;
    case 4:
    case 9:
    case 11:
      return 4;
    case 5:
    case 10:
    case 12:
      return 8;
    default:
      return 0;
  }
}

function extractTiffView(buffer, preferredBaseOffset = null) {
  const view = new DataView(buffer);

  if (Number.isInteger(preferredBaseOffset)) {
    return { view, baseOffset: preferredBaseOffset };
  }

  if (view.byteLength >= 4) {
    const signature = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (signature === "II*\u0000" || signature === "MM\u0000*") {
      return { view, baseOffset: 0 };
    }
  }

  if (view.byteLength >= 4 && view.getUint8(0) === 0xff && view.getUint8(1) === 0xd8) {
    let offset = 2;

    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) {
        break;
      }

      const marker = view.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) {
        break;
      }

      const segmentLength = view.getUint16(offset + 2, false);
      if (marker === 0xe1 && offset + 10 <= view.byteLength) {
        const exifHeader = String.fromCharCode(
          view.getUint8(offset + 4),
          view.getUint8(offset + 5),
          view.getUint8(offset + 6),
          view.getUint8(offset + 7),
          view.getUint8(offset + 8),
          view.getUint8(offset + 9)
        );

        if (exifHeader === "Exif\u0000\u0000") {
          return { view, baseOffset: offset + 10 };
        }
      }

      offset += 2 + segmentLength;
    }
  }

  throw new Error("Unsupported file structure");
}

function createTiffReader(buffer, preferredBaseOffset = null) {
  const { view, baseOffset } = extractTiffView(buffer, preferredBaseOffset);
  const byteOrderA = String.fromCharCode(view.getUint8(baseOffset), view.getUint8(baseOffset + 1));
  const littleEndian = byteOrderA === "II";

  if (!littleEndian && byteOrderA !== "MM") {
    throw new Error("Invalid TIFF byte order");
  }

  function readUint16(offset) {
    return view.getUint16(baseOffset + offset, littleEndian);
  }

  function readUint32(offset) {
    return view.getUint32(baseOffset + offset, littleEndian);
  }

  function readString(offset, length) {
    const bytes = new Uint8Array(view.buffer, baseOffset + offset, length);
    const decoded = new TextDecoder("ascii").decode(bytes);
    return decoded.replace(/\0+$/, "").trim();
  }

  function readBytes(offset, length) {
    return new Uint8Array(view.buffer.slice(baseOffset + offset, baseOffset + offset + length));
  }

  function readIfdEntries(offset) {
    const count = readUint16(offset);
    const entries = [];

    for (let index = 0; index < count; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      const tag = readUint16(entryOffset);
      const type = readUint16(entryOffset + 2);
      const valueCount = readUint32(entryOffset + 4);
      const valueOrOffset = readUint32(entryOffset + 8);

      entries.push({
        tag,
        type,
        count: valueCount,
        valueOrOffset
      });
    }

    return entries;
  }

  function getInlineAscii(valueOrOffset, count) {
    const bytes = new Uint8Array(4);
    bytes[0] = valueOrOffset & 0xff;
    bytes[1] = (valueOrOffset >> 8) & 0xff;
    bytes[2] = (valueOrOffset >> 16) & 0xff;
    bytes[3] = (valueOrOffset >> 24) & 0xff;
    return new TextDecoder("ascii").decode(bytes.slice(0, count)).replace(/\0+$/, "").trim();
  }

  function getEntryValue(entry) {
    const byteSize = getTypeSize(entry.type) * entry.count;

    if (entry.type === 2) {
      if (byteSize <= 4) {
        return getInlineAscii(entry.valueOrOffset, entry.count);
      }
      return readString(entry.valueOrOffset, entry.count);
    }

    if (entry.type === 3 && entry.count === 1) {
      return byteSize <= 4
        ? (littleEndian ? entry.valueOrOffset & 0xffff : entry.valueOrOffset >>> 16)
        : readUint16(entry.valueOrOffset);
    }

    if (entry.type === 4 && entry.count === 1) {
      return entry.valueOrOffset;
    }

    if (entry.type === 7) {
      return readBytes(entry.valueOrOffset, byteSize);
    }

    return null;
  }

  return {
    littleEndian,
    baseOffset,
    readUint16,
    readUint32,
    readBytes,
    readIfdEntries,
    getEntryValue
  };
}

function parseNikonMakerNote(buffer) {
  const reader = createTiffReader(buffer);
  const ifd0Offset = reader.readUint32(4);
  const ifd0Entries = reader.readIfdEntries(ifd0Offset);
  const entryMap0 = new Map(ifd0Entries.map((entry) => [entry.tag, entry]));

  const make = entryMap0.has(0x010f) ? reader.getEntryValue(entryMap0.get(0x010f)) : "";
  const model = entryMap0.has(0x0110) ? reader.getEntryValue(entryMap0.get(0x0110)) : "";
  const software = entryMap0.has(0x0131) ? reader.getEntryValue(entryMap0.get(0x0131)) : "";

  const exifPointerEntry = entryMap0.get(0x8769);
  if (!exifPointerEntry) {
    return { make, model, software, metadataFound: false, shutterCount: null, sourceTag: "" };
  }

  const exifEntries = reader.readIfdEntries(exifPointerEntry.valueOrOffset);
  const exifMap = new Map(exifEntries.map((entry) => [entry.tag, entry]));
  const capturedAt = exifMap.has(0x9003) ? reader.getEntryValue(exifMap.get(0x9003)) : "";
  const makerNoteEntry = exifMap.get(0x927c);

  if (!makerNoteEntry) {
    return { make, model, software, capturedAt, metadataFound: true, shutterCount: null, sourceTag: "" };
  }

  let makerReader = null;
  for (const relativeOffset of [10, 8, 12, 0]) {
    try {
      const candidate = createTiffReader(buffer, reader.baseOffset + makerNoteEntry.valueOrOffset + relativeOffset);
      if (candidate.readUint16(2) === 42) {
        makerReader = candidate;
        break;
      }
    } catch {
      makerReader = null;
    }
  }

  if (!makerReader) {
    return { make, model, software, capturedAt, metadataFound: true, shutterCount: null, sourceTag: "" };
  }

  const makerEntries = makerReader.readIfdEntries(makerReader.readUint32(4));
  const makerMap = new Map(makerEntries.map((entry) => [entry.tag, entry]));
  const shutterCountEntry = makerMap.get(0x00a7);

  if (!shutterCountEntry) {
    return { make, model, software, capturedAt, metadataFound: makerEntries.length > 0, shutterCount: null, sourceTag: "" };
  }

  const value = makerReader.getEntryValue(shutterCountEntry);
  const shutterCount = Number(value);
  if (Number.isFinite(shutterCount) && shutterCount > 0 && shutterCount < 10000000) {
    return {
      make,
      model,
      software,
      capturedAt,
      metadataFound: true,
      shutterCount: Math.trunc(shutterCount),
      sourceTag: "Nikon MakerNote tag 0x00A7"
    };
  }

  return { make, model, software, capturedAt, metadataFound: true, shutterCount: null, sourceTag: "" };
}

function findExactShutterTag(value, path = "", seen = new WeakSet()) {
  const matches = [];

  if (value === null || value === undefined || typeof value !== "object") {
    return matches;
  }

  if (seen.has(value)) {
    return matches;
  }
  seen.add(value);

  const exactNames = new Set(["imagecount", "shuttercount", "shuttercount2"]);

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    const normalizedKey = key.toLowerCase();

    if (exactNames.has(normalizedKey)) {
      const numericValue = typeof nested === "number" ? nested : Number(nested);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        matches.push({ path: nextPath, value: Math.trunc(numericValue) });
      }
    }

    if (nested && typeof nested === "object") {
      matches.push(...findExactShutterTag(nested, nextPath, seen));
    }
  }

  return matches;
}

function renderResult(result) {
  const messageTone = result.shutterCount ? "success" : result.metadataFound ? "warning" : "danger";
  const messageText = result.shutterCount
    ? "Shutter count found in the file metadata."
    : result.metadataFound
      ? "Metadata was found, but the shutter count field was not available in this file."
      : "This file did not expose the camera maker-note data needed for a shutter count.";
  const safeSourceTag = escapeHtml(result.sourceTag || "");

  const countMarkup = result.shutterCount
    ? `
      <div class="hero-result">
        <span class="hero-result-label">Estimated shutter count</span>
        <strong class="hero-result-value">${result.shutterCount.toLocaleString()}</strong>
        <span class="hero-result-note">Source tag: ${safeSourceTag}</span>
      </div>
    `
    : `
      <div class="hero-result">
        <span class="hero-result-label">Estimated shutter count</span>
        <strong class="hero-result-value">Unavailable</strong>
        <span class="hero-result-note">Try a different original Nikon NEF directly from the camera.</span>
      </div>
    `;

  const make = result.make || "Unknown";
  const model = result.model || "Unknown";
  const capturedAt = result.capturedAt || "Unknown";
  const software = result.software || "Not listed";
  const safeMake = escapeHtml(make);
  const safeModel = escapeHtml(model);
  const safeCapturedAt = escapeHtml(capturedAt);
  const safeSoftware = escapeHtml(software);

  resultSurface.innerHTML = `
    <div class="result-summary">
      ${countMarkup}
      <div class="result-message" data-tone="${messageTone}">
        ${messageText}
      </div>
      <div class="meta-grid">
        <div class="meta-card">
          <span class="eyebrow">Camera make</span>
          <strong>${safeMake}</strong>
          <span>Read from file metadata</span>
        </div>
        <div class="meta-card">
          <span class="eyebrow">Camera model</span>
          <strong>${safeModel}</strong>
          <span>Useful for confirming the file source</span>
        </div>
        <div class="meta-card">
          <span class="eyebrow">Captured</span>
          <strong>${safeCapturedAt}</strong>
          <span>Best results usually come from the latest image on the camera</span>
        </div>
        <div class="meta-card">
          <span class="eyebrow">Software tag</span>
          <strong>${safeSoftware}</strong>
          <span>If this shows editor software, metadata may have been changed</span>
        </div>
      </div>
      <div class="tag-list">
        <span class="tag-chip">No upload required</span>
        <span class="tag-chip">Best with original Nikon NEF</span>
        <span class="tag-chip">${result.metadataFound ? "Metadata found" : "Metadata missing"}</span>
      </div>
    </div>
  `;
}

function sortObjectDeep(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sortObjectDeep(item, seen));
  }

  const output = {};
  Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => {
      const nested = value[key];

      if (nested instanceof Uint8Array) {
        output[key] = `[Uint8Array length=${nested.length}]`;
        return;
      }

      output[key] = sortObjectDeep(nested, seen);
    });
  return output;
}

function renderExifData(exifData) {
  parsedExif = exifData ? sortObjectDeep(exifData) : null;
  copyExifButton.disabled = !parsedExif;

  if (!parsedExif) {
    exifSurface.innerHTML = `
      <div class="empty-state">
        <strong>No metadata loaded yet</strong>
        <span>Run a scan to view the full EXIF and maker-note data we can read from the file.</span>
      </div>
    `;
    return;
  }

  const prettyJson = JSON.stringify(parsedExif, null, 2);
  exifSurface.innerHTML = `
    <div class="result-summary">
      <div class="meta-card">
        <span class="eyebrow">Metadata payload</span>
        <strong>Full EXIF and parsed tags</strong>
        <span>This includes the standard metadata we can read in-browser from the uploaded file.</span>
      </div>
      <pre class="exif-pre">${prettyJson.replace(/[&<>]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;"
      }[character]))}</pre>
    </div>
  `;
}

function formatDate(value) {
  if (!value) return "";

  try {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  } catch {
    return String(value);
  }
}

function setFile(file) {
  selectedFile = file || null;
  scanning = false;
  resetResult();
  renderFileSurface();
  updateSummary();

  if (selectedFile) {
    setStatus(`Ready to scan ${selectedFile.name}. Click "Read shutter count" when you are ready.`, "neutral");
  } else {
    setStatus("Add an original Nikon NEF file to get started.", "neutral");
  }
}

async function analyzeFile() {
  if (!selectedFile || scanning) return;

  const remainingLimit = getRemainingLimit();
  if (remainingLimit <= 0) {
    setStatus("Daily browser limit reached. Please try again tomorrow.", "danger");
    updateSummary();
    return;
  }

  scanning = true;
  updateSummary();
  setStatus(`Scanning ${selectedFile.name} for shutter count metadata...`, "warning");

  try {
    const fileBuffer = await selectedFile.arrayBuffer();
    let nikonData = null;
    let tags = null;

    try {
      nikonData = parseNikonMakerNote(fileBuffer);
    } catch {
      nikonData = null;
    }

    try {
      tags = window.exifr ? await window.exifr.parse(selectedFile, true) : null;
    } catch {
      tags = null;
    }

    const exactMatches = findExactShutterTag(tags || {});
    const exifCount = exactMatches.length > 0 ? exactMatches[0] : null;
    const shutterCount = nikonData?.shutterCount ?? exifCount?.value ?? null;
    const sourceTag = nikonData?.sourceTag || exifCount?.path || "";
    const make = nikonData?.make || tags?.Make || tags?.make || "";
    const model = nikonData?.model || tags?.Model || tags?.model || "";
    const capturedAt = formatDate(nikonData?.capturedAt || tags?.DateTimeOriginal || tags?.CreateDate || tags?.ModifyDate || "");
    const software = nikonData?.software || tags?.Software || tags?.software || "";

    parsedResult = {
      shutterCount,
      sourceTag,
      make,
      model,
      capturedAt,
      software,
      metadataFound: Boolean(
        (nikonData && (nikonData.metadataFound || nikonData.make || nikonData.model)) ||
        (tags && Object.keys(tags).length)
      )
    };

    renderResult(parsedResult);
    renderExifData(tags);
    resultState.textContent = parsedResult.shutterCount ? "Found" : "Needs another file";

    const limitState = getLimitState();
    limitState.count += 1;
    saveLimitState(limitState);
    refreshLimitDisplay();
    updateSummary();

    if (parsedResult.shutterCount) {
      setStatus(
        `Shutter count found: ${parsedResult.shutterCount.toLocaleString()}.`,
        "success"
      );
    } else {
      setStatus(
        "The file was read, but no shutter count field was exposed. Try a different original Nikon NEF direct from the camera.",
        parsedResult.metadataFound ? "warning" : "danger"
      );
    }
  } catch (error) {
    resetResult();
    resultState.textContent = "Scan failed";
    resultSurface.innerHTML = `
      <div class="result-summary">
        <div class="result-message" data-tone="danger">
          The file could not be parsed for shutter metadata. Try another original Nikon NEF, preferably the most recent unedited NEF from the camera.
        </div>
      </div>
    `;
    setStatus(
      "The scan could not read the metadata from that file. Try another original Nikon NEF file.",
      "danger"
    );
  } finally {
    scanning = false;
    updateSummary();
  }
}

function handleFiles(files) {
  const [file] = Array.from(files || []);
  if (!file) return;

  const lowerName = file.name.toLowerCase();
  const valid = lowerName.endsWith(".nef");

  if (!valid) {
    setStatus("Please use an original Nikon NEF file from the camera.", "danger");
    return;
  }

  setFile(file);
}

document.addEventListener("mousemove", (e) => {
  if (!glow) return;

  glow.style.left = `${e.clientX}px`;
  glow.style.top = `${e.clientY}px`;
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

if (fileInput) {
  fileInput.addEventListener("change", (event) => {
    handleFiles(event.target.files);
  });
}

if (dropzone) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-active");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-active");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    handleFiles(event.dataTransfer.files);
  });
}

analyzeButton.addEventListener("click", analyzeFile);

clearButton.addEventListener("click", () => {
  fileInput.value = "";
  setFile(null);
});

copyExifButton.addEventListener("click", async () => {
  if (!parsedExif) return;

  try {
    await navigator.clipboard.writeText(JSON.stringify(parsedExif, null, 2));
    setStatus("Full EXIF data copied to your clipboard.", "success");
  } catch {
    setStatus("Could not copy the EXIF data automatically, but it is still visible on the page.", "warning");
  }
});

refreshLimitDisplay();
updateSummary();
