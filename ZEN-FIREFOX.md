# Zen Browser (Firefox) build

## Project overview

DRRR Chat Bot Extension enhances the `drrr.com` home, lounge, and room pages with chat helpers, configurable automation, user scripts and plugins, music controls, notifications, and optional peer-to-peer room features.

This branch, `zen-firefox`, is based on `dev` and adapts the existing extension for Zen Browser, which uses Firefox's WebExtension APIs. It keeps the Manifest V2 background page and room content scripts so the legacy runtime and its features can be reused. It is separate from the Chrome Manifest V3 work in `chrome-v3`.

## Changes from `dev`

- Added a fixed Gecko add-on ID in `manifest.json`, giving Firefox APIs such as `storage.sync` a stable extension identity.
- Removed the unused, nonstandard `current_locale` field.
- Changed `incognito` from Chrome's unsupported `split` mode to `not_allowed`. This removes Firefox's manifest warning and retains its previous effective behavior; private windows remain unsupported, while regular windows are unaffected.
- Added this installation and compatibility guide and linked it from the English and Chinese READMEs.

The room, lounge, home-page, popup, settings, script, music, and peer feature code is carried forward from `dev`; this branch does not rewrite the background runtime as a service worker.

## Load it in Zen for development

1. Open `about:debugging` in Zen.
2. Select **This Firefox** (or the equivalent Zen page) and choose **Load Temporary Add-on**.
3. Select this checkout's `manifest.json`.
4. Open or reload a room at `https://drrr.com/room/...`.

Temporary add-ons are removed when the browser restarts. To reload code changes during the same session, use the add-on's **Reload** button on `about:debugging`.

For a normal persistent installation, Mozilla must sign the packaged add-on (through AMO or for self-distribution). This development branch is not signed or published.

## Compatibility notes

- The room integration runs on `drrr.com/room/...`; the other existing page integrations remain governed by the match patterns in `manifest.json`.
- Private windows are disabled in this Firefox build, matching Firefox's prior fallback behavior for the unsupported `split` mode; normal windows are unaffected.
- Existing Chrome-style callback APIs are retained; Firefox supports them for compatible WebExtension APIs.
- Some optional functions call external services and may require their existing permissions or account configuration.
- Current user feedback is that Firefox/Zen works. Optional integrations have not been individually regression-checked; if one fails, inspect the room page or extension background console without changing the `chrome-v3` branch.
