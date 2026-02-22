# YouTube Transcript — Chrome Extension

A Chrome extension (Manifest V3) that fetches and displays the transcript for the current YouTube video. Open the popup on a YouTube watch page to view the transcript, copy it, and follow along with playback.

## Features

- **Transcript in popup** — Shows the transcript for the current video when you click the extension icon on a YouTube watch page.
- **Playback highlight** — The line matching the current video time is highlighted automatically (updates as the video plays).
- **Copy** — Copy the full transcript text to the clipboard.
- **Go to current** — Scroll the transcript list so the currently highlighted line is centered in view.

## Project structure

```
youtube-transcript-extension/
├── manifest.json        # Extension manifest (Manifest V3)
├── background.js        # Service worker
├── content.js           # Injected into YouTube; fetches transcript, sends playback time
├── transcript-api.js    # Transcript fetching logic (injected with content.js)
├── content.css          # Styles injected into YouTube (if any)
├── popup/
│   ├── popup.html       # Popup UI
│   ├── popup.js         # Popup logic (render, highlight, copy, go-to-current)
│   └── popup.css
├── icons/
│   ├── icon48.png
│   └── icon128.png
├── package.json
└── README.md
```

## Install and run

1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `youtube-transcript-extension` folder.
4. Open a YouTube video page (`youtube.com/watch?v=...`) and click the extension icon to open the transcript popup.

## Development notes

- **Manifest V3** — Uses a service worker in `background.js`; `permissions` and `host_permissions` are set for `activeTab`, `scripting`, and `*://www.youtube.com/*`.
- **Content script** — Runs on `*://www.youtube.com/*` after load. It uses `transcript-api.js` to fetch the transcript, caches it per video, and sends `timeupdate` messages with the video’s `currentTime` so the popup can highlight the matching line.
- **Popup** — Requests the transcript via `getTranscript` and subscribes to `timeupdate` for highlighting. No automatic scrolling; use **Go to current** to scroll to the active line.

## References

- [Chrome Extension docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
