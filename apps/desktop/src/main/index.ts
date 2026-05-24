import { app, ipcMain, shell } from "electron";
import type { AppSettings, AppStatus, TrackInfo } from "@ytpresence/shared";
import { SettingsStore } from "./settingsStore";
import { Logger } from "./logger";
import { TrackState } from "./trackState";
import { LocalBridgeServer } from "./localBridgeServer";
import { DiscordPresenceService } from "./discordPresence";
import { SettingsWindow } from "./settingsWindow";
import { AppTray } from "./tray";

let settingsStore: SettingsStore;
let logger: Logger;
let trackState: TrackState;
let bridge: LocalBridgeServer;
let discordPresence: DiscordPresenceService;
let settingsWindow: SettingsWindow;
let tray: AppTray;
let isQuitting = false;

const STARTUP_HIDDEN_ARG = "--hidden";
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  if (argv.includes(STARTUP_HIDDEN_ARG)) {
    return;
  }
  settingsWindow?.open();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Keep the background tray process alive when the settings window is closed.
});

void app.whenReady().then(async () => {
  logger = new Logger();
  settingsStore = new SettingsStore(app.getPath("userData"));
  const settings = await settingsStore.load();
  applyWindowsStartup(settings);

  trackState = new TrackState(settings.clearAfterSeconds);
  bridge = new LocalBridgeServer(settings, logger);
  discordPresence = new DiscordPresenceService(settings, logger);
  settingsWindow = new SettingsWindow();
  tray = new AppTray({
    openSettings: () => settingsWindow.open(),
    togglePresence: () => void updateSettings({ presenceEnabled: !settingsStore.get().presenceEnabled }),
    reconnectDiscord: () => void discordPresence.reconnect(),
    quit: () => {
      isQuitting = true;
      app.quit();
    }
  });

  wireEvents();
  registerIpc();
  await bridge.start();
  await discordPresence.start();
  refreshStatus();
});

app.on("activate", () => {
  settingsWindow?.open();
});

app.on("will-quit", () => {
  if (!isQuitting) {
    return;
  }
  tray?.destroy();
  void bridge?.stop();
  void discordPresence?.stop();
});

function wireEvents(): void {
  settingsStore.on("updated", (settings: AppSettings) => {
    applyWindowsStartup(settings);
    trackState.setClearAfterSeconds(settings.clearAfterSeconds);
    discordPresence.updateSettings(settings);
    void bridge.restart(settings);
    refreshStatus();
  });

  bridge.on("track", (track: TrackInfo) => {
    if (track.playbackState === "stopped") {
      trackState.clear("stopped");
      return;
    }
    trackState.update(track);
  });
  bridge.on("status", refreshStatus);

  trackState.on("updated", (track: TrackInfo) => {
    discordPresence.setTrack(track);
    refreshStatus();
  });
  trackState.on("cleared", () => {
    discordPresence.setTrack(undefined);
    refreshStatus();
  });

  discordPresence.on("status", refreshStatus);
}

function registerIpc(): void {
  ipcMain.handle("settings:get", () => settingsStore.get());
  ipcMain.handle("settings:update", async (_event, patch: Partial<AppSettings>) => updateSettings(patch));
  ipcMain.handle("settings:reset", async () => {
    const settings = await settingsStore.reset();
    return settings;
  });
  ipcMain.handle("status:get", () => getStatus());
  ipcMain.handle("discord:reconnect", async () => {
    await discordPresence.reconnect();
    return getStatus();
  });
  ipcMain.handle("external:open", async (_event, url: string) => {
    if (url.startsWith("https://")) {
      await shell.openExternal(url);
    }
  });
}

async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return settingsStore.update(patch);
}

function applyWindowsStartup(settings: AppSettings): void {
  if (!app.isPackaged) {
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: settings.startWithWindows,
    path: process.execPath,
    args: [STARTUP_HIDDEN_ARG]
  });
}

function refreshStatus(): void {
  if (!tray || !settingsStore || !bridge || !discordPresence) {
    return;
  }

  const status = getStatus();
  tray.update(status);
  settingsWindow?.broadcast("status:update", status);
}

function getStatus(): AppStatus {
  return {
    settings: settingsStore.get(),
    bridge: bridge.getStatus(),
    discord: discordPresence.getStatus(),
    track: trackState.get()
  };
}
