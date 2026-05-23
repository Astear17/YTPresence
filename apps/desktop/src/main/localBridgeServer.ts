import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { validateTrackInfo, type AppSettings, type TrackInfo } from "@ytpresence/shared";
import type { Logger } from "./logger";

interface ExtensionMessage {
  type: string;
  payload?: unknown;
}

export class LocalBridgeServer extends EventEmitter {
  private server: WebSocketServer | undefined;
  private readonly clients = new Set<WebSocket>();
  private lastError: string | undefined;
  private lastMessageAt: number | undefined;

  public constructor(
    private settings: AppSettings,
    private readonly logger: Logger
  ) {
    super();
  }

  public async start(): Promise<void> {
    await this.stop();
    this.server = new WebSocketServer({
      host: "127.0.0.1",
      port: this.settings.websocketPort
    });

    this.server.on("connection", (socket, request) => this.handleConnection(socket, request));
    this.server.on("error", (error) => {
      this.lastError = error.message;
      this.logger.error("WebSocket bridge error", { error: error.message });
      this.emit("status");
    });
    this.server.on("listening", () => {
      this.lastError = undefined;
      this.logger.info("WebSocket bridge listening", { port: this.settings.websocketPort });
      this.emit("status");
    });
  }

  public async restart(settings: AppSettings): Promise<void> {
    const portChanged = settings.websocketPort !== this.settings.websocketPort;
    this.settings = settings;
    if (portChanged) {
      await this.start();
    }
  }

  public async stop(): Promise<void> {
    for (const client of this.clients) {
      client.close(1001, "Server stopping");
    }
    this.clients.clear();

    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = undefined;
    this.emit("status");
  }

  public getStatus() {
    return {
      connected: this.clients.size > 0,
      clientCount: this.clients.size,
      listening: !!this.server,
      port: this.settings.websocketPort,
      lastError: this.lastError,
      lastMessageAt: this.lastMessageAt
    };
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    if (!isLocalAddress(request.socket.remoteAddress)) {
      this.logger.warn("Rejected non-local bridge connection", { address: request.socket.remoteAddress });
      socket.close(1008, "Local connections only");
      return;
    }

    this.clients.add(socket);
    this.emit("status");
    socket.send(JSON.stringify({ type: "desktop:hello", payload: { ok: true } }));

    socket.on("message", (data) => this.handleMessage(socket, data));
    socket.on("close", () => {
      this.clients.delete(socket);
      this.emit("status");
    });
    socket.on("error", (error) => {
      this.lastError = error.message;
      this.logger.warn("Bridge client error", { error: error.message });
      this.emit("status");
    });
  }

  private handleMessage(socket: WebSocket, data: RawData): void {
    const message = parseMessage(data);
    if (!message) {
      socket.send(JSON.stringify({ type: "desktop:error", payload: { message: "Invalid JSON message" } }));
      return;
    }

    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", payload: { now: Date.now() } }));
      return;
    }

    if (message.type !== "track:update") {
      socket.send(JSON.stringify({ type: "desktop:error", payload: { message: "Unknown message type" } }));
      return;
    }

    const track = validateTrackInfo(message.payload);
    if (!track) {
      socket.send(JSON.stringify({ type: "desktop:error", payload: { message: "Invalid TrackInfo payload" } }));
      return;
    }

    this.lastMessageAt = Date.now();
    this.emit("track", track satisfies TrackInfo);
    socket.send(JSON.stringify({ type: "track:ack", payload: { receivedAt: this.lastMessageAt } }));
    this.emit("status");
  }
}

function parseMessage(data: RawData): ExtensionMessage | null {
  try {
    const parsed = JSON.parse(data.toString()) as unknown;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }

    return parsed as ExtensionMessage;
  } catch {
    return null;
  }
}

function isLocalAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
