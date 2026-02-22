/**
 * YouTube transcript fetching — mirrors youtube_transcript_api logic.
 * Uses: watch page HTML → INNERTUBE_API_KEY → youtubei/v1/player → captionTracks → baseUrl XML.
 */

const WATCH_URL = "https://www.youtube.com/watch?v={video_id}";
const INNERTUBE_API_URL =
  "https://www.youtube.com/youtubei/v1/player?key={api_key}";
// Same as _settings.INNERTUBE_CONTEXT: {"client": {"clientName": "ANDROID", "clientVersion": "20.10.38"}}
const INNERTUBE_CONTEXT = {
  context: {
    client: { clientName: "ANDROID", clientVersion: "20.10.38" },
  },
};

/**
 * @param {string} videoId
 * @returns {Promise<string>}
 */
async function fetchVideoHtml(videoId) {
  const url = WATCH_URL.replace("{video_id}", videoId);
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Accept-Language": "en-US" },
  });
  if (!res.ok)
    throw new Error("Unable to load the video page. Please try again.");
  return res.text();
}

/**
 * @param {string} html
 * @returns {string}
 */
function extractInnertubeApiKey(html) {
  const match = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
  if (match) return match[1];
  if (html.includes('class="g-recaptcha"'))
    throw new Error("Access was temporarily limited. Please try again later.");
  throw new Error(
    "Could not read video data. Please refresh the page and try again.",
  );
}

/**
 * @param {string} videoId
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
async function fetchInnertubeData(videoId, apiKey) {
  const url = INNERTUBE_API_URL.replace("{api_key}", apiKey);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en-US",
    },
    body: JSON.stringify({
      ...INNERTUBE_CONTEXT,
      videoId,
    }),
  });
  if (!res.ok) throw new Error("Unable to load video data. Please try again.");
  return res.json();
}

/**
 * @param {object} data - innertube player response
 * @returns {object} captions.playerCaptionsTracklistRenderer
 */
function extractCaptionsJson(data) {
  try {
    const status = data?.playabilityStatus?.status;
    const reason = String(data?.playabilityStatus?.reason ?? "");
    if (status && status !== "OK") {
      if (
        status === "LOGIN_REQUIRED" &&
        reason.includes("confirm you're not a bot")
      ) {
        throw new Error(
          "YouTube is asking to verify you're not a bot. Try refreshing the page or signing in.",
        );
      }
      if (reason.includes("inappropriate")) {
        throw new Error(
          "This video is age-restricted. Captions aren't available for this video.",
        );
      }
      if (reason.includes("unavailable")) {
        throw new Error("This video is unavailable.");
      }
      throw new Error(
        "This video can't be played. It may be private or restricted in your region.",
      );
    }

    const captions = data?.captions?.playerCaptionsTracklistRenderer;
    if (!captions?.captionTracks?.length) {
      throw new Error("This video doesn't have captions available.");
    }
    return captions;
  } catch (e) {
    const isOurError =
      e instanceof Error &&
      /^(YouTube |This video |Access |Could not |Unable to |No captions)/.test(
        e.message,
      );
    if (isOurError) throw e;
    throw new Error(
      "Could not read video data. Please refresh the page and try again.",
    );
  }
}

/**
 * @param {string} xmlText - transcript XML (e.g. <transcript><text start="0" dur="1.5">...</text></transcript>
 * @returns {{ text: string, start: number, duration: number }[]}
 */
function parseTranscriptXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const snippets = [];
  const textNodes = doc.querySelectorAll("text");
  for (const el of textNodes) {
    const start = parseFloat(el.getAttribute("start") || "0");
    const duration = parseFloat(el.getAttribute("dur") || "0");
    const raw = (el.textContent || "").trim();
    const text = stripHtmlTags(raw);
    if (text) snippets.push({ text, start, duration });
  }
  return snippets;
}

function stripHtmlTags(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

/**
 * @param {string} videoId
 * @returns {Promise<{ languageCode: string, name: string, baseUrl: string, isGenerated: boolean }[]>}
 */
async function fetchTranscriptList(videoId) {
  const html = await fetchVideoHtml(videoId);
  const apiKey = extractInnertubeApiKey(html);
  const data = await fetchInnertubeData(videoId, apiKey);
  const captions = extractCaptionsJson(data);
  const tracks = [];
  for (const c of captions.captionTracks) {
    tracks.push({
      languageCode: c.languageCode,
      name: c.name?.runs?.[0]?.text || c.languageCode,
      baseUrl: (c.baseUrl || "").replace("&fmt=srv3", ""),
      isGenerated: (c.kind || "") === "asr",
    });
  }
  return tracks;
}

/**
 * Fetch full transcript for a video. Prefers first language in preferredLangs, then first available.
 * @param {string} videoId
 * @param {string[]} [preferredLangs=['en']]
 * @returns {Promise<{ snippets: { text: string, start: number, duration: number }[], languageCode: string, languageName: string }>}
 */
async function fetchTranscript(videoId, preferredLangs = ["en"]) {
  const list = await fetchTranscriptList(videoId);
  const manual = list.filter((t) => !t.isGenerated);
  const generated = list.filter((t) => t.isGenerated);

  let track = null;
  for (const code of preferredLangs) {
    track =
      manual.find((t) => t.languageCode === code) ||
      generated.find((t) => t.languageCode === code);
    if (track) break;
  }
  if (!track) track = list[0];
  if (!track)
    throw new Error(
      "No captions are available in your preferred languages for this video.",
    );

  const res = await fetch(track.baseUrl, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load captions. Please try again.");
  const xml = await res.text();
  const snippets = parseTranscriptXml(xml);

  return {
    snippets,
    languageCode: track.languageCode,
    languageName: track.name,
  };
}

// Expose for content script (same world)
if (typeof window !== "undefined") {
  window.YouTubeTranscriptApi = {
    fetchTranscriptList,
    fetchTranscript,
    parseTranscriptXml,
  };
}
