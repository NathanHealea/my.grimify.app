---
type: story
slug: settings-app-update
status: staged
branch: story/settings-app-update
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/story-settings-app-update
created: 2026-10-18
approved: 2026-10-18
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.21.0
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the merge commit
---

# Update the app from Settings

## Summary

When a new version of Grimify is waiting, the "Update available" bar offers Reload or Later, and Later hides it for the session. A user who taps Later, or never notices the bar, has no other way to update until the next launch. Settings → About now shows the version and, when a newer one is waiting, says so with an **Update** button. It also offers **Check for updates** so a user can ask for the newest version without closing the app.

## Context

- Service worker: `vite-plugin-pwa` with `registerType: "prompt"` (`vite.config.ts`; a new version waits until the user agrees). `src/features/pwa/service-worker-updates.tsx` calls `useRegisterSW` from `virtual:pwa-register/react` and renders `UpdatePrompt` (`update-prompt.tsx`: "Update available", **Later**, **Reload**). It's mounted once in `src/main.tsx`, outside `RouterProvider` and `AppProviders`. The virtual module only exists in Vite builds, so the file is kept thin and untested; `UpdatePrompt` is tested through props.
- Settings: `src/features/settings/settings-screen.tsx`, About section shows `Version {__APP_VERSION__}` (`__APP_VERSION__` = `package.json` version via Vite `define`). UX_FLOWS Flow 9.
- `useRegisterSW` returns `needRefresh` and `updateServiceWorker(reloadPage?)`, and takes `onRegisteredSW(swUrl, registration)`; `registration.update()` asks the browser to fetch the service worker again, and a newer one then installs and sets `needRefresh`.
- Online status: `useOnlineStatus()` (`src/features/pwa/use-online-status.ts`).
- The waiting worker's version number isn't known to the page without fetching extra data, so the UI says "A new version is ready" rather than naming it.

## Scope

**In scope**

- One shared update state (ready flag, apply, check) provided from where the worker is registered, used by both the bar and Settings.
- Settings → About: version, update status, **Update** and **Check for updates**.
- Docs: UX_FLOWS Flow 9, `docs/features/pwa.md`, `docs/features/settings.md`.

**Out of scope**

- Showing the new version number or release notes.
- Automatic periodic update checks.
- Changing the bar's behavior.

## Requirements

- **R1** — Settings → About always shows "Version <current>".
- **R2** — When a newer version is waiting, About says "A new version is ready." with an **Update** button that applies it and reloads the app, whether or not the bar was dismissed with Later.
- **R3** — When none is waiting, About offers **Check for updates**. While checking it shows "Checking for updates…" and the button is disabled; afterwards it shows either the R2 state or "You're on the latest version."
- **R4** — Offline, **Check for updates** is disabled with "Connect to the internet to check for updates."; **Update** still works (the new version is already downloaded).
- **R5** — If a check fails, About shows "Couldn't check for updates. Try again." and the button is enabled again.
- **R6** — Status messages are in a polite live region so screen readers announce them; buttons have visible names; the section works at 320 px and 200% text (WCAG 2.1 AA).
- **R7** — The update bar behaves exactly as before.

## Acceptance criteria

- **AC1** (R2) — Given a waiting version and the bar dismissed with Later, when the user opens Settings, then About shows "A new version is ready." and tapping **Update** applies it and reloads.
- **AC2** (R3) — Given no waiting version, when the user taps **Check for updates** and a newer one is found, then About shows "A new version is ready." with **Update**; when none is found, "You're on the latest version."
- **AC3** (R4) — Given the device is offline and no waiting version, then **Check for updates** is disabled and the offline message shows.
- **AC4** (R5) — Given the check fails, then the error message shows and the button is enabled.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R2 | `about shows the version and an update button when one is ready` | `src/features/settings/settings-screen.test.tsx` | With a test update provider (`ready: true`), About shows the version, "A new version is ready." and **Update**; clicking calls `apply`. |
| T2 | R3 | `check for updates reports a found update or the latest version` | `src/features/settings/settings-screen.test.tsx` | `check` pending → "Checking for updates…" and `aria-disabled="true"`; resolves with ready → R2 state; resolves without → "You're on the latest version." |
| T3 | R4 | `check for updates is disabled offline` | `src/features/settings/settings-screen.test.tsx` | Offline (mock `useOnlineStatus`) → button disabled and offline message; with `ready: true` offline, **Update** is enabled. |
| T4 | R5 | `a failed check shows an error and re-enables the button` | `src/features/settings/settings-screen.test.tsx` | `check` rejects → error text, button enabled. |
| T5 | R6 | `update status is announced` | `src/features/settings/settings-screen.test.tsx` | The status text is inside an element with `role="status"` present before the text changes; buttons found by name. |
| T6 | R3 | `checkForUpdate asks the registration to update and reports whether one is waiting` | `src/features/pwa/update-state.test.ts` | Pure helper with a fake registration: calls `update()`, resolves `true` when `waiting`/`installing` ends in a waiting worker, `false` otherwise, rejects when `update()` rejects, no registration exists, or `update()` never settles within the timeout; leaves no timer behind. |
| T8 | R3, R6 | `focus stays on check for updates while checking and moves to update when one is found` | `src/features/settings/settings-screen.test.tsx` | While checking the button keeps focus, isn't natively disabled and extra clicks don't start a second check; a found update moves focus to **Update**. |
| T9 | R3 | `UpdateStateProvider` | `src/features/pwa/update-state.test.ts` | `check` is `null` with no registration; with one, `check` calls `update()`. |
| T7 | R7 | existing `update-prompt.test.tsx` | `src/features/pwa/update-prompt.test.tsx` | Unchanged and passing. |

| T10 | R1, R4 | `about offers no update controls without a service worker` | `src/features/settings/settings-screen.test.tsx` | No provider, offline: version only, no buttons, empty status. |
| T11 | R4, R5 | `going offline after a failed check shows the offline message` | `src/features/settings/settings-screen.test.tsx` | Offline message replaces the failure message; button disabled. |
| T12 | R2, R3 | `an update that becomes ready during a check is announced as ready` | `src/features/settings/settings-screen.test.tsx` | `ready` turning true mid-check shows "A new version is ready." with Update. |

**Not unit testable:** the real service worker swap (`useRegisterSW`, `updateServiceWorker`) lives in the virtual module; verify by hand: deploy to dev, keep a tab open, deploy again, tap Later on the bar, open Settings → Update reloads to the new version; and Check for updates finds a deploy made while the tab was open. 320 px / 200% text checked by hand.

## Implementation plan

1. [x] Add the shared update state: a context with `ready`, `apply` and `check`, the pure `checkForUpdate(registration)` helper, and a provider fed by `useRegisterSW` that also renders the bar — touches `src/features/pwa/update-state.tsx`, `src/features/pwa/update-state.test.ts`, `src/features/pwa/service-worker-updates.tsx`, `src/main.tsx` — tests T6, T7
2. [x] Show version, status, Update and Check for updates in Settings → About — touches `src/features/settings/settings-screen.tsx`, `src/features/settings/settings-screen.css`, `src/features/settings/settings-screen.test.tsx` — tests T1, T2, T3, T4, T5
3. [x] Document the Settings update path — touches `docs/UX_FLOWS.md`, `docs/features/pwa.md`, `docs/features/settings.md` — tests none (docs only)

**Must not change:** `registerType: "prompt"`; the update bar's text, buttons and dismissal; `__APP_VERSION__`.

**High-risk steps:** None.

## Risks and open questions

- **Provider placement.** `ServiceWorkerUpdates` sits outside `RouterProvider`; the provider must wrap both the router and the bar in `main.tsx`, and Settings must get a safe default (`ready: false`, check unavailable) when no provider is mounted (tests, and dev where the worker may not register).
- **Check for updates is proposed.** The request asks for updating from Settings; the check button is added so a user can pull a version the page hasn't noticed yet. Drop R3–R5 if you only want the Update button.
- **Detecting the result of a check.** `registration.update()` resolves before the new worker finishes installing; the helper waits for an installing worker to reach `installed` (or for none) before reporting, with a timeout. Behavior differs slightly across browsers; iOS Safari is the one to check by hand.

## Progress log

- 2026-10-18 — Planned.
- 2026-10-18 — Plan approved.
- 2026-10-18 — Started on branch story/settings-app-update from origin/dev.
- 2026-10-18 — Built all three steps. Docs step also updated docs/features/app-shell-ui.md and docs/SYSTEM_MAP.md, which described the old provider order.
- 2026-10-18 — Review fixes: Check for updates keeps focus while checking (aria-disabled) and focus moves to Update when found; check is null until a service worker registers; the 30 s deadline covers registration.update(); About update buttons wrap. Added T8, T9 and timeout tests to T6.
- 2026-10-18 — Review cycle 2: fixes sound, 2 LOW focus notes left for the owner. Test audit: 3 tests added (T10-T12), 2 low/equivalent survivors
- 2026-10-18 — Staged: verification passed; version 0.20.4 → 0.21.0; no changelog file.
