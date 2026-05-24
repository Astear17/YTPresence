import { validateTrackInfo, type TrackInfo } from "@ytpresence/shared";

const WS_URL = "ws://127.0.0.1:33879";
const YOUTUBE_MUSIC_URL_PATTERN = "https://music.youtube.com/*";

interface ExtensionStatus {
  connected: boolean;
  lastError: string | undefined;
  lastUpdateAt: number | undefined;
  currentTrack: TrackInfo | undefined;
}

interface RuntimeMessage {
  type: string;
  payload?: unknown;
}

let socket: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempt = 0;
let status: ExtensionStatus = { connected: false, lastError: undefined, lastUpdateAt: undefined, currentTrack: undefined };
let pendingTrack: TrackInfo | undefined;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "track:update") {
    const track = validateTrackInfo(message.payload);
    if (!track) {
      sendResponse({ ok: false, error: "Invalid TrackInfo" });
      return false;
    }

    status = {
      ...status,
      currentTrack: track,
      lastUpdateAt: Date.now()
    };
    sendTrack(track);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "status:get") {
    connect();
    void injectIntoMusicTabs();
    sendResponse(status);
    return false;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  void injectIntoMusicTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void injectIntoMusicTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("https://music.youtube.com/")) {
    void injectContentScript(tabId);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId, (tab) => {
    if (tab.url?.startsWith("https://music.youtube.com/")) {
      void injectContentScript(tabId);
    }
  });
});

function sendTrack(track: TrackInfo): void {
  pendingTrack = track;
  connect();

  if (socket?.readyState === WebSocket.OPEN) {
    flushPendingTrack();
  }
}

async function injectIntoMusicTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: YOUTUBE_MUSIC_URL_PATTERN });
    await Promise.all(tabs.map((tab) => (tab.id === undefined ? Promise.resolve() : injectContentScript(tab.id))));
  } catch (error) {
    status = {
      ...status,
      lastError: error instanceof Error ? error.message : "Unable to inject content script."
    };
  }
}

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Cannot access") && !message.includes("No tab with id")) {
      status = { ...status, lastError: message };
    }
  }
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }

  socket = new WebSocket(WS_URL);
  socket.addEventListener("open", () => {
    status = { ...status, connected: true, lastError: undefined };
    reconnectAttempt = 0;
    flushPendingTrack();
  });
  socket.addEventListener("message", () => {
    status = { ...status, connected: true, lastError: undefined };
  });
  socket.addEventListener("close", () => {
    status = { ...status, connected: false };
    scheduleReconnect();
  });
  socket.addEventListener("error", () => {
    status = { ...status, connected: false, lastError: "Desktop app is not reachable." };
  });
}

function flushPendingTrack(): void {
  if (!pendingTrack || socket?.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify({ type: "track:update", payload: pendingTrack }));
  pendingTrack = undefined;
}

function scheduleReconnect(): void {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
  }

  const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => connect(), delay);
}
