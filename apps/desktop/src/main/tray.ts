import { Menu, Tray, nativeImage, type MenuItemConstructorOptions } from "electron";
import { summarizeTrack, type AppStatus } from "@ytpresence/shared";

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
    this.tray = new Tray(createTrayImage());
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

function createTrayImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#111827"/>
      <path d="M9 8.5v15l14-7.5-14-7.5z" fill="#ef4444"/>
      <path d="M22.5 8.5a6 6 0 0 1 0 15" fill="none" stroke="#f9fafb" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}
