// Content script — injected into YouTube pages (after transcript-api.js)
// Fetches and caches transcript; popup requests it via getTranscript message.

const API = window.YouTubeTranscriptApi;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getVideoId() {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(
    window.location.href,
  );
  return m ? m[1] : null;
}

let currentVideoId = null;
let currentTranscript = null;
let panelEl = null;
let panelBodyEl = null;
let panelLangEl = null;
let toggleBtn = null;
let loadingEl = null;
let errorEl = null;
let goToCurrentBtn = null;
let copyBtnEl = null;
let footerEl = null;

const PREFERRED_LANGS = ["en", "zh", "zh-Hans", "zh-Hant"];
const ERROR_HINTS = [
  [
    "doesn't have captions",
    "The uploader may not have added or enabled captions for this video.",
  ],
  [
    "age-restricted",
    "Sign in or check if the video is available in your region.",
  ],
  ["unavailable", "The video may have been removed or made private."],
  ["can't be played", "The video may be private or restricted in your region."],
  [
    "verify you're not a bot",
    "Refresh the YouTube page and open the transcript again, or try signing in.",
  ],
  ["temporarily limited", "Wait a few minutes and try again."],
  ["Could not read video data", "Refresh the YouTube page and try again."],
  ["Unable to load", "Check your connection and try again."],
  ["Could not load captions", "Refresh the page and try again."],
  ["No captions are available", "This video may only have other languages."],
];

function getHintForError(errorMessage) {
  if (!errorMessage) return "";
  const msg = errorMessage.toLowerCase();
  for (const [key, hint] of ERROR_HINTS) {
    if (msg.includes(key.toLowerCase())) return hint;
  }
  return "Please refresh the page and try again.";
}

async function fetchAndStoreTranscript() {
  const videoId = getVideoId();
  if (!videoId) {
    currentVideoId = null;
    currentTranscript = null;
    return null;
  }
  if (currentVideoId === videoId && currentTranscript) return currentTranscript;
  try {
    const result = await API.fetchTranscript(videoId, PREFERRED_LANGS);
    currentVideoId = videoId;
    currentTranscript = result;
    return result;
  } catch (e) {
    currentTranscript = null;
    throw e;
  }
}

let lastUrl = location.href;
function checkUrlChange() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (getVideoId() !== currentVideoId) {
      currentVideoId = null;
      currentTranscript = null;
      teardownUi();
    }
    if (getVideoId()) fetchAndStoreTranscript();
    if (getVideoId()) ensureUi();
  }
}
setInterval(checkUrlChange, 800);

if (getVideoId()) {
  fetchAndStoreTranscript();
  ensureUi();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "getTranscript") {
    (async () => {
      try {
        const videoId = getVideoId();
        if (!videoId) {
          sendResponse({ error: "not_watch_page" });
          return;
        }
        const transcript = await fetchAndStoreTranscript();
        sendResponse({ transcript });
      } catch (e) {
        sendResponse({ error: e?.message || "Failed to load transcript." });
      }
    })();
    return true;
  }
  return false;
});

// Send current playback time so popup can highlight the matching transcript line
function startTimeUpdates() {
  const video = document.querySelector("video");
  if (!video || !getVideoId() || video.dataset.ytTimeSent === "1") return;
  video.dataset.ytTimeSent = "1";
  const send = () => {
    try {
      chrome.runtime.sendMessage({
        action: "timeupdate",
        time: video.currentTime,
      });
    } catch (_) {}
    highlightSnippet(video.currentTime);
  };
  video.addEventListener("timeupdate", send);
  send();
}
if (getVideoId()) startTimeUpdates();
setInterval(() => {
  if (getVideoId()) startTimeUpdates();
}, 1500);

// ----- In-page floating toggle + transcript panel -----

function ensureUi() {
  if (toggleBtn && panelEl) return;

  // Floating toggle button
  toggleBtn = document.createElement("button");
  toggleBtn.id = "yt-transcript-toggle";
  toggleBtn.textContent = "Transcript";
  toggleBtn.title = "Show transcript";
  toggleBtn.addEventListener("click", () => {
    panelEl.classList.toggle("visible");
    if (panelEl.classList.contains("visible")) {
      toggleBtn.textContent = "Hide transcript";
      renderPanel();
    } else {
      toggleBtn.textContent = "Transcript";
    }
  });
  document.body.appendChild(toggleBtn);

  // Panel shell
  panelEl = document.createElement("div");
  panelEl.id = "yt-transcript-panel";

  const header = document.createElement("div");
  header.className = "yt-transcript-header";

  const title = document.createElement("div");
  title.className = "yt-transcript-title";
  title.textContent = "Transcript";
  header.appendChild(title);

  panelLangEl = document.createElement("div");
  panelLangEl.className = "yt-transcript-lang";
  panelLangEl.textContent = "";
  header.appendChild(panelLangEl);

  const actions = document.createElement("div");
  actions.className = "yt-transcript-header-actions";

  const minimizeBtn = document.createElement("button");
  minimizeBtn.className = "yt-transcript-close";
  minimizeBtn.innerHTML = "&minus;";
  minimizeBtn.title = "Minimize";
  minimizeBtn.addEventListener("click", () => {
    panelEl.classList.remove("visible");
    toggleBtn.textContent = "Transcript";
  });
  actions.appendChild(minimizeBtn);

  header.appendChild(actions);
  panelEl.appendChild(header);

  panelBodyEl = document.createElement("div");
  panelBodyEl.className = "yt-transcript-body";

  loadingEl = document.createElement("div");
  loadingEl.className = "yt-transcript-loading";
  loadingEl.textContent = "Loading transcript…";

  errorEl = document.createElement("div");
  errorEl.className = "yt-transcript-error";

  panelBodyEl.appendChild(loadingEl);
  panelEl.appendChild(panelBodyEl);

  footerEl = document.createElement("div");
  footerEl.className = "yt-transcript-footer";

  copyBtnEl = document.createElement("button");
  copyBtnEl.className = "yt-transcript-action";
  copyBtnEl.textContent = "Copy";
  copyBtnEl.addEventListener("click", copyTranscriptText);
  footerEl.appendChild(copyBtnEl);

  goToCurrentBtn = document.createElement("button");
  goToCurrentBtn.className = "yt-transcript-action";
  goToCurrentBtn.textContent = "Go to current";
  goToCurrentBtn.addEventListener("click", scrollToCurrent);
  footerEl.appendChild(goToCurrentBtn);

  panelEl.appendChild(footerEl);

  document.body.appendChild(panelEl);
}

function teardownUi() {
  if (toggleBtn?.parentNode) toggleBtn.parentNode.removeChild(toggleBtn);
  if (panelEl?.parentNode) panelEl.parentNode.removeChild(panelEl);
  toggleBtn = null;
  panelEl = null;
  panelBodyEl = null;
  panelLangEl = null;
  loadingEl = null;
  errorEl = null;
  goToCurrentBtn = null;
  copyBtnEl = null;
  footerEl = null;
}

async function renderPanel() {
  if (!panelEl || !panelBodyEl) return;
  panelBodyEl.innerHTML = "";
  panelBodyEl.appendChild(loadingEl);
  loadingEl.textContent = "Loading transcript…";
  try {
    const transcript = await fetchAndStoreTranscript();
    currentTranscript = transcript;
    drawTranscript(transcript);
    setActionButtonsState(!transcript?.snippets?.length);
  } catch (e) {
    showError(e?.message || "Failed to load transcript.");
    setActionButtonsState(true);
  }
}

function drawTranscript(transcript) {
  if (!panelBodyEl) return;
  panelBodyEl.innerHTML = "";
  const { snippets = [], languageName, languageCode } = transcript || {};
  panelLangEl.textContent = languageName || languageCode || "";
  if (!snippets.length) {
    showError("No transcript available.");
    setActionButtonsState(true);
    return;
  }

  const list = document.createElement("div");
  list.className = "yt-transcript-snippets";

  for (const s of snippets) {
    const row = document.createElement("div");
    row.className = "yt-transcript-snippet";
    row.dataset.start = String(s.start);
    row.dataset.duration = String(s.duration ?? 0);

    const tsBtn = document.createElement("button");
    tsBtn.className = "yt-transcript-timestamp";
    tsBtn.textContent = formatTime(s.start);
    tsBtn.addEventListener("click", () => seekTo(s.start));

    const textEl = document.createElement("div");
    textEl.className = "yt-transcript-text";
    textEl.textContent = s.text;

    row.appendChild(tsBtn);
    row.appendChild(textEl);
    row.addEventListener("click", () => seekTo(s.start));
    list.appendChild(row);
  }

  panelBodyEl.appendChild(list);
  const video = document.querySelector("video");
  if (video) highlightSnippet(video.currentTime || 0);
  setActionButtonsState(false);
}

function showError(message) {
  if (!panelBodyEl || !errorEl) return;
  panelBodyEl.innerHTML = "";
  errorEl.textContent = message;
  panelBodyEl.appendChild(errorEl);
  const hint = getHintForError(message);
  if (hint) {
    const hintEl = document.createElement("div");
    hintEl.className = "yt-transcript-hint";
    hintEl.textContent = hint;
    panelBodyEl.appendChild(hintEl);
  }
}

function seekTo(seconds) {
  const video = document.querySelector("video");
  if (!video) return;
  video.currentTime = seconds;
  video.play();
}

async function copyTranscriptText() {
  if (!currentTranscript?.snippets?.length) return;
  const text = currentTranscript.snippets
    .map((s) => s.text?.trim())
    .filter(Boolean)
    .join("\n");
  try {
    await navigator.clipboard.writeText(text);
    if (copyBtnEl) {
      copyBtnEl.textContent = "Copied!";
      copyBtnEl.disabled = true;
      setTimeout(() => {
        if (!copyBtnEl) return;
        copyBtnEl.textContent = "Copy";
        copyBtnEl.disabled = false;
      }, 2000);
    }
  } catch (_) {}
}

function highlightSnippet(currentTime) {
  if (!panelBodyEl) return;
  const rows = panelBodyEl.querySelectorAll(".yt-transcript-snippet");
  rows.forEach((row) => {
    const start = parseFloat(row.dataset.start) || 0;
    const duration = parseFloat(row.dataset.duration) || 0;
    const next = row.nextElementSibling;
    const endTime = next ? parseFloat(next.dataset.start) : start + duration;
    const active = currentTime >= start && currentTime < endTime;
    row.classList.toggle("active", active);
  });
}

function setActionButtonsState(disabled) {
  if (copyBtnEl) copyBtnEl.disabled = disabled;
  if (goToCurrentBtn) goToCurrentBtn.disabled = disabled;
}

function scrollToCurrent() {
  if (!panelBodyEl) return;
  const activeRow = panelBodyEl.querySelector(".yt-transcript-snippet.active");
  if (activeRow) {
    activeRow.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}
