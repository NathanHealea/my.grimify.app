# PWA: Offline, Install and Updates

> Covers the service worker, the install banner, the update prompt and online status.
> User journeys: [UX_FLOWS.md Flows 1 and 8](../UX_FLOWS.md). Rationale: [DECISIONS 002](../DECISIONS.md).

## TL;DR

- **vite-plugin-pwa** builds the service worker. It **precaches** `js, css, html, json, svg, woff2`, which includes **`catalog.json`**.
- **`registerType: "prompt"`**: a new version **waits until the user taps Reload** on the bar or **Update** in Settings.
- The **install banner** appears from the **2nd visit or after 30 s**. **"Not now" hides it for 30 days.**
- **iOS gets a manual hint** ("Tap Share, then Add to Home Screen"), because iOS has no install event.
- **`useOnlineStatus()`** drives the **Offline** pill and turns off sign-in and account deletion while offline.

## Where the code lives

| Path | Role |
|---|---|
| `vite.config.ts` (`VitePWA`) | Manifest, `workbox.globPatterns`, `navigateFallback: "/index.html"` |
| `src/features/pwa/service-worker-updates.tsx` | Registers the worker with `useRegisterSW`, provides the update state and renders the bar; wraps the app in `main.tsx` |
| `src/features/pwa/update-state.tsx` | `useUpdateState()` (`ready`, `apply`, `check`), `UpdateStateProvider` and the pure `checkForUpdate(registration)` |
| `src/features/pwa/update-prompt.tsx` | "Update available" bar with **Later** / **Reload** |
| `src/features/pwa/install-banner.tsx` | `<InstallBanner>`; rendered by the app shell above each screen |
| `src/features/pwa/install-hint.ts` | Pure timing, dismissal and platform rules, plus storage access |
| `src/features/pwa/use-online-status.ts` | `useOnlineStatus()` over `online` and `offline` events |

## Manifest

- `start_url: "/paints"`, `scope: "/"`, `display: "standalone"`.
- **`icons: []`** waits on the artwork (issue #3). **Until then, Chrome won't offer install.**

## Install banner rules

1. `recordVisit()` counts **one visit per browser session**: `localStorage` `grimify:visits`, guarded by `sessionStorage` `grimify:visit-counted`.
2. Timing is met at **2+ visits** or **30 s** (`HINT_DELAY_MS`) on the page.
3. **Chrome / Android**: when the browser fires `beforeinstallprompt`, the banner shows **Install app**, which calls `prompt()`.
4. **iOS**: the device is iOS (iPadOS counts: a touch-capable "Macintosh") and **not already standalone**, so the banner shows the Share hint.
5. **"Not now"** saves `grimify:install-dismissed-at`. The banner stays hidden for **30 days** (`DISMISS_FOR_MS`).

Storage failures, such as private mode, are **ignored on purpose**, because the hint is optional.

## Update prompt

- `needRefresh` from `useRegisterSW` shows the bar.
- **Reload** calls `updateServiceWorker()`.
- **Later** hides the bar **for this session only**.

## Shared update state

- `ServiceWorkerUpdates` wraps the whole app, so the bar and Settings read one state through `useUpdateState()`: `ready` (= `needRefresh`), `apply` (= `updateServiceWorker()`) and `check`.
- `check` runs `checkForUpdate(registration)`: it calls `registration.update()`, then resolves **true** if a worker is waiting, waits for an installing worker to reach `installed` (true) or `redundant` (false), and **rejects** when `update()` fails, when the worker never registered, or when the whole check (including `update()` itself) takes over 30 s.
- `check` is `null` until `useRegisterSW` reports a registration, so Settings hides **Check for updates** when no worker registers.
- **Without the provider** (unit tests, or a dev server where the worker doesn't register) `useUpdateState()` returns `ready: false` and `check: null`, and Settings shows only the version.
- `virtual:pwa-register/react` exists only in Vite builds, so `service-worker-updates.tsx` stays thin and untested; the logic is tested in `update-state.test.ts` and through Settings. The real worker swap is checked by hand.

## Offline behavior across features

| Feature | Offline result |
|---|---|
| Catalog | Served from the precache after one visit. Before that, the gate shows "Connect to the internet once…" |
| Collection toggles | **Still work.** Changes queue in the outbox |
| Sign in | Disabled: "Signing in needs an internet connection." |
| Delete account | Disabled with the same reason |
| Settings → Check for updates | Disabled: "Connect to the internet to check for updates." **Update** still works |
| Header | **Offline** pill (`role="status"`) |

## Relations to other features

- **Catalog** ([data-pipeline.md](catalog/data-pipeline.md)): precached `catalog.json`.
- **Collection** ([sync-and-outbox.md](collection/sync-and-outbox.md)): flushes on the `online` event.
- **Auth** ([auth-account.md](auth-account.md)): gated by `useOnlineStatus()`.
- **App shell** ([app-shell-ui.md](app-shell-ui.md)): renders `<InstallBanner>` and the Offline pill.
