import type { TrackInfo } from "@ytpresence/shared";

interface ExtensionStatus {
  connected: boolean;
  lastError: string | undefined;
  lastUpdateAt: number | undefined;
  currentTrack: TrackInfo | undefined;
}

const statusEl = document.querySelector<HTMLSpanElement>("#status");
const trackEl = document.querySelector<HTMLParagraphElement>("#track");
const metaEl = document.querySelector<HTMLParagraphElement>("#meta");
const updatedEl = document.querySelector<HTMLParagraphElement>("#updated");

void render();

async function render(): Promise<void> {
  const status = await chrome.runtime.sendMessage({ type: "status:get" }) as ExtensionStatus;
  if (!statusEl || !trackEl || !metaEl || !updatedEl) {
    return;
  }

  statusEl.textContent = status.connected ? "Connected" : "Waiting";
  statusEl.classList.toggle("connected", status.connected);
  trackEl.textContent = trackTitle(status.currentTrack);
  metaEl.textContent = trackMeta(status.currentTrack, status.lastError);
  updatedEl.textContent = status.lastUpdateAt ? new Date(status.lastUpdateAt).toLocaleTimeString() : "Never";
}

function trackTitle(track: TrackInfo | undefined): string {
  if (!track || track.playbackState === "stopped") {
    return "No track detected";
  }

  return track.title;
}

function trackMeta(track: TrackInfo | undefined, error: string | undefined): string {
  if (error) {
    return error;
  }
  if (!track || track.playbackState === "stopped") {
    return "Open YouTube Music in this browser.";
  }

  return [track.artist, track.album, track.playbackState].filter(Boolean).join(" - ");
}
