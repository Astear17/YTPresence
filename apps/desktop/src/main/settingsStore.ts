import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from "@ytpresence/shared";

export class SettingsStore extends EventEmitter {
  private settings: AppSettings = DEFAULT_SETTINGS;
  private readonly filePath: string;

  public constructor(userDataPath: string) {
    super();
    this.filePath = join(userDataPath, "settings.json");
  }

  public async load(): Promise<AppSettings> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
    } catch {
      raw = {};
    }

    const envPort = Number(process.env.YTPRESENCE_WS_PORT);
    const envClientId = process.env.YTPRESENCE_DISCORD_CLIENT_ID;
    const merged = mergeSettings(raw && typeof raw === "object" ? raw : {});

    this.settings = mergeSettings({
      ...merged,
      websocketPort: Number.isFinite(envPort) ? envPort : merged.websocketPort,
      discordClientId: merged.discordClientId || envClientId || ""
    });
    await this.save();
    return this.settings;
  }

  public get(): AppSettings {
    return this.settings;
  }

  public async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = mergeSettings({ ...this.settings, ...patch });
    await this.save();
    this.emit("updated", this.settings);
    return this.settings;
  }

  public async reset(): Promise<AppSettings> {
    this.settings = mergeSettings({
      ...DEFAULT_SETTINGS,
      discordClientId: process.env.YTPRESENCE_DISCORD_CLIENT_ID || ""
    });
    await this.save();
    this.emit("updated", this.settings);
    return this.settings;
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.settings, null, 2)}\n`, "utf8");
  }
}
