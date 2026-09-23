# Chrome Manifest V3 branch

## Project overview

DRRR Chat Bot Extension enhances the `drrr.com` home, lounge, and room pages. It provides room-chat helpers, configurable automation, user-authored scripts and plugins, music controls, notifications, and optional peer-to-peer room features.

This document describes the `chrome-v3` development branch. It is based on `dev` and is maintained separately from the older Chrome Web Store build and the `zen-firefox` branch.

## Changes from `dev`

- Migrated the manifest to Manifest V3, with a toolbar `action`, a service-worker background entry, separate API, required-host, and optional-host permissions, and Manifest V3 web-accessible-resource and CSP declarations. The manifest requires Chrome 120 or newer.
- Added `background/service-worker.js` to load the existing background runtime in a worker context, and updated background/message handling to register extension event listeners synchronously.
- Added `background/user-plugins.js` to run user scripts through Chrome's `userScripts` API, and requested that API in the manifest.
- Added `scripts/build-mv3-worker.mjs`. It generates `background/worker-lambda.js` and `background/worker-modules.js` from the existing Lambda, module, and plugin sources so the service worker can load them as classic scripts.
- Added a room-tab heartbeat for active Lambda timers, since MV3 service workers may otherwise become idle while timer callbacks are pending.
- Updated popup, settings, and page messaging paths for the MV3 permission model and background runtime. The existing room, lounge, home-page, script, music, and peer features remain in the branch.
- Kept the Live2D page's Asteroids easter egg as a local extension asset.

## Load the development build

1. Use Chrome 120 or newer.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the root of this checkout.
4. Open or reload a room at `https://drrr.com/room/...`.

After editing module or Lambda source files that are bundled for the worker, regenerate the worker assets from the repository root:

```sh
node scripts/build-mv3-worker.mjs
```

## Status and scope

This branch is a development migration, not a replacement for the published store build. It has not been verified in a live Chrome room in this work session, so individual legacy features still need browser-side confirmation. The room page and service worker consoles are the first places to inspect if behavior differs.
