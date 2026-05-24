import { Menu, Tray, type MenuItemConstructorOptions } from "electron";
import { summarizeTrack, type AppStatus } from "@ytpresence/shared";
import { getTrayIcon } from "./appIcon";

interface TrayActions {
  openSettings: () => void;
  togglePresence: () => void;
  reconnectDiscord: () => void;
  quit: () => void;
}

export class AppTray {
  private readonly tray: Tray;
  private status: AppStatus | undefined;

  public constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(getTrayIcon());
    this.tray.setToolTip("YTPresence");
    this.tray.on("double-click", () => this.actions.openSettings());
  }

  public update(status: AppStatus): void {
    this.status = status;
    this.tray.setToolTip(`YTPresence - ${summarizeTrack(status.track)}`);
    this.tray.setContextMenu(Menu.buildFromTemplate(this.buildMenu(status)));
  }

  public destroy(): void {
    this.tray.destroy();
  }

  private buildMenu(status: AppStatus): MenuItemConstructorOptions[] {
    const discordLabel = status.discord.connected
      ? "Discord: connected"
      : status.discord.reconnecting
        ? "Discord: reconnecting"
        : "Discord: disconnected";

    return [
      { label: "Open settings", click: this.actions.openSettings },
      {
        label: "Enable presence",
        type: "checkbox",
        checked: status.settings.presenceEnabled,
        click: this.actions.togglePresence
      },
      { type: "separator" },
      {
        label: `Current: ${summarizeTrack(this.status?.track)}`,
        enabled: false
      },
      {
        label: discordLabel,
        enabled: false
      },
      {
        label: status.bridge.connected ? "Extension: connected" : "Extension: waiting",
        enabled: false
      },
      { type: "separator" },
      { label: "Reconnect Discord", click: this.actions.reconnectDiscord },
      { label: "Quit", click: this.actions.quit }
    ];
  }
}
