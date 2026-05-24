import "./styles.css";
import type { AppSettings, AppStatus } from "@ytpresence/shared";
import type { YTPresenceApi } from "../../preload";

declare global {
  interface Window {
    ytpresence: YTPresenceApi;
  }
}

type Tab = "settings" | "about";

let settings: AppSettings;
let status: AppStatus;
let activeTab: Tab = "settings";

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) {
  throw new Error("Missing #app root");
}
const appRoot: HTMLDivElement = rootElement;

void init();

async function init(): Promise<void> {
  [settings, status] = await Promise.all([window.ytpresence.getSettings(), window.ytpresence.getStatus()]);
  window.ytpresence.onStatusUpdate((nextStatus) => {
    status = nextStatus;
    settings = nextStatus.settings;
    render();
  });
  render();
}

function render(): void {
  appRoot.innerHTML = `
    <main class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">YT</div>
          <div>
            <h1>YTPresence</h1>
            <p>YouTube Music to Discord</p>
          </div>
        </div>
        <nav class="tabs" aria-label="Settings sections">
          ${tabButton("settings", "Settings")}
          ${tabButton("about", "About")}
        </nav>
        <div class="status-block">
          ${statusLine("Discord", discordText())}
          ${statusLine("Extension", status.bridge.connected ? "Connected" : "Waiting")}
          ${statusLine("Bridge", `127.0.0.1:${status.bridge.port}`)}
        </div>
      </aside>
      <section class="content">
        ${activeTab === "settings" ? settingsView() : aboutView()}
      </section>
    </main>
  `;

  bindEvents();
}

function tabButton(tab: Tab, label: string): string {
  return `<button class="tab ${activeTab === tab ? "active" : ""}" data-tab="${tab}" type="button">${label}</button>`;
}

function statusLine(label: string, value: string): string {
  return `
    <div class="status-line">
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`;
}

function settingsView(): string {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">Background Presence</p>
        <h2>Settings</h2>
      </div>
      <button class="secondary" type="button" data-action="reconnect">Reconnect Discord</button>
    </header>

    <section class="panel track-panel">
      <div>
        <p class="eyebrow">Current Track</p>
        <h3>${escapeHtml(trackTitle())}</h3>
        <p>${escapeHtml(trackSubtitle())}</p>
      </div>
      <span class="pill ${status.track?.playbackState || "stopped"}">${escapeHtml(status.track?.playbackState || "stopped")}</span>
    </section>

    <section class="panel">
      <h3>Presence</h3>
      <div class="setting-list">
        ${toggle("presenceEnabled", "Enable presence", "Send YouTube Music status to Discord.")}
        ${toggle("showPausedStatus", "Show paused status", "Keep a paused presence instead of clearing it.")}
        ${toggle("showElapsedTime", "Show elapsed time", "Include start and end timestamps when playback time is available.")}
        ${toggle("showAlbumArt", "Show album art", "Use the YouTube Music thumbnail as the large image when Discord accepts it.")}
        ${toggle("showButtons", "Show buttons", "Add YouTube Music and current song buttons.")}
      </div>
    </section>

    <section class="panel">
      <h3>Startup</h3>
      <div class="setting-list">
        ${toggle("startWithWindows", "Start with Windows", "Launch hidden in the tray after you sign in.")}
      </div>
    </section>

    <section class="panel">
      <h3>Discord Application</h3>
      <label class="field">
        <span>Client ID</span>
        <input data-field="discordClientId" inputmode="numeric" autocomplete="off" spellcheck="false" value="${escapeAttribute(settings.discordClientId)}" placeholder="Paste your Discord application client ID" />
      </label>
      <p class="help">Create a Discord application, copy its Application ID, and paste it here. No client secret or user token is used.</p>
    </section>

    <section class="actions">
      <button class="danger" type="button" data-action="reset">Reset settings</button>
      <button class="primary" type="button" data-action="open-ytm">Open YouTube Music</button>
    </section>
  `;
}

function aboutView(): string {
  return `
    <header class="page-header">
      <div>
        <p class="eyebrow">About</p>
        <h2>YTPresence</h2>
      </div>
    </header>
    <section class="panel about">
      <p>YTPresence is a local Windows tray app that receives YouTube Music metadata from its browser extension and publishes Discord Rich Presence through local Discord IPC.</p>
      <p>The app never asks for a Discord user token, does not use a selfbot, does not collect analytics, and does not send track metadata anywhere except the local Discord client.</p>
      <div class="about-links">
        <button class="secondary" data-action="open-readme" type="button">Open setup docs</button>
        <button class="secondary" data-action="open-discord-dev" type="button">Discord Developer Portal</button>
      </div>
    </section>
  `;
}

function toggle(key: keyof AppSettings, title: string, description: string): string {
  const value = Boolean(settings[key]);
  return `
    <label class="toggle-row">
      <span>
        <strong>${title}</strong>
        <small>${description}</small>
      </span>
      <input type="checkbox" data-setting="${key}" ${value ? "checked" : ""} />
    </label>`;
}

function bindEvents(): void {
  for (const button of appRoot.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab as Tab;
      render();
    });
  }

  for (const checkbox of appRoot.querySelectorAll<HTMLInputElement>("[data-setting]")) {
    checkbox.addEventListener("change", () => {
      const key = checkbox.dataset.setting as keyof AppSettings;
      void window.ytpresence.updateSettings({ [key]: checkbox.checked });
    });
  }

  const clientIdInput = appRoot.querySelector<HTMLInputElement>("[data-field='discordClientId']");
  clientIdInput?.addEventListener("change", () => {
    void window.ytpresence.updateSettings({ discordClientId: clientIdInput.value.trim() });
  });

  appRoot.querySelector("[data-action='reconnect']")?.addEventListener("click", () => {
    void window.ytpresence.reconnectDiscord();
  });
  appRoot.querySelector("[data-action='reset']")?.addEventListener("click", () => {
    void window.ytpresence.resetSettings();
  });
  appRoot.querySelector("[data-action='open-ytm']")?.addEventListener("click", () => {
    void window.ytpresence.openExternal("https://music.youtube.com/");
  });
  appRoot.querySelector("[data-action='open-readme']")?.addEventListener("click", () => {
    void window.ytpresence.openExternal("https://github.com/");
  });
  appRoot.querySelector("[data-action='open-discord-dev']")?.addEventListener("click", () => {
    void window.ytpresence.openExternal("https://discord.com/developers/applications");
  });
}

function discordText(): string {
  if (status.discord.connected) {
    return "Connected";
  }
  if (status.discord.reconnecting) {
    return "Reconnecting";
  }
  return status.discord.lastError || "Disconnected";
}

function trackTitle(): string {
  if (!status.track || status.track.playbackState === "stopped") {
    return "No track detected";
  }
  return status.track.title;
}

function trackSubtitle(): string {
  if (!status.track || status.track.playbackState === "stopped") {
    return "Open music.youtube.com with the extension loaded.";
  }

  const parts = [status.track.artist, status.track.album].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "YouTube Music";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
