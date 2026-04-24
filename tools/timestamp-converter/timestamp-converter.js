const glow = document.querySelector(".cursor-glow");
const card = document.getElementById("tool-page-card");
const menuToggle = document.querySelector(".menu-toggle");
const menuPanel = document.getElementById("menuPanel");
const liveTimestamp = document.getElementById("liveTimestamp");
const liveTimestampMeta = document.getElementById("liveTimestampMeta");
const copyLiveButton = document.getElementById("copyLiveButton");
const timestampInput = document.getElementById("timestampInput");
const timestampUnit = document.getElementById("timestampUnit");
const convertTimestampButton = document.getElementById("convertTimestampButton");
const useNowButton = document.getElementById("useNowButton");
const copyIsoButton = document.getElementById("copyIsoButton");
const dateInput = document.getElementById("dateInput");
const dateMode = document.getElementById("dateMode");
const convertDateButton = document.getElementById("convertDateButton");
const setDateNowButton = document.getElementById("setDateNowButton");
const dateSecondsValue = document.getElementById("dateSecondsValue");
const dateMillisecondsValue = document.getElementById("dateMillisecondsValue");
const timezoneValue = document.getElementById("timezoneValue");
const relativeValue = document.getElementById("relativeValue");
const formatRows = document.getElementById("formatRows");
const durationRows = document.getElementById("durationRows");
const detectedUnit = document.getElementById("detectedUnit");
const statusBanner = document.getElementById("statusBanner");

const THIRTY_TWO_BIT_MAX_SECONDS = 2147483647;
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
const localFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "long"
});
const utcFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "full",
  timeStyle: "long",
  timeZone: "UTC"
});
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto"
});

let currentDate = new Date();

const durations = [
  ["1 Minute", 60],
  ["1 Hour", 3600],
  ["1 Day", 86400],
  ["1 Week", 604800],
  ["1 Month (30.44 days)", 2629743],
  ["1 Year (365.24 days)", 31556926]
];

let copiedButtonTimeout = null;

function setStatus(message, tone) {
  statusBanner.textContent = message;
  statusBanner.dataset.tone = tone || "neutral";
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function getOffsetText(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

function toDatetimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseDatetimeLocal(value, mode) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");
  const date = mode === "utc"
    ? new Date(Date.UTC(year, month, day, hour, minute, second))
    : new Date(year, month, day, hour, minute, second);

  return Number.isNaN(date.getTime()) ? null : date;
}

function detectUnit(rawValue) {
  const digits = rawValue.replace(/^-/, "");

  if (timestampUnit.value !== "auto") {
    return timestampUnit.value;
  }

  if (digits.length <= 10) return "seconds";
  if (digits.length <= 13) return "milliseconds";
  if (digits.length <= 16) return "microseconds";
  return "nanoseconds";
}

function timestampToMilliseconds(rawValue, unit) {
  const value = BigInt(rawValue);

  if (unit === "seconds") return Number(value * 1000n);
  if (unit === "milliseconds") return Number(value);
  if (unit === "microseconds") return Number(value / 1000n);
  return Number(value / 1000000n);
}

function normalizeTimestampInput(value) {
  const compact = String(value || "").trim().replace(/,/g, "");
  return /^-?\d+$/.test(compact) ? compact : null;
}

function getRelativeText(date) {
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);

  if (absolute < 60) return relativeFormatter.format(diffSeconds, "second");
  if (absolute < 3600) return relativeFormatter.format(Math.round(diffSeconds / 60), "minute");
  if (absolute < 86400) return relativeFormatter.format(Math.round(diffSeconds / 3600), "hour");
  if (absolute < 2592000) return relativeFormatter.format(Math.round(diffSeconds / 86400), "day");
  if (absolute < 31536000) return relativeFormatter.format(Math.round(diffSeconds / 2592000), "month");
  return relativeFormatter.format(Math.round(diffSeconds / 31536000), "year");
}

function createCopyButton(value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-value-button";
  button.textContent = "Copy";
  button.setAttribute("aria-label", `Copy ${value}`);
  button.dataset.copyValue = value;
  return button;
}

function showCopiedFeedback(button) {
  if (!button) {
    return;
  }

  if (copiedButtonTimeout) {
    clearTimeout(copiedButtonTimeout);
  }

  document.querySelectorAll(".copy-value-button.is-copied").forEach((activeButton) => {
    activeButton.classList.remove("is-copied");
    activeButton.textContent = "Copy";
    activeButton.setAttribute("aria-label", `Copy ${activeButton.dataset.copyValue}`);
  });

  button.classList.add("is-copied");
  button.textContent = "Copied";
  button.setAttribute("aria-label", `Copied ${button.dataset.copyValue}`);

  copiedButtonTimeout = setTimeout(() => {
    button.classList.remove("is-copied");
    button.textContent = "Copy";
    button.setAttribute("aria-label", `Copy ${button.dataset.copyValue}`);
    copiedButtonTimeout = null;
  }, 1600);
}

function renderFormatRows(date) {
  const seconds = Math.floor(date.getTime() / 1000);
  const milliseconds = date.getTime();
  const localTime = localFormatter.format(date);
  const utcTime = utcFormatter.format(date);
  const iso = date.toISOString();
  const rows = [
    ["Local time", localTime],
    ["UTC", utcTime],
    ["ISO 8601", iso],
    ["RFC 2822", date.toUTCString()],
    ["RFC 3339", iso],
    ["Unix seconds", String(seconds)],
    ["Unix milliseconds", String(milliseconds)]
  ];

  formatRows.textContent = "";
  rows.forEach(([label, value]) => {
    const row = document.createElement("tr");
    const labelCell = document.createElement("td");
    const valueCell = document.createElement("td");
    labelCell.textContent = label;
    valueCell.textContent = value;
    valueCell.appendChild(createCopyButton(value));
    row.append(labelCell, valueCell);
    formatRows.appendChild(row);
  });
}

function renderDurationRows() {
  durationRows.textContent = "";

  durations.forEach(([label, seconds]) => {
    const row = document.createElement("tr");
    const labelCell = document.createElement("td");
    const secondsCell = document.createElement("td");
    const millisecondsCell = document.createElement("td");
    const milliseconds = seconds * 1000;

    labelCell.textContent = label;
    secondsCell.textContent = `${formatNumber(seconds)} seconds`;
    millisecondsCell.textContent = `${formatNumber(milliseconds)} ms`;
    secondsCell.appendChild(createCopyButton(String(seconds)));
    millisecondsCell.appendChild(createCopyButton(String(milliseconds)));
    row.append(labelCell, secondsCell, millisecondsCell);
    durationRows.appendChild(row);
  });
}

function renderDateSummary(date) {
  dateSecondsValue.textContent = String(Math.floor(date.getTime() / 1000));
  dateMillisecondsValue.textContent = String(date.getTime());
  timezoneValue.textContent = `${localTimezone} (${getOffsetText(date)})`;
  relativeValue.textContent = getRelativeText(date);
}

function renderDate(date, unitLabel) {
  currentDate = date;
  renderFormatRows(date);
  renderDateSummary(date);
  detectedUnit.textContent = unitLabel;
}

function renderInvalidTimestamp() {
  timestampInput.classList.add("is-invalid");
  detectedUnit.textContent = "Waiting for a valid timestamp";
  setStatus("Enter a whole-number Unix timestamp before converting.", "danger");
}

function convertTimestamp() {
  const normalized = normalizeTimestampInput(timestampInput.value);

  if (!normalized) {
    renderInvalidTimestamp();
    return;
  }

  const unit = detectUnit(normalized);
  const milliseconds = timestampToMilliseconds(normalized, unit);
  const date = new Date(milliseconds);

  if (!Number.isFinite(milliseconds) || Number.isNaN(date.getTime())) {
    renderInvalidTimestamp();
    setStatus("That timestamp is outside the date range this browser can display.", "danger");
    return;
  }

  timestampInput.classList.remove("is-invalid");
  renderDate(date, `${timestampUnit.value === "auto" ? "Auto detected" : "Using"} ${unit}`);

  const seconds = Math.floor(date.getTime() / 1000);
  if (seconds > THIRTY_TWO_BIT_MAX_SECONDS) {
    setStatus("Converted successfully. This date is beyond the classic 32-bit Unix timestamp limit from 19 January 2038.", "warning");
  } else {
    setStatus("Timestamp converted successfully.", "success");
  }
}

function convertDate() {
  const date = parseDatetimeLocal(dateInput.value, dateMode.value);

  if (!date) {
    dateInput.classList.add("is-invalid");
    setStatus("Choose a valid date and time before converting.", "danger");
    return;
  }

  dateInput.classList.remove("is-invalid");
  timestampInput.value = String(Math.floor(date.getTime() / 1000));
  timestampUnit.value = "seconds";
  renderDate(date, `Date interpreted as ${dateMode.value === "utc" ? "UTC" : localTimezone}`);
  setStatus("Date converted into Unix timestamp values.", "success");
}

function setDateToNow() {
  const now = new Date();
  dateInput.value = toDatetimeLocalValue(now);
  convertDate();
}

function useCurrentTime() {
  const now = new Date();
  timestampInput.value = String(Math.floor(now.getTime() / 1000));
  timestampUnit.value = "seconds";
  dateInput.value = toDatetimeLocalValue(now);
  convertTimestamp();
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    setStatus(successMessage, "success");
    return true;
  } catch {
    setStatus("Could not copy automatically, but the value is visible on the page.", "warning");
    return false;
  }
}

function updateLiveTimestamp() {
  const now = new Date();
  const seconds = Math.floor(now.getTime() / 1000);
  liveTimestamp.textContent = String(seconds);
  liveTimestampMeta.textContent = `${utcFormatter.format(now)} UTC reference`;
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

convertTimestampButton.addEventListener("click", convertTimestamp);
useNowButton.addEventListener("click", useCurrentTime);
convertDateButton.addEventListener("click", convertDate);
setDateNowButton.addEventListener("click", setDateToNow);
timestampInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    convertTimestamp();
  }
});
timestampUnit.addEventListener("change", convertTimestamp);
dateMode.addEventListener("change", convertDate);
copyLiveButton.addEventListener("click", () => {
  copyText(liveTimestamp.textContent, `Copied ${liveTimestamp.textContent} to your clipboard.`);
});
copyIsoButton.addEventListener("click", () => {
  copyText(currentDate.toISOString(), `Copied ${currentDate.toISOString()} to your clipboard.`);
});

document.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy-value]");
  if (!copyButton) return;
  copyText(copyButton.dataset.copyValue, `Copied ${copyButton.dataset.copyValue} to your clipboard.`).then((copied) => {
    if (copied) {
      showCopiedFeedback(copyButton);
    }
  });
});

renderDurationRows();
useCurrentTime();
updateLiveTimestamp();
setInterval(updateLiveTimestamp, 1000);
