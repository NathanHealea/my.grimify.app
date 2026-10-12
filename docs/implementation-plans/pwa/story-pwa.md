---
type: story
slug: pwa
status: released
branch: story/pwa
worktree_path: ../grimify-v2-worktrees/story-pwa
created: 2026-10-07
approved: 2026-10-07
version: 0.5.0
tag: v0.5.0
merge_commit: 6a46677 (squash of story/pwa)
---

# PWA: offline catalog, update prompt and install hints

## Summary

Make Grimify a working Progressive Web App (DECISIONS 002): a web manifest, a service worker that precaches the app and `catalog.json` so search and equivalents work offline after the first visit, an "Update available" prompt, an "Offline" indicator, and install hints (Android's install button, iOS's "Add to Home Screen" banner). The app icon isn't ready (DESIGN_SYSTEM §2 TBD, issue #3), so this item ships without icons and the icons follow when the artwork arrives.

## Context

ROADMAP NOW: "PWA: manifest, icons, service worker, offline catalog, update prompt, iOS install banner".

Decided in conversation on 2026-10-07:

- **Icons:** build without icons now, tracked as GitHub issue #3. Until then, Chrome won't offer "Install app" (installability needs 192 and 512 icons) and iOS shows a screenshot as the home-screen icon.
- **Bug tracking:** bugs and follow-ups go in GitHub Issues. Issues #1 (metallics typed as opaque), #2 (Vallejo merges) and #3 (icon) were filed today.

Docs this builds on:

- **ARCHITECTURE:** §2 names `vite-plugin-pwa` (Workbox). §4 says the service worker serves `catalog.json` from cache. The §9 table:
  - Offline shows an "Offline" indicator.
  - A new version shows "Update available — Reload".
  - A first visit while offline shows the catalog error that already exists.
- **DESIGN_SYSTEM §12:** a small "Offline" pill in the header.
- **UX_FLOWS Flow 1:** the install hint after the 2nd visit or about 30 s of use. Android gets an "Install app" button; iOS gets "Install: tap Share, then Add to Home Screen". Dismissing it hides it for 30 days (localStorage).
- **TESTING §2:** the offline E2E with `context.setOffline(true)`.

Code today: `index.html` has `viewport-fit=cover` and light and dark `theme-color` metas. There's no manifest or service worker. `src/features/pwa/` is reserved by ARCHITECTURE §7 but empty.

## Dependencies (need your approval)

Versions checked against the npm registry on 2026-10-07.

| Package | Version | Kind | Why |
|---|---|---|---|
| vite-plugin-pwa | 2.0.0 | dev | Generates the manifest and the Workbox service worker (ARCHITECTURE §2). Its peer range includes Vite 8; it brings `workbox-build` and `workbox-window` 7.4.1 |

## Behavior

**Manifest**

- `name` and `short_name` "Grimify", plus a description.
- `start_url: "/paints"`, `scope: "/"`, `display: "standalone"`.
- `background_color` and `theme_color` `#FFFFFF`; the `theme-color` metas keep switching for dark mode.
- `icons: []` until issue #3.

**Service worker**

- `generateSW` precaches the built app shell and `catalog.json` (614 KB raw, under Workbox's 2 MB default).
- `navigateFallback: /index.html`, so deep links like `/paints/<id>` open offline.
- Registration is "prompt": the new worker waits until the user reloads.
- It's off in `npm run dev`; it runs in `build` and `preview`.

**Update prompt**

- When a new worker is waiting, a bar above the nav reads "Update available" with a "Reload" button.
- Reload activates the new worker and refreshes.
- The bar can be dismissed for this session.

**Offline pill**

- The header shows "Offline" while `navigator.onLine` is false, updated by the `online` and `offline` events and announced politely.

**Install hint (iOS)**

- Shows in Safari on iPhone and iPad when the app isn't running standalone. That's detected with `navigator.standalone` or `display-mode: standalone`, plus an iOS user-agent check.
- Appears from the 2nd visit, or after 30 s on the first.
- The banner reads "Install Grimify: tap Share, then Add to Home Screen", with the Share icon and a "Not now" button.
- "Not now" hides it for 30 days. All storage access is wrapped so private mode can't break it; if storage fails, the hint just shows.

**Install hint (Android and Chrome)**

- When the browser fires `beforeinstallprompt`, the same banner shows "Install app", which calls the saved prompt.
- It's inert until icons exist (#3).

**Where banners show:** under the header, above the page content, never covering the nav.

## Scope

**In scope**

- `vite-plugin-pwa` config, manifest, `index.html` Apple meta tags (`apple-mobile-web-app-title`, status bar style)
- `src/features/pwa/`: online-status hook, update prompt, install hint (with pure "should show" logic), wired into `AppShell`
- Unit and component tests; an offline E2E on the Pixel 7 (Chromium) profile
- Docs, plus the bug-tracking convention in CLAUDE.md

**Out of scope**

- Icons and favicon (#3)
- `public/_headers` and cache headers for `sw.js` (deploy item, DEPLOYMENT and SECURITY §5)
- The collection's offline outbox and "n changes waiting to sync" (collection items)
- Push notifications, background sync
- An "Install help" page in Settings (Settings item)
- Pull-to-refresh changes: nothing interferes yet

## Requirements

- **R1** — The production build serves a valid web manifest (name, start URL `/paints`, standalone display, colors) and registers a service worker. The dev server doesn't.
- **R2** — After one online visit, the app works with the network off: reloading `/paints` lists and searches paints, and a deep link to `/paints/<id>` opens with equivalents.
- **R3** — When a new version is deployed and its worker is waiting, an "Update available" bar with "Reload" appears. Reload loads the new version, and dismissing hides it until the next session.
- **R4** — While the device is offline, the header shows an "Offline" pill announced to screen readers; it disappears when back online.
- **R5** — iOS Safari, not installed, shows the install hint from the 2nd visit or after 30 s. "Not now" hides it for 30 days. It never shows in the installed app, on other platforms, or when storage throws.
- **R6** — When Chrome fires `beforeinstallprompt`, an "Install app" banner offers the native prompt, and accepting or dismissing it hides the banner.
- **R7** — Accessibility (WCAG 2.1 AA): banners are regions with text labels and real buttons (≥ 44px), the offline pill is text rather than color alone, and nothing covers the nav or relies on hover.

## Acceptance criteria

- **AC1** (R1) — Given `npm run build && npm run preview`, when I open DevTools → Application, then the manifest shows Grimify with start URL `/paints` and a service worker is activated.
- **AC2** (R2, R4) — Given one visit online, when I go offline and reload `/paints`, then the list and search work and the header shows "Offline". `/paints/citadel-base-mephiston-red` also opens.
- **AC3** (R3) — Given the app open, when a new build is deployed (or a changed preview build is served) and I return, then "Update available" shows, and Reload switches to the new version.
- **AC4** (R5) — Given iPhone Safari, on the second visit, then the install hint shows. Tapping "Not now" hides it, and it stays hidden on later visits. It never shows from the home-screen app.
- **AC5** (R4, R7) — Given VoiceOver, when the device goes offline, then "Offline" is announced.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R5 | `decides when to show the iOS install hint` | `src/features/pwa/install-hint.test.ts` | Not iOS, or standalone → never; iOS first visit under 30 s → no; 30 s or 2nd visit → yes; dismissed 29 days ago → no; 31 days → yes |
| T2 | R5 | `treats broken storage as no history` | `src/features/pwa/install-hint.test.ts` | A storage whose `getItem`/`setItem` throw → no exception; counts as first visit |
| T3 | R5, R6, R7 | `shows the iOS hint and remembers Not now` | `src/features/pwa/install-banner.test.tsx` | iOS UA stubbed, 2nd visit → region "Install Grimify" with Share instructions; Not now → hidden and dismissal stored |
| T4 | R6 | `offers the native install prompt` | `src/features/pwa/install-banner.test.tsx` | Dispatching a fake `beforeinstallprompt` → "Install app" button; click → `prompt()` called; banner hidden after the choice |
| T5 | R4 | `tracks online status` | `src/features/pwa/use-online-status.test.ts` | Starts from `navigator.onLine`; `offline` and `online` events flip it |
| T6 | R4, R7 | `shows the Offline pill in the header` | `src/components/app-shell.test.tsx` | `navigator.onLine` false → status text "Offline" in the banner landmark; online → absent |
| T7 | R3 | `prompts to reload when an update is waiting` | `src/features/pwa/update-prompt.test.tsx` | `needRefresh` true → "Update available" + Reload calling `onReload`; Dismiss → hidden; false → nothing rendered |
| E1 | R1, R2, R4 | `works offline after the first visit` | `tests/e2e/offline.spec.ts` | Pixel 7 only (Chromium service workers): visit `/paints`, wait for `navigator.serviceWorker.ready` and control, go offline, reload, search "mephston" → result; "Offline" visible; open a paint deep link → heading shows |

**Not unit testable:**

- R1's manifest validity and AC3's real update flow are checked by hand in DevTools against `npm run preview`.
- AC4 needs a real iPhone, as does AC5's VoiceOver.
- The service worker itself is generated by Workbox; E1 covers its behavior.

## Implementation plan

1. [x] Install `vite-plugin-pwa@2.0.0` (dev, exact). Touches `package.json`, `package-lock.json`.
2. [x] Configure `VitePWA` in `vite.config.ts`: manifest above, `registerType: "prompt"`, workbox `globPatterns` including `json`, `navigateFallback`, dev disabled. Add the PWA client types to `tsconfig.app.json` and the Apple meta tags to `index.html`. Touches `vite.config.ts`, `tsconfig.app.json`, `index.html`.
3. [x] `useOnlineStatus` (`useSyncExternalStore`) with T5; Offline pill in the `AppShell` header with T6. Touches `src/features/pwa/use-online-status.ts`, its test, `src/components/app-shell.tsx`, `app-shell.css`, `app-shell.test.tsx`.
4. [x] Update prompt. The presentational `UpdatePrompt` is tested (T7) without the virtual module. A thin `ServiceWorkerUpdates` container wraps `useRegisterSW` from `virtual:pwa-register/react` and is excluded from unit tests. Touches `src/features/pwa/update-prompt.tsx`, `.css`, `.test.tsx`, `service-worker-updates.tsx`.
5. [x] Install hint:
    - pure `shouldShowIosHint({ isIos, standalone, visits, firstSeenAt, dismissedAt, now })`
    - a safe storage wrapper
    - visit counting
    - `InstallBanner` with the iOS and `beforeinstallprompt` variants

    Tests T1–T4. Touches `src/features/pwa/install-hint.ts`, `install-banner.tsx`, `.css`, and tests.
6. [x] Mount the banners in `AppShell` between the header and `main`. The update prompt sits above the nav bar. Touches `src/components/app-shell.tsx`, `app-shell.css`.
7. [x] E1: `tests/e2e/offline.spec.ts`, restricted to the Pixel 7 project. Touches `tests/e2e/offline.spec.ts`, `playwright.config.ts` if a per-project `testMatch` is needed.
8. [x] Docs. Touches the files listed.
    - **DECISIONS 026:** bugs and follow-ups are tracked in GitHub Issues; work items stay in `docs/implementation-plans/` and link the issue they fix.
    - **CLAUDE.md:** a `bug_tracking` line under Work Item Workflow.
    - **DESIGN_SYSTEM:** §2 icon still TBD (#3); §12 banners and the offline pill as built.
    - **UX_FLOWS:** Flow 1 as built, noting Android install waits for icons.
    - **TESTING:** the offline E2E is Chromium-only.
    - **DEPLOYMENT:** a checklist note that icons are pending (#3).
9. [x] Verify: `npm run check`, `npm run build` (SW and manifest emitted), `npm run test:e2e`, `prettier --check .`. Then AC1 with Playwright: confirm `manifest.webmanifest` content and SW registration via a temporary spec, removed afterwards. Touches nothing.

**Must not change:** routes, search and detail behavior; the catalog loading error for a first visit offline; `npm run dev` (no service worker in dev).

## Risks and open questions

- **Decision needed: `vite-plugin-pwa`.**
- **Stale-app risk:** a precaching service worker can keep serving an old build if `sw.js` itself is cached. Cloudflare Pages' default headers revalidate it, but the deploy item should add explicit `Cache-Control: no-cache` for `/sw.js` in `_headers`. That's flagged in DEPLOYMENT.
- **The update prompt depends on users reloading.** Someone who never taps Reload keeps the old version until all tabs close. That's standard for "prompt" mode, which DECISIONS 002 and ARCHITECTURE §9 chose.
- **iOS detection by user agent is approximate.** iPadOS reports as a Mac, so the check also looks at touch support. A wrong guess only shows or hides a dismissible hint.
- **WebKit service-worker support in Playwright is limited,** so E1 runs on Chromium only, and real iOS offline behavior is a manual check (TESTING §2 already lists it).
- **Without icons (#3), Lighthouse's PWA check fails installability.** That's expected until the artwork arrives; DEPLOYMENT's checklist keeps it visible.
- **Estimate:** 1.5–2 sessions.

## Progress log

- 2026-10-07 — Planned. Decided in conversation: build without icons (issue #3), and track bugs in GitHub Issues (#1, #2, #3 filed).
- 2026-10-07 — Approved as written, including `vite-plugin-pwa`.
- 2026-10-07 — Implementation started in worktree `../grimify-v2-worktrees/story-pwa` on `story/pwa`.
- 2026-10-07 — Steps 1–9 done. `npm run check` (122 tests in 25 files; catalog valid), `npm run build` (17 precache entries, 1.1 MB; main bundle 90 KB gzipped), `npm run test:e2e` (9 passed, 1 skipped: the offline spec on WebKit) and `prettier --check .` exit 0. AC1 checked through a temporary Playwright spec, removed afterwards: the manifest is served as planned, and the service worker registers at scope `/`. Screenshots of the iOS install hint and of an offline reload with the Offline pill checked by eye. Drift:
  - `vite-plugin-pwa` adds 291 dev-only build packages. No existing package changed, and `npm audit --omit=dev` is clean. The 7 dev-only `braces` findings through Stylelint are unchanged from the scaffold.
  - `ServiceWorkerUpdates` mounts in `main.tsx`, not `AppShell`, so the shell's unit tests never load Vite's virtual registration module.
  - E2E specs moved to their own `tsconfig.e2e.json` (Node + DOM types), because `page.evaluate` callbacks run in the browser.
  - The header's Offline pill is a second `status` region, so result-count queries in `paints-screen.test.tsx` and `catalog.spec.ts` now scope to `main`.
  - Self-review fix (`fix(pwa)` commit): the Chrome install banner had ignored the 2nd-visit/30 s timing that UX_FLOWS gives both platforms. The time and dismissal are read once at mount, because React's purity rule rejects `Date.now()` during render.
  - The update prompt's buttons use the default 44px size, not `sm`, per R7.
- 2026-10-07 — Staged. Version 0.5.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/pwa`. Manual checks still open: AC3 (a real update), AC4 on an iPhone, AC5 (VoiceOver), and real-device offline.
- 2026-10-07 — Released. Owner approved the review. Squash-merged 12 commits from `story/pwa` into `main` as 0.5.0 (6a46677), tagged `v0.5.0`. Worktree and branch removed. Icons remain open in issue #3.
