// Background service worker (Manifest V3)
chrome.runtime.onInstalled.addListener(() => {
  console.log("YouTube Transcript extension installed");
});
