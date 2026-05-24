import { BrowserWindow, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAppIconPath } from "./appIcon";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SettingsWindow {
  private window: BrowserWindow | undefined;

  public open(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return this.window;
    }

    this.window = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 620,
      show: false,
      title: "YTPresence Settings",
      icon: getAppIconPath(),
      webPreferences: {
        preload: join(__dirname, "../preload/index.mjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.window.on("closed", () => {
      this.window = undefined;
    });

    this.window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void this.window.loadFile(join(__dirname, "../renderer/index.html"));
    }

    this.window.once("ready-to-show", () => {
      this.window?.show();
    });

    return this.window;
  }

  public broadcast(channel: string, payload: unknown): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload);
    }
  }
}
