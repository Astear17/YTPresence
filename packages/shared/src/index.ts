export type PlaybackState = "playing" | "paused" | "stopped";

export interface TrackInfo {
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  currentTime?: number;
  isPlaying: boolean;
  playbackState: PlaybackState;
  url?: string;
  thumbnailUrl?: string;
  source: "youtube-music";
  updatedAt: number;
}

export interface AppSettings {
  presenceEnabled: boolean;
  startWithWindows: boolean;
  showAlbumArt: boolean;
  showElapsedTime: boolean;
  showPausedStatus: boolean;
  showButtons: boolean;
  discordClientId: string;
  websocketPort: number;
  clearAfterSeconds: number;
}

export interface DesktopBridgeStatus {
  connected: boolean;
  lastError: string | undefined;
  lastMessageAt: number | undefined;
}

export interface DiscordStatus {
  connected: boolean;
  reconnecting: boolean;
  clientIdConfigured: boolean;
  lastError: string | undefined;
}

export interface AppStatus {
  settings: AppSettings;
  bridge: DesktopBridgeStatus & {
    port: number;
    clientCount: number;
    listening: boolean;
  };
  discord: DiscordStatus;
  track: TrackInfo | undefined;
}

export const DEFAULT_WEBSOCKET_PORT = 33879;

export const DEFAULT_SETTINGS: AppSettings = {
  presenceEnabled: true,
  startWithWindows: false,
  showAlbumArt: true,
  showElapsedTime: true,
  showPausedStatus: false,
  showButtons: true,
  discordClientId: "",
  websocketPort: DEFAULT_WEBSOCKET_PORT,
  clearAfterSeconds: 15
};

export function mergeSettings(input: Partial<AppSettings> | undefined): AppSettings {
  const candidate = input ?? {};
  return {
    presenceEnabled: coerceBoolean(candidate.presenceEnabled, DEFAULT_SETTINGS.presenceEnabled),
    startWithWindows: coerceBoolean(candidate.startWithWindows, DEFAULT_SETTINGS.startWithWindows),
    showAlbumArt: coerceBoolean(candidate.showAlbumArt, DEFAULT_SETTINGS.showAlbumArt),
    showElapsedTime: coerceBoolean(candidate.showElapsedTime, DEFAULT_SETTINGS.showElapsedTime),
    showPausedStatus: coerceBoolean(candidate.showPausedStatus, DEFAULT_SETTINGS.showPausedStatus),
    showButtons: coerceBoolean(candidate.showButtons, DEFAULT_SETTINGS.showButtons),
    discordClientId: sanitizeClientId(candidate.discordClientId),
    websocketPort: coercePort(candidate.websocketPort, DEFAULT_SETTINGS.websocketPort),
    clearAfterSeconds: coerceNumber(candidate.clearAfterSeconds, DEFAULT_SETTINGS.clearAfterSeconds, 5, 120)
  };
}

export function sanitizeClientId(value: unknown): string {
  return typeof value === "string" && /^\d{16,24}$/.test(value.trim()) ? value.trim() : "";
}

export function validateTrackInfo(value: unknown): TrackInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = sanitizeRequiredString(value.title, 160);
  const source = value.source;
  const updatedAt = coerceTimestamp(value.updatedAt);
  const playbackState = sanitizePlaybackState(value.playbackState);

  if (!title || source !== "youtube-music" || !updatedAt || !playbackState) {
    return null;
  }

  const isPlaying = typeof value.isPlaying === "boolean" ? value.isPlaying : playbackState === "playing";
  const duration = coerceOptionalNumber(value.duration, 0, 24 * 60 * 60);
  const currentTime = coerceOptionalNumber(value.currentTime, 0, 24 * 60 * 60);
  const url = sanitizeUrl(value.url, "https://music.youtube.com/");
  const thumbnailUrl = sanitizeUrl(value.thumbnailUrl, "https://");

  const result: TrackInfo = {
    title,
    isPlaying,
    playbackState,
    source,
    updatedAt
  };

  const artist = sanitizeRequiredString(value.artist, 160);
  const album = sanitizeRequiredString(value.album, 160);
  if (artist) {
    result.artist = artist;
  }
  if (album) {
    result.album = album;
  }
  if (duration !== undefined) {
    result.duration = duration;
  }
  if (currentTime !== undefined) {
    result.currentTime = currentTime;
  }
  if (url) {
    result.url = url;
  }
  if (thumbnailUrl) {
    result.thumbnailUrl = thumbnailUrl;
  }

  return result;
}

export function summarizeTrack(track: TrackInfo | undefined): string {
  if (!track || track.playbackState === "stopped") {
    return "No track detected";
  }

  return track.artist ? `${track.title} - ${track.artist}` : track.title;
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function coercePort(value: unknown, fallback: number): number {
  return coerceNumber(value, fallback, 1024, 65535);
}

function coerceNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function coerceOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(max, Math.max(min, value));
}

function coerceTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const now = Date.now();
  if (value < now - 60 * 60 * 1000 || value > now + 60 * 1000) {
    return undefined;
  }

  return Math.round(value);
}

function sanitizePlaybackState(value: unknown): PlaybackState | undefined {
  return value === "playing" || value === "paused" || value === "stopped" ? value : undefined;
}

function sanitizeRequiredString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function sanitizeUrl(value: unknown, requiredPrefix: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (!url.href.startsWith(requiredPrefix)) {
      return undefined;
    }

    return url.href.slice(0, 512);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
