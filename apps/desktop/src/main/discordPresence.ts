import { EventEmitter } from "node:events";
import { Client, type SetActivity } from "@xhayper/discord-rpc";
import { ActivityType } from "discord-api-types/v10";
import type { AppSettings, TrackInfo } from "@ytpresence/shared";
import type { Logger } from "./logger";

const YOUTUBE_MUSIC_URL = "https://music.youtube.com/";
const YOUTUBE_MUSIC_ICON_URL = "https://music.youtube.com/img/favicon_144.png";

export class DiscordPresenceService extends EventEmitter {
  private client: Client | undefined;
  private settings: AppSettings;
  private latestTrack: TrackInfo | undefined;
  private connected = false;
  private reconnecting = false;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private updateTimer: NodeJS.Timeout | undefined;
  private reconnectAttempt = 0;
  private lastActivitySignature = "";
  private lastError: string | undefined;
  private stopping = false;

  public constructor(settings: AppSettings, private readonly logger: Logger) {
    super();
    this.settings = settings;
  }

  public getStatus() {
    return {
      connected: this.connected,
      reconnecting: this.reconnecting,
      clientIdConfigured: !!this.settings.discordClientId,
      lastError: this.lastError
    };
  }

  public async start(): Promise<void> {
    this.stopping = false;
    if (!this.settings.discordClientId) {
      this.lastError = "Discord Client ID is not configured.";
      this.emit("status");
      return;
    }

    await this.connect();
  }

  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = undefined;
    }

    await this.destroyClient();
  }

  public async reconnect(): Promise<void> {
    this.logger.info("Manual Discord reconnect requested");
    this.reconnectAttempt = 0;
    await this.destroyClient();
    await this.connect();
  }

  public updateSettings(settings: AppSettings): void {
    const clientIdChanged = settings.discordClientId !== this.settings.discordClientId;
    this.settings = settings;
    this.emit("status");

    if (clientIdChanged) {
      void this.reconnect();
      return;
    }

    this.schedulePresenceUpdate();
  }

  public setTrack(track: TrackInfo | undefined): void {
    this.latestTrack = track;
    this.schedulePresenceUpdate();
  }

  public async clearActivity(): Promise<void> {
    this.lastActivitySignature = "";
    if (!this.connected || !this.client?.user) {
      return;
    }

    try {
      await this.client.user.clearActivity(process.pid);
    } catch (error) {
      this.captureError("Failed to clear Discord activity", error);
    }
  }

  private async connect(): Promise<void> {
    if (this.connected || this.reconnecting || this.stopping) {
      return;
    }

    if (!this.settings.discordClientId) {
      this.connected = false;
      this.reconnecting = false;
      this.lastError = "Discord Client ID is not configured.";
      this.emit("status");
      return;
    }

    this.reconnecting = true;
    this.emit("status");

    try {
      const client = new Client({ clientId: this.settings.discordClientId });
      this.client = client;
      client.on("debug", (...data: unknown[]) => this.logger.debug("Discord RPC debug", data));
      client.on("disconnected", () => {
        this.connected = false;
        this.reconnecting = false;
        this.lastError = "Discord RPC disconnected.";
        this.emit("status");
        this.scheduleReconnect();
      });

      await client.login();
      this.connected = true;
      this.reconnecting = false;
      this.lastError = undefined;
      this.reconnectAttempt = 0;
      this.logger.info("Discord RPC connected");
      this.emit("status");
      this.schedulePresenceUpdate();
    } catch (error) {
      await this.destroyClient();
      this.connected = false;
      this.reconnecting = false;
      this.captureError("Discord RPC connection failed", error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping || !this.settings.discordClientId) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(60_000, 2_000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnecting = true;
    this.emit("status");
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
    this.reconnectTimer.unref();
  }

  private schedulePresenceUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(() => void this.applyPresence(), 700);
    this.updateTimer.unref();
  }

  private async applyPresence(): Promise<void> {
    if (!this.settings.presenceEnabled || !this.latestTrack || this.latestTrack.playbackState === "stopped") {
      await this.clearActivity();
      return;
    }

    if (this.latestTrack.playbackState === "paused" && !this.settings.showPausedStatus) {
      await this.clearActivity();
      return;
    }

    if (!this.connected || !this.client?.user) {
      await this.connect();
      return;
    }

    const activity = buildActivity(this.latestTrack, this.settings);
    const signature = buildActivitySignature(this.latestTrack, this.settings, activity);
    if (signature === this.lastActivitySignature) {
      return;
    }

    try {
      await this.client.user.setActivity(activity, process.pid);
      this.lastActivitySignature = signature;
      this.lastError = undefined;
      this.emit("status");
    } catch (error) {
      this.captureError("Failed to update Discord activity", error);
      this.scheduleReconnect();
    }
  }

  private async destroyClient(): Promise<void> {
    this.connected = false;
    this.lastActivitySignature = "";
    if (!this.client) {
      this.emit("status");
      return;
    }

    const client = this.client;
    this.client = undefined;
    try {
      await client.destroy();
    } catch (error) {
      this.logger.warn("Discord RPC destroy failed", { error: getErrorMessage(error) });
    }
    this.emit("status");
  }

  private captureError(message: string, error: unknown): void {
    this.lastError = getErrorMessage(error);
    this.logger.warn(message, { error: this.lastError });
    this.emit("status");
  }
}

function buildActivity(track: TrackInfo, settings: AppSettings): SetActivity {
  const isPaused = track.playbackState === "paused";
  const activity: SetActivity = {
    name: "YouTube Music",
    type: ActivityType.Listening,
    details: trimActivityText(track.title) || "YouTube Music",
    smallImageKey: YOUTUBE_MUSIC_ICON_URL,
    smallImageText: isPaused ? "Paused" : "YouTube Music",
    statusDisplayType: 0
  };

  const state = trimActivityText(isPaused ? pausedState(track.artist) : track.artist || "YouTube Music");
  if (state) {
    activity.state = state;
  }

  const largeImageText = trimActivityText(track.album || "YouTube Music");
  if (largeImageText) {
    activity.largeImageText = largeImageText;
  }

  if (settings.showAlbumArt && track.thumbnailUrl) {
    activity.largeImageKey = track.thumbnailUrl;
    if (track.url) {
      activity.largeImageUrl = track.url;
    }
  } else {
    activity.largeImageKey = YOUTUBE_MUSIC_ICON_URL;
  }

  if (settings.showElapsedTime && track.isPlaying && typeof track.currentTime === "number") {
    const startMs = Date.now() - track.currentTime * 1000;
    activity.startTimestamp = new Date(startMs);
    if (typeof track.duration === "number" && track.duration > track.currentTime) {
      activity.endTimestamp = new Date(startMs + track.duration * 1000);
    }
  }

  if (settings.showButtons) {
    const buttons = [
      { label: "Open YouTube Music", url: YOUTUBE_MUSIC_URL },
      ...(track.url ? [{ label: "Listen on YouTube Music", url: track.url }] : [])
    ].slice(0, 2) as NonNullable<SetActivity["buttons"]>;
    activity.buttons = buttons;
  }

  return activity;
}

function buildActivitySignature(track: TrackInfo, settings: AppSettings, activity: SetActivity): string {
  const currentTimeBucket =
    settings.showElapsedTime && track.isPlaying && typeof track.currentTime === "number"
      ? Math.floor(track.currentTime / 10)
      : undefined;

  return JSON.stringify({
    activity,
    playbackState: track.playbackState,
    currentTimeBucket
  });
}

function pausedState(artist: string | undefined): string {
  return artist ? `Paused · ${artist}` : "Paused";
}

function trimActivityText(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 128);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
