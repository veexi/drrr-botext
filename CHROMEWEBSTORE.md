# Chrome Web Store submission notes

This document tracks the `chrome-v3` branch for Chrome Web Store review.

## Current status

**Not ready for submission yet.** The MV3 migration itself is valid, but the audit found two release blockers:

1. BotScript package modules can be downloaded from GitHub/Gitee and then executed by the bundled `RL.Machine` interpreter. Chrome MV3 treats remotely fetched executable logic, including instructions interpreted by a custom interpreter, as remote hosted code.
2. DRRR authentication cookies (`drrr-session-1`) are currently copied into `chrome.storage.sync` for profile/session switching. Chrome documents `storage.local` and `storage.sync` as unsuitable for confidential data because they are not encrypted.

Before upload, also replace the old generic 2020 privacy policy with one describing the extension's actual behavior.

## Single purpose

Suggested Chrome Web Store text:

> Provide user-controlled automation and productivity tools for drrr.com chat rooms, including room actions, notifications, media helpers, and optional user-authored scripts.

## Permission justifications

### storage

Stores extension settings, automation rules, playlists, locally authored scripts/plugins, UI state, and other user-configured extension data.

**Release requirement:** authentication/session credentials must not be stored in `chrome.storage.sync`.

### cookies

Used only with `drrr.com` to support user-initiated DRRR session/profile management, including reading, switching, importing, and removing the DRRR session cookie.

### notifications

Shows notifications requested by extension features, such as room events, automation results, music/playlist actions, and configuration status.

### userScripts

Executes scripts explicitly authored or selected by the user on DRRR pages through Chrome's User Scripts API. URL-based user plugins request access to the selected source origin at runtime before the script is fetched and registered.

This permission must not be used as a path for developer-controlled remote code.

### tabs

Not required in the store build. The extension does not read arbitrary tab URL/title/favicon properties. Its tab operations are limited to opening, updating, reloading, closing, querying known DRRR URLs, and messaging extension content scripts.

## Host permission justifications

### drrr.com

Core extension host. Required for DRRR page integration, room/lounge APIs, content scripts, room automation, and the optional DRRR session/profile tools.

### tinyurl.com

Used by the optional URL-shortening helper when a generated media URL is too long.

### keeper-cat.fly.dev

Used by the optional media/YouTube helper API for search and link resolution.

### link.hhtjim.com

Used by the legacy NetEase music helper to resolve playable media links.

### music.163.com

Used by the NetEase music search/link integration.

### store.line.me

Used by the optional LINE sticker helper.

### api.telegram.org

Used only when the user enables Telegram Bot forwarding and supplies their own bot token/chat ID. Selected DRRR room events/messages are then sent to that Telegram bot.

### api.tenor.com / api.giphy.com

Used by optional GIF search helpers.

### script.google.com

Used by optional hidden-room/lounge and peer-room helper functionality backed by configured Google Apps Script endpoints.

### music.liuzhijin.cn

Used by an optional music search/link provider.

### github.com / gitee.com

**Do not justify these as executable module sources in the store build.** The current BotScript mirror feature downloads executable module logic from these hosts and must be removed or converted to packaged-at-build-time modules before submission.

If no other runtime feature needs these host permissions after that refactor, remove them from `host_permissions`.

## Optional host permissions

`http://*/*` and `https://*/*` are optional rather than install-time permissions.

They are used only when the user explicitly configures a custom API endpoint or URL-based user plugin. The extension requests access to that specific origin through `chrome.permissions.request()` in direct response to a user action. The broad optional declaration makes arbitrary user-selected origins eligible for a later per-origin request; it does not grant all-site access at installation.

## Remote code declaration

### Current build

Not compliant for store submission because BotScript package modules can be fetched from remote mirrors and executed by the extension's custom interpreter.

### Target store build

The extension does not execute developer-controlled remotely hosted code. All extension logic and built-in plugins are packaged with the submitted extension. User-authored or user-selected JavaScript plugins are executed only through Chrome's `userScripts` API after explicit user configuration and, for URL sources, explicit host permission.

## User data / privacy declarations

Final declarations must match the post-fix build and privacy policy.

Expected relevant categories:

- **Authentication information:** DRRR session cookies are accessed for the optional profile/session-management feature. Do not claim credentials are stored remotely; redesign current sync storage before submission.
- **Personal communications:** DRRR room/direct-message content is processed to provide room automation and notifications. It is sent to Telegram only if the user explicitly enables Telegram forwarding.
- **Website content:** the extension reads and modifies DRRR page content to provide its core features.
- **User-generated content:** user-authored scripts, automation rules, settings, and plugin definitions are stored as extension configuration.

Do not declare collection of analytics, precise location, health, financial/payment data, or browsing history unless the final code actually introduces such collection.

## Reviewer notes / test flow

1. Install the extension on Chrome 120 or later.
2. Open `https://drrr.com/` and enter a room.
3. Open the extension popup to see room controls and settings.
4. Enable a room notification/automation option and trigger the corresponding room event.
5. For user plugins, create a simple local code plugin. On Chrome versions requiring it, enable **Allow User Scripts** for the extension first.
6. URL-based user plugins are optional and request permission only for the user-selected source origin.
7. Telegram, media providers, custom API endpoints, and session/profile switching are optional features and are not required for basic operation.

## Release checklist

- [ ] Remove/refactor remotely fetched BotScript modules; package maintained modules with the extension.
- [ ] Redesign DRRR session credential storage so credentials are not kept in unencrypted `storage.sync`.
- [ ] Rewrite and publish an accurate privacy policy.
- [ ] Re-audit required host permissions after the BotScript refactor.
- [ ] Prefer HTTPS-only endpoints where supported; remove obsolete HTTP-only providers if unnecessary.
- [ ] Increment `manifest.json` version above `1.843`.
- [ ] Run `node scripts/build-mv3-worker.mjs`.
- [ ] Run syntax and manifest validation.
- [ ] Build a clean ZIP whose root contains `manifest.json`.
- [ ] Complete Store Listing, Privacy, distribution, contact, and reviewer fields in the Chrome Web Store dashboard.

## Chrome documentation

- MV3 / remote hosted code: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- User Scripts API: https://developer.chrome.com/docs/extensions/reference/api/userScripts
- Privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Storage API security guidance: https://developer.chrome.com/docs/extensions/reference/api/storage
