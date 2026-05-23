import type { TrackInfo } from "@ytpresence/shared";

type MediaSessionMetadataLike = {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: Array<{ src?: string; sizes?: string; type?: string }>;
};

const POLL_INTERVAL_MS = 2500;
const MUTATION_DEBOUNCE_MS = 500;

let lastSignature = "";
let publishTimer: ReturnType<typeof setTimeout> | undefined;
let observedMedia: HTMLMediaElement | undefined;

start();

function start(): void {
  attachMediaListeners();
  observeDom();
  schedulePublish();

  setInterval(() => {
    attachMediaListeners();
    publishIfChanged();
  }, POLL_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => schedulePublish());
  window.addEventListener("yt-navigate-finish", () => schedulePublish());
  window.addEventListener("popstate", () => schedulePublish());
}

function observeDom(): void {
  const observer = new MutationObserver(() => schedulePublish());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "src", "href"]
  });
}

function attachMediaListeners(): void {
  const media = document.querySelector<HTMLMediaElement>("video, audio");
  if (!media || media === observedMedia) {
    return;
  }

  observedMedia = media;
  for (const eventName of ["play", "playing", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata", "seeked"]) {
    media.addEventListener(eventName, () => schedulePublish(), { passive: true });
  }
}

function schedulePublish(): void {
  if (publishTimer !== undefined) {
    clearTimeout(publishTimer);
  }

  publishTimer = setTimeout(() => publishIfChanged(), MUTATION_DEBOUNCE_MS);
}

function publishIfChanged(): void {
  const track = collectTrackInfo();
  const signature = trackSignature(track);
  if (signature === lastSignature) {
    return;
  }

  lastSignature = signature;
  void sendToBackground(track);
}

function collectTrackInfo(): TrackInfo {
  const media = observedMedia ?? document.querySelector<HTMLMediaElement>("video, audio") ?? undefined;
  const mediaSession = readMediaSession();
  const playerBar = document.querySelector("ytmusic-player-bar");

  const title = firstNonEmpty(
    mediaSession?.title,
    queryText(playerBar, ".title"),
    queryText(playerBar, "yt-formatted-string.title"),
    document.title.replace(/ - YouTube Music$/i, "")
  );

  const subtitle = firstNonEmpty(
    queryText(playerBar, ".subtitle"),
    queryText(playerBar, "yt-formatted-string.subtitle"),
    queryText(playerBar, ".byline")
  );
  const parsedSubtitle = parseSubtitle(subtitle);
  const artist = firstNonEmpty(mediaSession?.artist, parsedSubtitle.artist);
  const album = firstNonEmpty(mediaSession?.album, parsedSubtitle.album);
  const playbackState = detectPlaybackState(media);
  const url = findTrackUrl(playerBar);
  const thumbnailUrl = firstNonEmpty(largestArtwork(mediaSession), findThumbnail(playerBar));

  if (!title || playbackState === "stopped") {
    return {
      title: "YouTube Music",
      isPlaying: false,
      playbackState: "stopped",
      source: "youtube-music",
      updatedAt: Date.now()
    };
  }

  const track: TrackInfo = {
    title,
    isPlaying: playbackState === "playing",
    playbackState,
    source: "youtube-music",
    updatedAt: Date.now()
  };

  if (artist) {
    track.artist = artist;
  }
  if (album) {
    track.album = album;
  }
  if (media && Number.isFinite(media.duration) && media.duration > 0) {
    track.duration = media.duration;
  }
  if (media && Number.isFinite(media.currentTime) && media.currentTime >= 0) {
    track.currentTime = media.currentTime;
  }
  if (url) {
    track.url = url;
  }
  if (thumbnailUrl) {
    track.thumbnailUrl = thumbnailUrl;
  }

  return track;
}

function readMediaSession(): MediaSessionMetadataLike | undefined {
  const mediaSession = navigator.mediaSession as MediaSession & { metadata?: MediaSessionMetadataLike };
  return mediaSession.metadata;
}

function detectPlaybackState(media: HTMLMediaElement | undefined): TrackInfo["playbackState"] {
  if (media) {
    if (media.ended || media.readyState === HTMLMediaElement.HAVE_NOTHING) {
      return "stopped";
    }
    return media.paused ? "paused" : "playing";
  }

  const playButtonText = firstNonEmpty(
    queryAttribute(document, "ytmusic-player-bar #play-pause-button", "title"),
    queryAttribute(document, "ytmusic-player-bar #play-pause-button", "aria-label"),
    queryAttribute(document, "tp-yt-paper-icon-button.play-pause-button", "title"),
    queryAttribute(document, "tp-yt-paper-icon-button.play-pause-button", "aria-label")
  )?.toLowerCase();

  if (playButtonText?.includes("pause")) {
    return "playing";
  }
  if (playButtonText?.includes("play")) {
    return "paused";
  }

  return "stopped";
}

function findTrackUrl(root: ParentNode | null): string | undefined {
  const anchor = root?.querySelector<HTMLAnchorElement>('a[href*="watch"], a[href*="playlist"]');
  const href = anchor?.href || (location.pathname.startsWith("/watch") ? location.href : undefined);
  if (!href) {
    return undefined;
  }

  try {
    const url = new URL(href, "https://music.youtube.com");
    url.searchParams.delete("list");
    url.searchParams.delete("index");
    return url.href;
  } catch {
    return undefined;
  }
}

function findThumbnail(root: ParentNode | null): string | undefined {
  const image = root?.querySelector<HTMLImageElement>(
    "img.image, img.thumbnail, ytmusic-player-bar img, ytmusic-player img"
  );
  const src = image?.currentSrc || image?.src;
  if (!src) {
    return undefined;
  }

  try {
    return new URL(src, location.href).href;
  } catch {
    return undefined;
  }
}

function largestArtwork(metadata: MediaSessionMetadataLike | undefined): string | undefined {
  const artwork = metadata?.artwork;
  if (!artwork?.length) {
    return undefined;
  }

  return artwork
    .slice()
    .sort((a, b) => artworkSize(b.sizes) - artworkSize(a.sizes))
    .find((item) => item.src)?.src;
}

function artworkSize(sizes: string | undefined): number {
  const match = sizes?.match(/(\d+)x(\d+)/);
  return match ? Number(match[1]) * Number(match[2]) : 0;
}

function parseSubtitle(value: string | undefined): { artist?: string; album?: string } {
  if (!value) {
    return {};
  }

  const parts = value
    .split(/[•·]/)
    .map((part) => normalizeText(part))
    .filter(Boolean);

  const result: { artist?: string; album?: string } = {};
  if (parts[0]) {
    result.artist = parts[0];
  }
  if (parts[1]) {
    result.album = parts[1];
  }
  return result;
}

function queryText(root: ParentNode | null, selector: string): string | undefined {
  const element = root?.querySelector(selector);
  return normalizeText(element?.textContent);
}

function queryAttribute(root: ParentNode, selector: string, attribute: string): string | undefined {
  return normalizeText(root.querySelector(selector)?.getAttribute(attribute));
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => normalizeText(value)).find(Boolean);
}

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function trackSignature(track: TrackInfo): string {
  return JSON.stringify({
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration ? Math.round(track.duration) : undefined,
    currentTime: track.currentTime ? Math.floor(track.currentTime / 5) : undefined,
    isPlaying: track.isPlaying,
    playbackState: track.playbackState,
    url: track.url,
    thumbnailUrl: track.thumbnailUrl
  });
}

async function sendToBackground(track: TrackInfo): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "track:update", payload: track });
  } catch {
    lastSignature = "";
  }
}
