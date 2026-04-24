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
const LIMIT_STORAGE_KEY = "canonShutterCountDailyLimit";

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
      <span>Run a scan to view the full EXIF and Canon maker-note data we can read from the file.</span>
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
        <span>Add an original Canon CR3 to begin.</span>
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

function findAsciiSequence(bytes, text, start = 0) {
  const pattern = new TextEncoder().encode(text);

  for (let index = start; index <= bytes.length - pattern.length; index += 1) {
    let matched = true;

    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return index;
    }
  }

  return -1;
}

function getIsoBoxType(bytes, offset) {
  return String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
}

function getIsoBoxSize(view, offset) {
  const size32 = view.getUint32(offset, false);

  if (size32 === 1) {
    const high = view.getUint32(offset + 8, false);
    const low = view.getUint32(offset + 12, false);
    return high * 4294967296 + low;
  }

  return size32;
}

function listIsoChildBoxes(bytes, view, boxStart, boxEnd, extraHeader = 0) {
  const children = [];
  let offset = boxStart + 8 + extraHeader;

  while (offset + 8 <= boxEnd && offset + 8 <= view.byteLength) {
    const size = getIsoBoxSize(view, offset);
    const type = getIsoBoxType(bytes, offset);

    if (!size || size < 8) {
      break;
    }

    const end = offset + size;
    if (end > boxEnd || end > view.byteLength) {
      break;
    }

    children.push({
      type,
      start: offset,
      size,
      end
    });

    offset = end;
  }

  return children;
}

function findCtmdSample(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const moovIndex = findAsciiSequence(bytes, "moov");

  if (moovIndex < 4) {
    return null;
  }

  const moovStart = moovIndex - 4;
  const moovSize = getIsoBoxSize(view, moovStart);
  if (!moovSize || moovStart + moovSize > view.byteLength) {
    return null;
  }

  const tracks = listIsoChildBoxes(bytes, view, moovStart, moovStart + moovSize)
    .filter((box) => box.type === "trak");

  for (const track of tracks) {
    const mdia = listIsoChildBoxes(bytes, view, track.start, track.end).find((box) => box.type === "mdia");
    if (!mdia) continue;

    const minf = listIsoChildBoxes(bytes, view, mdia.start, mdia.end).find((box) => box.type === "minf");
    if (!minf) continue;

    const stbl = listIsoChildBoxes(bytes, view, minf.start, minf.end).find((box) => box.type === "stbl");
    if (!stbl) continue;

    const stblChildren = listIsoChildBoxes(bytes, view, stbl.start, stbl.end);
    const stsd = stblChildren.find((box) => box.type === "stsd");
    const stsz = stblChildren.find((box) => box.type === "stsz");
    const co64 = stblChildren.find((box) => box.type === "co64");
    const stco = stblChildren.find((box) => box.type === "stco");

    if (!stsd || !stsz || (!co64 && !stco)) {
      continue;
    }

    const sampleEntries = listIsoChildBoxes(bytes, view, stsd.start, stsd.end, 8);
    const hasCtmdEntry = sampleEntries.some((entry) => entry.type === "CTMD");
    if (!hasCtmdEntry) {
      continue;
    }

    const sampleCount = view.getUint32(stsz.start + 16, false);
    if (sampleCount < 1) {
      continue;
    }

    const defaultSampleSize = view.getUint32(stsz.start + 12, false);
    const sampleSize = defaultSampleSize || view.getUint32(stsz.start + 20, false);
    if (!sampleSize) {
      continue;
    }

    let sampleOffset = null;
    if (co64) {
      const high = view.getUint32(co64.start + 16, false);
      const low = view.getUint32(co64.start + 20, false);
      sampleOffset = high * 4294967296 + low;
    } else if (stco) {
      sampleOffset = view.getUint32(stco.start + 16, false);
    }

    if (!Number.isFinite(sampleOffset) || sampleOffset < 0 || sampleOffset + sampleSize > view.byteLength) {
      continue;
    }

    return bytes.slice(sampleOffset, sampleOffset + sampleSize);
  }

  return null;
}

function getCr3TiffBaseOffset(buffer, marker) {
  const bytes = new Uint8Array(buffer);
  const markerIndex = findAsciiSequence(bytes, marker);

  if (markerIndex === -1) {
    throw new Error(`Missing ${marker} marker`);
  }

  const baseOffset = markerIndex + marker.length;
  if (baseOffset + 4 > bytes.length) {
    throw new Error("Invalid CR3 TIFF block");
  }

  const byteOrder = String.fromCharCode(bytes[baseOffset], bytes[baseOffset + 1]);
  if (byteOrder !== "II" && byteOrder !== "MM") {
    throw new Error("Invalid embedded TIFF byte order");
  }

  return baseOffset;
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
    readUint16,
    readUint32,
    readBytes,
    readIfdEntries,
    getEntryValue
  };
}

function getEntryBytes(entry, reader) {
  const byteSize = getTypeSize(entry.type) * entry.count;
  return byteSize > 0 ? reader.readBytes(entry.valueOrOffset, byteSize) : null;
}

function parsePrimaryTiffMetadata(buffer) {
  let reader;

  try {
    reader = createTiffReader(buffer, getCr3TiffBaseOffset(buffer, "CMT1"));
  } catch {
    return { make: "", model: "", software: "", capturedAt: "", metadataFound: false };
  }

  const ifd0Offset = reader.readUint32(4);
  const ifd0Entries = reader.readIfdEntries(ifd0Offset);
  const entryMap0 = new Map(ifd0Entries.map((entry) => [entry.tag, entry]));
  const make = entryMap0.has(0x010f) ? reader.getEntryValue(entryMap0.get(0x010f)) : "";
  const model = entryMap0.has(0x0110) ? reader.getEntryValue(entryMap0.get(0x0110)) : "";
  const software = entryMap0.has(0x0131) ? reader.getEntryValue(entryMap0.get(0x0131)) : "";
  let capturedAt = entryMap0.has(0x0132) ? reader.getEntryValue(entryMap0.get(0x0132)) : "";
  const exifPointerEntry = entryMap0.get(0x8769);
  if (exifPointerEntry) {
    const exifEntries = reader.readIfdEntries(exifPointerEntry.valueOrOffset);
    const exifMap = new Map(exifEntries.map((entry) => [entry.tag, entry]));
    if (exifMap.has(0x9003)) {
      capturedAt = reader.getEntryValue(exifMap.get(0x9003));
    }
  }

  return {
    make,
    model,
    software,
    capturedAt,
    metadataFound: Boolean(make || model || software || capturedAt)
  };
}

function resolveCanonCameraInfoOffset(model) {
  const normalized = (model || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (/EOS R6 MARK II|EOS R6M2|EOS R8|EOS R50/.test(normalized)) {
    return 3369;
  }

  if (/EOS R5|EOS R6/.test(normalized)) {
    return 2801;
  }

  return null;
}

function parseCtmdCanonMakerNote(buffer, model) {
  const offset = resolveCanonCameraInfoOffset(model);
  const sample = findCtmdSample(buffer);

  if (!sample || !Number.isInteger(offset)) {
    return null;
  }

  let metadataFound = false;
  let position = 0;

  while (position + 12 <= sample.length) {
    const size = new DataView(sample.buffer, sample.byteOffset + position, 4).getUint32(0, true);
    const type = new DataView(sample.buffer, sample.byteOffset + position + 4, 2).getUint16(0, true);

    if (size < 12 || position + size > sample.length) {
      break;
    }

    if (type === 8) {
      const payload = sample.slice(position + 12, position + size);
      const embeddedTiffOffset = findAsciiSequence(payload, "II*\u0000");

      if (embeddedTiffOffset !== -1) {
        const embeddedBuffer = payload.buffer.slice(
          payload.byteOffset + embeddedTiffOffset,
          payload.byteOffset + payload.length
        );

        try {
          const reader = createTiffReader(embeddedBuffer, 0);
          const ifd0Offset = reader.readUint32(4);
          const makerEntries = reader.readIfdEntries(ifd0Offset);
          const makerMap = new Map(makerEntries.map((entry) => [entry.tag, entry]));
          const cameraInfoEntry = makerMap.get(0x000d);

          metadataFound = makerEntries.length > 0;

          if (cameraInfoEntry) {
            const bytes = getEntryBytes(cameraInfoEntry, reader);
            if (bytes && offset + 4 <= bytes.length) {
              const value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

              if (value > 0 && value < 10000000) {
                return {
                  metadataFound: true,
                  shutterCount: value,
                  sourceTag: `Canon CTMD type 8 CameraInfo tag 0x000d @ ${offset}`
                };
              }
            }
          }
        } catch (error) {
          console.warn("Timed Canon metadata could not be parsed.", error);
        }
      }
    }

    position += size;
  }

  return metadataFound
    ? { metadataFound: true, shutterCount: null, sourceTag: "" }
    : null;
}

function parseCanonMakerNote(buffer, model) {
  const timedMakerNoteResult = parseCtmdCanonMakerNote(buffer, model);
  if (timedMakerNoteResult) {
    return timedMakerNoteResult;
  }

  let reader;

  try {
    reader = createTiffReader(buffer, getCr3TiffBaseOffset(buffer, "CMT3"));
  } catch {
    return { metadataFound: false, shutterCount: null, sourceTag: "" };
  }

  const ifd0Offset = reader.readUint32(4);
  const makerEntries = reader.readIfdEntries(ifd0Offset);
  const makerMap = new Map(makerEntries.map((entry) => [entry.tag, entry]));
  const cameraInfoEntry = makerMap.get(0x000d);
  const offset = resolveCanonCameraInfoOffset(model);

  if (cameraInfoEntry && Number.isInteger(offset)) {
    const bytes = getEntryBytes(cameraInfoEntry, reader);
    if (bytes && offset + 4 <= bytes.length) {
      const value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
      if (value > 0 && value < 10000000) {
        return {
          metadataFound: true,
          shutterCount: value,
          sourceTag: `Canon static CameraInfo tag 0x000d @ ${offset}`
        };
      }
    }
  }

  return {
    metadataFound: makerEntries.length > 0,
    shutterCount: null,
    sourceTag: ""
  };
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

  const exactNames = new Map([
    ["shuttercount", 5],
    ["shuttercount2", 4],
    ["imagecount", 4],
    ["imagecount2", 3]
  ]);

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    const normalizedKey = key.toLowerCase();

    if (exactNames.has(normalizedKey)) {
      const numericValue = typeof nested === "number" ? nested : Number(nested);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        matches.push({
          path: nextPath,
          value: Math.trunc(numericValue),
          score: exactNames.get(normalizedKey)
        });
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
      ? "Metadata was found, but this file did not expose a reliable Canon shutter count field."
      : "This file did not expose the Canon maker-note data needed for a shutter count.";
  const safeSourceTag = escapeHtml(result.sourceTag || "");

  const countMarkup = result.shutterCount
    ? `
      <div class="hero-result">
        <span class="hero-result-label">CAMERA SHUTTER COUNT</span>
        <strong class="hero-result-value">${result.shutterCount.toLocaleString()}</strong>
        <span class="hero-result-note">Source tag: ${safeSourceTag}</span>
      </div>
    `
    : `
      <div class="hero-result">
        <span class="hero-result-label">CAMERA SHUTTER COUNT</span>
        <strong class="hero-result-value">Unavailable</strong>
        <span class="hero-result-note">Try a different original CR3 directly from the camera.</span>
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
        <span class="tag-chip">Best with original Canon CR3</span>
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

function buildCanonMetadataFallback(primaryData, canonData, result) {
  if (!result?.metadataFound) {
    return null;
  }

  return {
    Make: result.make || "Unknown",
    Model: result.model || "Unknown",
    DateTimeOriginal: result.capturedAt || "Unknown",
    Software: result.software || "Not listed",
    ShutterCount: result.shutterCount || "Unavailable",
    ShutterCountSource: result.sourceTag || "Not found",
    CanonMakerNoteAvailable: Boolean(canonData?.metadataFound),
    PrimaryMetadataAvailable: Boolean(primaryData?.metadataFound),
    ParserNote: "CR3 metadata was read with the local Canon parser because the EXIF library did not return a full CR3 payload."
  };
}
function renderExifData(exifData) {
  parsedExif = exifData ? sortObjectDeep(exifData) : null;
  copyExifButton.disabled = !parsedExif;

  if (!parsedExif) {
    exifSurface.innerHTML = `
      <div class="empty-state">
        <strong>No metadata loaded yet</strong>
        <span>Run a scan to view the full EXIF and Canon maker-note data we can read from the file.</span>
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
    setStatus("Add an original Canon CR3 file to get started.", "neutral");
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
    let primaryData = null;
    let canonData = null;
    let tags = null;

    try {
      primaryData = parsePrimaryTiffMetadata(fileBuffer);
    } catch {
      primaryData = null;
    }

    try {
      canonData = parseCanonMakerNote(fileBuffer, primaryData?.model || "");
    } catch {
      canonData = null;
    }

    try {
      tags = window.exifr ? await window.exifr.parse(selectedFile, true) : null;
    } catch {
      tags = null;
    }

    const exactMatches = findExactShutterTag(tags || {}).sort((left, right) => right.score - left.score);
    const exifCount = exactMatches.length > 0 ? exactMatches[0] : null;
    const shutterCount = canonData?.shutterCount ?? exifCount?.value ?? null;
    const sourceTag = canonData?.sourceTag || exifCount?.path || "";
    const make = primaryData?.make || tags?.Make || tags?.make || "";
    const model = primaryData?.model || tags?.Model || tags?.model || "";
    const capturedAt = formatDate(primaryData?.capturedAt || tags?.DateTimeOriginal || tags?.CreateDate || tags?.ModifyDate || "");
    const software = primaryData?.software || tags?.Software || tags?.software || "";

    parsedResult = {
      shutterCount,
      sourceTag,
      make,
      model,
      capturedAt,
      software,
      metadataFound: Boolean(
        (primaryData && (primaryData.metadataFound || primaryData.make || primaryData.model)) ||
        (canonData && canonData.metadataFound) ||
        (tags && Object.keys(tags).length)
      )
    };
    const metadataForViewer = tags || buildCanonMetadataFallback(primaryData, canonData, parsedResult);
    renderResult(parsedResult);
    renderExifData(metadataForViewer);
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
        "The file was read, but no reliable shutter count field was exposed. Try another original CR3 direct from the camera.",
        parsedResult.metadataFound ? "warning" : "danger"
      );
    }
  } catch {
    resetResult();
    resultState.textContent = "Scan failed";
    resultSurface.innerHTML = `
      <div class="result-summary">
        <div class="result-message" data-tone="danger">
          The file could not be parsed for shutter metadata. Try another original Canon CR3, preferably the most recent unedited file from the camera.
        </div>
      </div>
    `;
    setStatus(
      "The scan could not read the metadata from that file. Try another original Canon CR3 file.",
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
  const valid = lowerName.endsWith(".cr3");

  if (!valid) {
    setStatus("Please use an original Canon CR3 file from the camera.", "danger");
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
