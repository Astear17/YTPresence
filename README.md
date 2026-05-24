# YTPresence

YTPresence is a Windows tray app plus Chromium browser extension that shows the currently playing YouTube Music track as Discord Rich Presence.

It exists to replace PreMiD for this use case: PreMiD can show YouTube Music as `Playing`, while YTPresence explicitly sends Discord activity type `Listening` whenever the local Discord RPC path accepts it.

## What It Does

- Runs as a background Electron app with a system tray icon.
- Opens settings from the tray menu.
- Receives YouTube Music metadata from a local browser extension.
- Sends Discord Rich Presence over official local Discord IPC/RPC only.
- Reconnects automatically when Discord is closed and reopened.
- Clears presence when YouTube Music is stopped, unavailable, or stale.
- Does not use Discord user tokens, selfbots, external servers, analytics, or account scraping.

## Architecture

```text
music.youtube.com content script
  -> extension background service worker
  -> ws://127.0.0.1:33879
  -> Electron tray app
  -> local Discord IPC
```

The extension reads page DOM, Media Session metadata, and media element state. It uses media events and `MutationObserver`, with a 2.5 second fallback poll.

## Discord RPC Decision

Discord's current RPC documentation says `SET_ACTIVITY` accepts activity type `Listening (2)`. YTPresence uses `@xhayper/discord-rpc`, a TypeScript fork of Discord.js RPC whose `setActivity` payload accepts `type`, and sends `ActivityType.Listening`.

If Discord or the installed client ignores the activity type, the presence may still show as `Playing`. YTPresence does not fake a Listening status with user tokens or unsupported APIs; it uses only local Discord RPC.

## Discord Image Limitation

Discord Rich Presence historically required pre-uploaded application assets for `large_image` and `small_image`. Discord's newer Rich Presence docs allow external URLs for activity images, so YTPresence sends the YouTube thumbnail URL as `large_image` when `Show album art` is enabled.

If album art does not show:

- The Discord client may not support external image URLs on that RPC path.
- The YouTube thumbnail URL may be blocked, expired, or too large.
- Your Discord application may need uploaded fallback assets.

In that case, disable `Show album art`, or upload a static YouTube Music image asset in the Discord Developer Portal and adapt the asset key in the desktop source.

## Requirements

- Windows 10 or newer.
- Discord desktop client running on the same Windows user session.
- Node.js 22 or newer.
- pnpm 9 or newer.
- Chrome, Edge, Brave, or another Chromium browser that supports Manifest V3 extensions.

## Install Dependencies

```powershell
cd D:\GitHub\YTPresence
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

If Corepack is unavailable:

```powershell
npm install -g pnpm
pnpm install
```

## Create a Discord Application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application named `YTPresence`.
3. Copy the Application ID from the General Information page.
4. Run the desktop app and paste that ID into Settings.
5. In Discord, enable activity sharing under Settings > Activity Privacy.

No client secret is needed.

## Run in Development

```powershell
cd D:\GitHub\YTPresence
pnpm dev
```

The desktop app starts in the tray. Open the tray menu and choose `Open settings`.

## Build Everything

```powershell
cd D:\GitHub\YTPresence
pnpm build
```

Outputs:

- Desktop app build: `apps/desktop/out`
- Extension build: `apps/extension/dist`

## Package Desktop App

```powershell
cd D:\GitHub\YTPresence
pnpm package:desktop
```

Electron Builder writes the NSIS installer under `apps/desktop/release` as `YTPresence-Setup-<version>.exe`.

## Build Installer on GitHub

The repository includes a manual workflow at `.github/workflows/build-windows-installer.yml`.

1. Open the repository on GitHub.
2. Go to Actions.
3. Select `Build Windows Installer`.
4. Click `Run workflow`.
5. Download the `YTPresence-Windows-Installer` artifact when the run finishes.

## Load the Browser Extension

1. Build the extension with `pnpm --filter @ytpresence/extension build`.
2. Open Chrome or Edge.
3. Go to `chrome://extensions` or `edge://extensions`.
4. Enable Developer mode.
5. Choose `Load unpacked`.
6. Select `D:\GitHub\YTPresence\apps\extension\dist`.
7. Open `https://music.youtube.com/` and play a track.

The extension popup shows whether it is connected to the desktop app and the last detected track.

After rebuilding the extension, click the extension reload button on the browser extensions page. Existing YouTube Music tabs should be injected automatically, but refreshing the YouTube Music tab is still a useful sanity check.

## Settings

- Enable presence: turn Discord updates on or off.
- Start with Windows: applies in packaged builds and launches hidden in the tray.
- Show album art: sends the YouTube thumbnail as the Discord large image.
- Show elapsed time: sends start/end timestamps when media time is available.
- Show paused status: either keep a paused presence or clear when paused.
- Show buttons: adds `Open YouTube Music` and `Listen on YouTube Music`.
- Custom Discord application/client ID: required for RPC.
- Reset settings: restores defaults.

## Tray Menu

- Open settings
- Enable presence
- Current detected track preview
- Discord and extension status
- Reconnect Discord
- Quit

## Troubleshooting

### Discord Not Detected

- Make sure the Discord desktop app is running, not only Discord in a browser.
- Quit Discord from its tray icon and reopen it.
- Check Discord Settings > Activity Privacy > Display current activity as a status message.
- Check that another Discord client is not taking the RPC connection.
- Use the tray menu item `Reconnect Discord`.

### YouTube Music Not Detected

- Confirm the extension is loaded from `apps/extension/dist`.
- Refresh `https://music.youtube.com/` after loading the extension.
- If the extension was rebuilt while Chrome was open, reload the extension from `chrome://extensions` or `edge://extensions`.
- Open the extension popup and check the current track.
- Play a track in the active tab.

### Extension Not Connected

- Start the desktop app first.
- Confirm no firewall is blocking `ws://127.0.0.1:33879`.
- Confirm the desktop settings still use port `33879`.
- Reload the extension from the browser extension page.

### Presence Shows Playing Instead of Listening

YTPresence sends `ActivityType.Listening` through local Discord RPC. If the Discord client or RPC library path ignores the type, the client may render `Playing`. The app intentionally does not use selfbots, user tokens, or account automation to work around that.

### Album Art Not Showing

YTPresence sends the YouTube thumbnail URL as `large_image`. If your Discord client does not display it, use a static uploaded Rich Presence asset or disable album art.

### Firewall Blocking Localhost

The desktop app listens only on `127.0.0.1`. Allow local loopback WebSocket traffic for the app if prompted by Windows Firewall or third-party security software.

## Development Scripts

```powershell
pnpm install
pnpm dev
pnpm build
pnpm package:desktop
pnpm lint
pnpm typecheck
```

## Project Layout

```text
D:/GitHub/YTPresence
  apps/
    desktop/    Electron tray app
    extension/  Chromium MV3 companion extension
  packages/
    shared/     Shared TypeScript types and validation
```

## App Icon

The replaceable source icon files are:

- `apps/desktop/assets/icon.ico` for the Windows executable and installer.
- `apps/desktop/assets/icon.png` for the tray icon and settings window icon.
- `apps/desktop/assets/icon.svg` as the editable vector source used for the default icon.

If you replace the branding later, replace at least `icon.ico` and `icon.png`, then rebuild/package the app.
