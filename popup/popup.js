const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const copyBtn = document.getElementById("copyBtn");
const goToCurrentBtn = document.getElementById("goToCurrentBtn");

let currentTabId = null;

// Friendly hints for each error type (match by substring of error message)
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
    "Refresh the YouTube page and open this popup again, or try signing in.",
  ],
  ["temporarily limited", "Wait a few minutes and try again."],
  ["Could not read video data", "Refresh the YouTube page and try again."],
  ["Unable to load", "Check your connection and try again."],
  ["Could not load captions", "Refresh the page and try again."],
  [
    "No captions are available",
    "This video may only have captions in other languages.",
  ],
];

function getHintForError(errorMessage) {
  if (!errorMessage) return "";
  const msg = errorMessage.toLowerCase();
  for (const [key, hint] of ERROR_HINTS) {
    if (msg.includes(key.toLowerCase())) return hint;
  }
  return "Please refresh the page and try again.";
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.className = "status" + (isError ? " error" : "");
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function render(snippets, languageName, languageCode) {
  listEl.innerHTML = "";
  if (languageName || languageCode) {
    const cap = document.createElement("div");
    cap.className = "transcript-lang";
    cap.textContent =
      `${languageName || ""} (${languageCode || ""})`
        .replace(/^\s*\(\s*\)\s*$/, "")
        .trim() || "Transcript";
    listEl.appendChild(cap);
  }
  const ul = document.createElement("div");
  ul.className = "transcript-snippets";
  for (const s of snippets) {
    const row = document.createElement("div");
    row.className = "transcript-snippet";
    row.dataset.start = String(s.start);
    row.dataset.duration = String(s.duration ?? 0);
    row.innerHTML = `<span class="ts-time">${formatTime(s.start)}</span><span class="ts-text">${escapeHtml(s.text)}</span>`;
    ul.appendChild(row);
  }
  listEl.appendChild(ul);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function highlightSnippet(currentTime) {
  const rows = listEl.querySelectorAll(".transcript-snippet");
  rows.forEach((row) => {
    const start = parseFloat(row.dataset.start) || 0;
    const duration = parseFloat(row.dataset.duration) || 0;
    const end = start + duration;
    const next = row.nextElementSibling;
    const endTime = next ? parseFloat(next.dataset.start) : end;
    const active = currentTime >= start && currentTime < endTime;
    row.classList.toggle("active", active);
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "timeupdate" && sender.tab?.id === currentTabId) {
    highlightSnippet(msg.time);
  }
});

goToCurrentBtn.addEventListener("click", () => {
  const activeRow = listEl.querySelector(".transcript-snippet.active");
  if (activeRow) {
    activeRow.scrollIntoView({ block: "center", behavior: "smooth" });
  }
});

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("youtube.com/watch")) {
    setStatus("Open a YouTube video page.");
    listEl.innerHTML = "";
    copyBtn.disabled = true;
    return;
  }

  setStatus("Loading…");
  listEl.innerHTML = "";
  copyBtn.disabled = true;

  try {
    const res = await chrome.tabs.sendMessage(tab.id, {
      action: "getTranscript",
    });
    if (res.error) {
      setStatus(res.error, true);
      copyBtn.disabled = true;
      const hint = getHintForError(res.error);
      listEl.innerHTML = hint ? `<p class="transcript-hint">${hint}</p>` : "";
      return;
    }
    const { transcript } = res;
    if (!transcript?.snippets?.length) {
      setStatus("No transcript available.");
      copyBtn.disabled = true;
      return;
    }
    setStatus(
      `${transcript.languageName || ""} (${transcript.languageCode || ""})`.trim() ||
        "Transcript",
    );
    currentTabId = tab.id;
    render(
      transcript.snippets,
      transcript.languageName,
      transcript.languageCode,
    );
    copyBtn.disabled = false;
  } catch (e) {
    setStatus("Open a YouTube video page, then open this popup again.", true);
    copyBtn.disabled = true;
  }
}

copyBtn.addEventListener("click", async () => {
  try {
    const nodes = listEl.querySelectorAll(".ts-text");
    const text = Array.from(nodes)
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean)
      .join("\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied!";
    copyBtn.disabled = true;
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.disabled = false;
    }, 2000);
  } catch (_) {
    copyBtn.textContent = "Copy failed";
    setTimeout(() => {
      copyBtn.textContent = "Copy";
    }, 2000);
  }
});

load();
