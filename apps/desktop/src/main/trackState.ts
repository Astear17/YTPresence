import { EventEmitter } from "node:events";
import type { TrackInfo } from "@ytpresence/shared";

export class TrackState extends EventEmitter {
  private latestTrack: TrackInfo | undefined;
  private staleTimer: NodeJS.Timeout | undefined;
  private clearAfterMs: number;

  public constructor(clearAfterSeconds: number) {
    super();
    this.clearAfterMs = clearAfterSeconds * 1000;
  }

  public setClearAfterSeconds(seconds: number): void {
    this.clearAfterMs = seconds * 1000;
    this.scheduleStaleClear();
  }

  public get(): TrackInfo | undefined {
    return this.latestTrack;
  }

  public update(track: TrackInfo): void {
    this.latestTrack = track;
    this.emit("updated", track);
    this.scheduleStaleClear();
  }

  public clear(reason: "stale" | "stopped" | "manual"): void {
    if (!this.latestTrack) {
      return;
    }

    this.latestTrack = undefined;
    this.emit("cleared", reason);
  }

  private scheduleStaleClear(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
    }

    if (!this.latestTrack) {
      return;
    }

    this.staleTimer = setTimeout(() => this.clear("stale"), this.clearAfterMs);
    this.staleTimer.unref();
  }
}
