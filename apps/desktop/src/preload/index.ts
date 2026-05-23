import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, AppStatus } from "@ytpresence/shared";

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", patch) as Promise<AppSettings>,
  resetSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:reset") as Promise<AppSettings>,
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke("status:get") as Promise<AppStatus>,
  reconnectDiscord: (): Promise<AppStatus> => ipcRenderer.invoke("discord:reconnect") as Promise<AppStatus>,
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("external:open", url) as Promise<void>,
  onStatusUpdate: (callback: (status: AppStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AppStatus) => callback(status);
    ipcRenderer.on("status:update", listener);
    return () => ipcRenderer.removeListener("status:update", listener);
  }
};

contextBridge.exposeInMainWorld("ytpresence", api);

export type YTPresenceApi = typeof api;
