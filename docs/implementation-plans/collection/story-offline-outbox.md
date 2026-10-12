---
type: story
slug: offline-outbox
status: released
branch: story/offline-outbox
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-offline-outbox
created: 2026-10-08
approved: 2026-10-08
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.9.0
review_approved: 2026-10-08
pr:                  # set by `wi pr`
tag: v0.9.0
---

# Offline outbox

## Summary

Make Own, Want and Favorite work offline. Each change is saved on the phone first, shown immediately, survives a reload or app close, and syncs to Convex when the connection and sign-in are back. A header badge says "n changes waiting to sync". My Paints shows the last-known collection when the app opens offline. The server keeps a timestamped row when all three flags are cleared, so an older queued change can no longer bring a paint back (closes #4).

## Context

ROADMAP NOW: "Offline outbox for Own/Want/Favorite changes". The docs already fix most of the behavior:

- **DECISIONS 010:** IndexedDB outbox, replayed through the idempotent `userPaints.set` with last-write-wins on `clientUpdatedAt`.
- **API.md §2b:**
  - Each change goes to an IndexedDB outbox (`idb-keyval`) and to the local cached collection.
  - Entries are flushed in order and removed only after success.
  - Duplicates for one paint are collapsed.
  - A "n changes waiting to sync" indicator shows.
  - Sign-out with a non-empty outbox warns first.
- **ARCHITECTURE §Data flow, step 7:** a validation error drops the entry and reverts the toggle, with a toast. Network errors stay queued.
- **PRD Feature 3:**
  - "Collection is viewable offline (cached)".
  - "Same paint changed on two devices while one was offline → the most recent change wins".
- **TESTING §2:** outbox tests for queue, collapse, flush order, keep on network error and drop on validation error. **TESTING §5:** "Offline toggle: go offline, mark a paint owned, go online → change synced".
- **GitHub issue #4:** `set` deletes the row when every flag is false, which loses its timestamp, so an older queued change re-creates it. The issue suggests keeping the row as a tombstone (a row kept with every flag false, only to hold its timestamp).

Current code (v0.8.0):

- `useSetPaintFlags` (`src/features/collection/use-set-paint-flags.ts`) calls `userPaints.set` with a Convex optimistic update. If the page closes before Convex sends the change, it's lost. This was seen in the My Paints E2E run, where an un-own sent 9 ms before a reload never arrived.
- `CollectionProvider` subscribes to `listMine` only once Convex is authenticated.
- `SignInProvider` holds one pending tap in memory while Clerk is signed in but Convex isn't authenticated yet.

**Checked on 2026-10-08 with a throwaway Playwright probe (Pixel 7, signed in, service worker active, then offline and reload).**
- Clerk's script loads from Clerk's servers, so offline `window.Clerk` is undefined and never loads.
- My Paints showed "Loading your paints…" with no end.
- Tapping Own showed "Signing in needs an internet connection." even though the user is signed in.

Today, then, a signed-in painter who opens the app offline has neither a collection nor a way to make a change. Remembering who was signed in on this device is part of making the outbox work at all.

## Defaults (change any)

- **One device store in IndexedDB** (`idb-keyval`, as API.md names it), holding a single record:
  - `userId`: the Clerk user ID, an opaque `user_…` string
  - `rows`: the last `listMine` answer
  - `outbox`: one entry per paint

  It's written whenever `listMine` answers or the outbox changes.
- **Collapsing:** a new change to a paint already in the outbox merges its flags into that entry and takes the newer `clientUpdatedAt`. That fits the server's existing row-level last-write-wins.
- **What the screen shows:** the live `listMine` answer, or the cached `rows` when the live answer hasn't arrived for this user. Pending outbox entries are applied on top. Convex's own optimistic update is removed, so the outbox is the only source of pending state.
- **Flushing:**
  - Runs when Convex is authenticated and the `users` row exists (`users.me` non-null, the same gate `SignInProvider` uses).
  - Triggers: after each change, when that gate opens, and on the browser's `online` event.
  - Sends one entry at a time, oldest first.
  - While offline, Convex's client holds the call until it reconnects.
- **Errors:**
  - `INVALID_PAINT_ID`, `NO_FLAGS` and `CLOCK_IN_FUTURE` drop the entry, so the toggle reverts. The toast says "Couldn't save that change."
  - Any other failure, including `UNAUTHENTICATED`, keeps the entry for the next trigger.
- **Who counts as signed in for the collection:**
  - Clerk loaded and signed in uses Clerk's user.
  - Clerk not loaded (offline launch, or the first second online) uses the stored `userId`.
  - Clerk loaded and signed out hides the cached collection. The outbox is kept for the same user to sync after signing in again, for example after an expired session.
  - A different user signing in on the device discards the stored record before anything shows.
- **Sign out:** with pending changes, a confirmation dialog appears: "2 changes haven't synced. Sign out and discard them?" with Cancel and Sign out. Signing out clears the device store.
- **Badge:** "1 change waiting to sync" / "n changes waiting to sync" in the header, beside the Offline pill and in the same pill style.
- **Tombstones (#4):**
  - `set` never deletes. When every flag ends up false, it keeps the row (or inserts one) with its `updatedAt`.
  - `listMine` leaves out rows with every flag false.
  - Rows stay bounded at one per user and paint, so at most 2,837.
- **The signed-in-but-Convex-not-ready tap** goes into the outbox instead of `SignInProvider`'s in-memory slot. The signed-out "tap → sign in → apply" handoff (DECISIONS 030) is unchanged.

## Dependencies (need your approval)

| Package | Version | Kind | Why |
|---|---|---|---|
| idb-keyval | 6.3.0 | runtime | Promise-based IndexedDB get/set, named in API.md §2b; Apache-2.0, no dependencies |

## Scope

**In scope**

- Tombstones in `userPaints.set` and `listMine` (closes #4)
- Device store, outbox, cached collection, offline identity
- `useSetPaintFlags` writes through the outbox; flush runner
- Toggles queue for a known user while offline; `SignInProvider`'s signed-in queue is retired
- My Paints shows the cached collection offline
- Header "waiting to sync" badge
- Sign-out confirmation when changes are pending
- Offline E2E journey
- Docs

**Out of scope**

- Issue #5 (toggles look off while the collection first loads). The cache hides it after the first load on a device, but a first-ever load still shows it.
- Retrying Clerk's script after an offline launch. See risk 3.
- Delete account (Settings item)
- Background Sync API (it doesn't work on iOS Safari)

## Requirements

- **R1** — `userPaints.set` never deletes. When every flag ends up false, it keeps or inserts the row with `updatedAt = clientUpdatedAt`. A later-arriving change with an older `clientUpdatedAt` is ignored. `listMine` leaves out rows with every flag false. Arguments, return value and errors are unchanged.
- **R2** — Every Own, Want or Favorite change by a known user is written to the device's outbox, shown immediately, and still pending after a reload or app restart.
- **R3** — Changes to one paint are collapsed into one entry: flags merged, newest `clientUpdatedAt` kept.
- **R4** — When Convex is authenticated and the user row exists, entries are sent oldest first through `userPaints.set`. Each is removed only after the call succeeds.
- **R5** — A validation error (`INVALID_PAINT_ID`, `NO_FLAGS`, `CLOCK_IN_FUTURE`) drops the entry, reverts the toggle and shows the toast "Couldn't save that change." Any other failure keeps the entry for retry.
- **R6** — The last collection loaded on this device is shown, with pending changes applied, whenever the live collection hasn't answered for the same user. That includes an offline launch, where My Paints shows the cached collection instead of loading forever.
- **R7** — Offline, with Clerk not loaded and a stored user, toggles queue changes instead of showing "Signing in needs an internet connection."
- **R8** — If a different user signs in, the previous user's stored collection and outbox are discarded before anything shows. If Clerk loads signed out, the cached collection is hidden.
- **R9** — While the outbox isn't empty, the header shows "1 change waiting to sync" or "n changes waiting to sync" in a `status` live region. It disappears when the outbox empties.
- **R10** — Sign out with pending changes asks "n change(s) haven't synced. Sign out and discard them?". Cancel keeps everything; Sign out clears the device store and signs out. With no pending changes, Sign out acts immediately and still clears the store.
- **R11** — Accessibility (WCAG 2.1 AA):
  - The badge is text in a `status` region, using only tokens.
  - The sign-out dialog is modal, with a title, a focus trap and Escape, and focus returns to Sign out.
  - All controls are at least 44px.

## Acceptance criteria

- **AC1** (R1) — Given Mephiston Red owned at 10:00 on phone A while offline, and un-owned at 10:05 on phone B, when phone A reconnects, then Mephiston Red stays un-owned on both.
- **AC2** (R2, R6, R7, R9) — Given I'm signed in and the app is cached, when I go offline, reload, open My Paints and own a paint, then I see my collection (not "Loading…"), the paint is owned, and the header says "1 change waiting to sync".
- **AC3** (R4, R9) — Given that pending change, when the connection returns and the app is open (or I reopen it online), then the badge disappears and a fresh load on another device shows the paint owned.
- **AC4** (R3) — Given I own then un-own a paint offline, when I look at the badge, then it says 1 change, not 2.
- **AC5** (R10) — Given 2 pending changes, when I tap Sign out, then a dialog asks to discard 2 changes. Cancel keeps them; Sign out clears them and signs me out.
- **AC6** (R8) — Given user A's data on the device, when user B signs in, then B never sees A's paints.
- **AC7** (R11) — Given VoiceOver, when a change is queued, then "1 change waiting to sync" is announced.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `ignores an older change after every flag is cleared` (regression, #4) | `convex/userPaints.test.ts` | owned@5, all false@20, owned@10 → `listMine` is `[]`. Fails on current code |
| T2 | R1 | `keeps a cleared row as a tombstone` | `convex/userPaints.test.ts` | All-false keeps one row with `updatedAt`; all-false on no row inserts one; `listMine` leaves both out; re-setting a flag later revives the row |
| T3 | R3 | `collapses changes to one paint` | `src/features/collection/outbox.test.ts` | Own then un-own → 1 entry, merged flags, newest time; other paints untouched |
| T4 | R2 | `persists the device record` | `src/features/collection/device-store.test.ts` | Round-trips `{ userId, rows, outbox }` through the `idb-keyval` boundary (mocked); clear removes it |
| T5 | R4 | `flushes oldest first and removes after success` | `src/features/collection/outbox.test.ts` | Sends are called in time order; an entry is removed only after its send resolves; a change made mid-flush is kept |
| T6 | R5 | `drops validation errors and keeps the rest` | `src/features/collection/outbox.test.ts` | `ConvexError("NO_FLAGS")` → dropped, reported; network or `UNAUTHENTICATED` error → kept, flush stops |
| T7 | R2, R6 | `shows cached and pending flags` | `src/features/collection/collection-provider.test.tsx` | Live query skipped and a stored record for the same user → not loading, cached rows with outbox applied; live answer replaces cache and is written back |
| T8 | R7, R8 | `resolves the device user` | `src/features/collection/collection-provider.test.tsx` | Clerk not loaded → stored user; Clerk signed in as another user → store cleared, nothing shown; Clerk signed out → no collection shown, outbox kept |
| T9 | R2, R5 | `writes through the outbox` | `src/features/collection/use-set-paint-flags.test.tsx` | Enqueues and triggers a flush; a dropped entry shows "Couldn't save that change."; throws with no known user |
| T10 | R7 | `queues while offline for a known user` | `src/features/collection/paint-toggles.test.tsx` | Clerk not loaded, offline, stored user → `setFlags` called; no toast, no sign-in |
| T11 | R10 | `confirms before discarding pending changes` | `src/features/auth/account-section.test.tsx` | 2 pending → dialog with count; Cancel → no sign-out; Sign out → store cleared and `signOut` called; 0 pending → immediate sign-out and clear |
| T12 | R9, R11 | `shows how many changes are waiting` | `src/components/app-shell.test.tsx` | 0 → status region empty; 1 → "1 change waiting to sync"; 3 → "3 changes waiting to sync" |
| T13 | R6 | `shows the cached collection offline` | `src/features/collection/my-paints-screen.test.tsx` | Clerk not loaded and a stored record → tabs with cached counts, not "Loading your paints…" |
| E1 | R2, R4, R6, R7, R9 | `queues a change offline and syncs it` | `tests/e2e/collection.spec.ts` | Chromium only: sign in, load My Paints, go offline, reload, own a paint, see the badge, reload offline (still owned), go online and reload, badge gone; a fresh context shows it owned; cleanup |

**Not unit testable:**
- R11's VoiceOver announcement and dialog focus behavior on a real phone are manual checks.
- Installed-PWA offline launch on iOS is a manual check, because Playwright WebKit can't run the service worker (TESTING §6).

## Implementation plan

1. [x] Tombstones in `set` and `listMine`; read `convex/_generated/ai/guidelines.md` first — touches `convex/userPaints.ts`, `convex/userPaints.test.ts` — tests T1, T2
2. [x] Add `idb-keyval@6.3.0` (exact) and the device store module — touches `package.json`, `package-lock.json`, `src/features/collection/device-store.ts`, `src/features/collection/device-store.test.ts` — tests T4
3. [x] Pure outbox logic: merge, apply to rows, flush with an injected send — touches `src/features/collection/outbox.ts`, `src/features/collection/outbox.test.ts` — tests T3, T5, T6
4. [x] `CollectionProvider` resolves the device user, reads and writes the cache, overlays the outbox and runs the flush; `useSetPaintFlags` enqueues; Convex optimistic update removed — touches `src/features/collection/collection-provider.tsx`, `src/features/collection/collection-provider.test.tsx`, `src/features/collection/use-set-paint-flags.ts`, `src/features/collection/use-set-paint-flags.test.tsx` — tests T7, T8, T9
5. [x] Toggles queue for a known user offline; retire `SignInProvider`'s signed-in queue — touches `src/features/collection/paint-toggles.tsx`, `src/features/collection/paint-toggles.test.tsx`, `src/features/auth/sign-in-provider.tsx`, `src/features/auth/sign-in-provider.test.tsx` — tests T10
6. [x] My Paints uses the device user, not Clerk alone, so it renders offline — touches `src/features/collection/my-paints-screen.tsx`, `src/features/collection/my-paints-screen.test.tsx` — tests T13
7. [x] Header "waiting to sync" badge — touches `src/components/app-shell.tsx`, `src/components/app-shell.css`, `src/components/app-shell.test.tsx` — tests T12
8. [x] Sign-out confirmation and store clearing — touches `src/features/auth/account-section.tsx`, `src/features/auth/account-section.css`, `src/features/auth/account-section.test.tsx` — tests T11
9. [x] Offline E2E journey — touches `tests/e2e/collection.spec.ts` — tests E1
10. [x] Docs:
    - **DECISIONS 035:** tombstones, closes #4.
    - **DECISIONS 036:** a device store with the Clerk user ID for offline identity and cache.
    - **API §2b** and **DATABASE:** tombstones.
    - **SECURITY:** device store contents.
    - **ARCHITECTURE:** data flow.
    - **UX_FLOWS:** Flow 5 offline, sign-out.
    - **DESIGN_SYSTEM:** badge and dialog.
    - **TESTING.**

    Touches `docs/DECISIONS.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/UX_FLOWS.md`, `docs/DESIGN_SYSTEM.md`, `docs/TESTING.md` — tests none (docs only)

**Must not change:**
- `userPaints.set` arguments, return value and error codes.
- `listMine`'s row shape.
- `useSetPaintFlags(paintId, change)` as the only write path.
- The URL parameters.
- The signed-out sign-in handoff (DECISIONS 030).

**High-risk steps:**
- **Step 1:** it changes deletion semantics on stored user data. Rows are no longer deleted. A revert would be harmless, since old code ignores all-false rows' flags, but tombstones written meanwhile stay.
- **Step 4:** it decides on the client who counts as signed in for showing and queuing data. Server authorization is unchanged; every write still goes through `requireUser`.
- **Step 8:** it discards unsynced local data on sign-out.

## Risks and open questions

1. **Decision needed: `idb-keyval@6.3.0`.** API.md already names it. Without it, the alternative is ~60 lines of raw IndexedDB, or `localStorage` (synchronous, ~5 MB is plenty), which would mean a DECISIONS change from IndexedDB.
2. **Decision needed: store the Clerk user ID on the device.**
   - SECURITY currently says the outbox holds "no tokens or personal data".
   - Without the ID, an offline launch can't tell whose cache and outbox it is, which is the safety check behind R8.
   - The ID is opaque (`user_…`), with no email or name, and is cleared on sign-out.
   - My recommendation: yes, with SECURITY updated.
3. **Clerk after an offline launch.** Clerk's script fails to load offline, and I don't know whether `@clerk/react` 6.17.6 retries when the connection returns. If it doesn't, changes made after an offline launch sync on the next online launch, and the badge shows until then. I'll check during step 4. If Clerk doesn't recover, I'll raise it as a follow-up issue rather than reload the page automatically.
4. **Row-level last-write-wins.**
   - A merged entry carries its newest time for every flag in it.
   - Another device's newer change to a different flag of the same paint still wins the whole row, which is today's rule (DECISIONS 010).
5. **Tombstones never go away.** At most one per user and paint (2,837). Delete account (Settings item) removes them with everything else.
6. **iOS storage eviction.** Safari can clear site storage for non-installed sites after 7 days without use. An unsynced outbox in a browser tab could be lost that way, while installed PWAs are exempt. Documented, not solved.
7. **Removing Convex's optimistic update.** The outbox overlay must cover every case it did. T7 and T9 assert the toggle changes immediately, and the E2E checks it end to end.
8. **Estimate:** 2–3 sessions; step 4 is most of it.
8. **Found in build: no stored user before the first collection load.** The device record is written when `listMine` first answers. Someone who signs in and goes offline before that has no stored user, so an offline tap shows "Signing in needs an internet connection." instead of queuing. Matches R7 ("known user"); E1 waits for the collection before going offline.
9. **Checked in build: Clerk recovers without a reload.** Offline reload, then back online: Clerk and Convex reconnected in about 1s and the queued change synced (exploratory Playwright run, short outage). A long outage past the session token's life is untested.

## Progress log

- 2026-10-08 — Planned. Probe: an offline reload leaves Clerk unloaded and My Paints loading forever, so offline identity and the cached collection are in scope.
- 2026-10-08 — Plan approved.
- 2026-10-08 — Approved with both decisions: add idb-keyval 6.3.0, and store the Clerk user ID on the device (SECURITY to be updated).
- 2026-10-08 — Started on branch story/offline-outbox from origin/main.
- 2026-10-08 — Step 4 landed. Drift: DeviceRecord.rows is optional (absent until the first listMine answer), device-store functions are async, src/test/setup.ts mocks idb-keyval in memory, and the My Paints test mock now has a Clerk user ID. The check of whether Clerk retries after an offline launch moves to the E2E in step 9, since it needs a browser.
- 2026-10-08 — Build done: steps 1-10 landed; wi verify passes (170 unit tests, build). E1 passes on Pixel 7 (skipped on iPhone 15 by design). Added risks 8-9 from the build.
- 2026-10-08 — Staged: verification passed; version 0.8.0 → 0.9.0; no changelog file.
- 2026-10-08 — Review approved.
- 2026-10-08 — Released 0.9.0 as v0.9.0.
