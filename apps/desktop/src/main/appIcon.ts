import { app, nativeImage } from "electron";
import { join } from "node:path";

const ICON_PNG_PATH = join(app.getAppPath(), "assets", "icon.png");

export function getAppIconPath(): string {
  return ICON_PNG_PATH;
}

export function getTrayIcon() {
  const image = nativeImage.createFromPath(ICON_PNG_PATH);
  return image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 });
}
