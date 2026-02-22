# YouTube Transcript — Chrome Extension

A Chrome extension (Manifest V3) that fetches and displays the transcript for the current YouTube video. On YouTube watch pages it auto-injects a floating “Transcript” toggle that opens a side panel to read, copy, and follow along with playback.

## Features

- **In-page floating button** — A “Transcript” pill shows up on YouTube watch pages; click to open/close the transcript panel.
- **Side panel transcript** — Read captions inline; click timestamps or rows to seek.
- **Playback highlight** — Active line stays highlighted as the video plays (auto-updates).
- **Copy** — Copy the entire transcript from the panel.
- **Go to current** — Jump the list to the currently highlighted line.

## Project structure

```
youtube-transcript-extension/
├── manifest.json        # Extension manifest (Manifest V3)
├── background.js        # Service worker
├── content.js           # Injected into YouTube; fetches transcript, injects UI, sends playback time
├── transcript-api.js    # Transcript fetching logic (injected with content.js)
├── content.css          # Styles for injected panel/button
├── popup/
│   ├── popup.html       # Popup now just explains in-page usage
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
4. Open a YouTube video page (`youtube.com/watch?v=...`). A floating “Transcript” button will appear; click it to view the side panel.

## Development notes

- **Manifest V3** — Uses a service worker in `background.js`; `permissions` and `host_permissions` are set for `activeTab`, `scripting`, and `*://www.youtube.com/*`.
- **Content script** — Runs on `*://www.youtube.com/*`. Uses `transcript-api.js` to fetch transcripts, injects the floating toggle + side panel, caches per video, and sends `timeupdate` messages for highlight sync.
- **Popup** — Simplified; just instructs users to use the in-page panel.

## References

- [Chrome Extension docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
