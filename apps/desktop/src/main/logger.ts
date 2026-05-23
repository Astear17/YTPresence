import { app } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  private readonly logPath: string;

  public constructor() {
    const dir = join(app.getPath("userData"), "logs");
    mkdirSync(dir, { recursive: true });
    this.logPath = join(dir, "ytpresence.log");
  }

  public debug(message: string, meta?: unknown): void {
    this.write("debug", message, meta);
  }

  public info(message: string, meta?: unknown): void {
    this.write("info", message, meta);
  }

  public warn(message: string, meta?: unknown): void {
    this.write("warn", message, meta);
  }

  public error(message: string, meta?: unknown): void {
    this.write("error", message, meta);
  }

  private write(level: LogLevel, message: string, meta?: unknown): void {
    const suffix = meta === undefined ? "" : ` ${safeStringify(meta)}`;
    const line = `${new Date().toISOString()} [${level}] ${message}${suffix}\n`;
    appendFileSync(this.logPath, line, "utf8");
    if (level === "error") {
      console.error(line.trim());
    } else if (level === "warn") {
      console.warn(line.trim());
    } else {
      console.log(line.trim());
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
