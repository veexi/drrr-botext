# Zen Browser (Firefox) build

This branch, `zen-firefox`, is based on `dev` and keeps the existing Manifest V2 background page and room content scripts. The manifest includes a fixed Gecko add-on ID so Firefox storage APIs such as `storage.sync` can keep a stable extension identity.

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
- This branch has not yet been exercised in a live Zen room. Report any console error from the room page or extension background page so the failing feature can be fixed without changing the `chrome-v3` branch.
