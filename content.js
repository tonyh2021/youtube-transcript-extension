// Content script — injected into YouTube pages (after transcript-api.js)
// Fetches and caches transcript; popup requests it via getTranscript message.

const API = window.YouTubeTranscriptApi;

function getVideoId() {
  const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(
    window.location.href,
  );
  return m ? m[1] : null;
}

let currentVideoId = null;
let currentTranscript = null;

const PREFERRED_LANGS = ["en", "zh", "zh-Hans", "zh-Hant"];

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
    }
    if (getVideoId()) fetchAndStoreTranscript();
  }
}
setInterval(checkUrlChange, 800);

if (getVideoId()) fetchAndStoreTranscript();

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
      chrome.runtime.sendMessage({ action: "timeupdate", time: video.currentTime });
    } catch (_) {}
  };
  video.addEventListener("timeupdate", send);
  send();
}
if (getVideoId()) startTimeUpdates();
setInterval(() => {
  if (getVideoId()) startTimeUpdates();
}, 1500);
