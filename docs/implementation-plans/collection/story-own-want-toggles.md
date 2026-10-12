---
type: story
slug: own-want-toggles
status: released
branch: story/own-want-toggles
worktree_path: ../grimify-v2-worktrees/story-own-want-toggles
created: 2026-10-07
approved: 2026-10-07
version: 0.7.0
tag: v0.7.0
merge_commit: 65dc900 (squash of story/own-want-toggles)
---

# Own/Want toggles

## Summary

Let a signed-in painter mark any paint as owned and/or wanted, from the Paints list, the equivalents list and the paint detail screen (PRD Feature 3, UX_FLOWS Flow 5, DECISIONS 011). It adds the `userPaints` table and its two functions, the single write path `useSetPaintFlags` that the offline outbox item will extend, and the toggles themselves. Tapping a toggle while signed out opens sign-in and finishes the tap afterwards. The My Paints tab is the next item.

## Context

ROADMAP NOW: "Own / Want toggles (independent) + My Paints tab". The owner agreed on 2026-10-07 to split it into this item and "My Paints tab" (Owned/Wishlist views, the sheet's Owned/Wishlist filter, and the first signed-in E2E).

Already in place:

- **Auth (v0.6.0):** Clerk sign-in; Convex `users` (only `tokenIdentifier`); `requireUser`; `users.store` and `users.me`; `StoreUser` runs once per signed-in session. The sign-in sheet lives inside Settings' `AccountSection`, with `forceRedirectUrl="/settings"`.
- **`PaintRow`:** one `<Link>` wrapping swatch, text and badges. It's used by the Paints list and by equivalents on the detail screen.

What the docs fix:

- **API `userPaints.set`:**
  - Arguments `{ paintId, owned?, wishlisted?, clientUpdatedAt }`; it returns `null`.
  - Last-write-wins on `clientUpdatedAt`. Inserts with missing flags `false`; deletes the row when both flags end up `false`. Idempotent.
  - Validation: `paintId` matches `^[a-z0-9-]{3,100}$`; at least one flag given; `clientUpdatedAt` no more than 5 minutes in the future.
- **API `userPaints.listMine`:** returns `[]` when signed out, otherwise `{ paintId, owned, wishlisted, updatedAt }[]`.
- **DATABASE §4:** the `userPaints` fields.
- **DESIGN_SYSTEM:**
  - §8: icon toggle buttons with `aria-pressed`, filled when active.
  - §12: toggles render when signed out and open sign-in; optimistic, with no toast for routine toggles.
  - §15: labels like "Mark Mephiston Red as owned".
- **UX_FLOWS Flow 5:** on error the toggle reverts, and a toast says "Couldn't save. Check your connection."
- **PRD Feature 2:** owned equivalents show "You own this".
- **AGENTS:** collection writes only through `useSetPaintFlags`, never `userPaints.set` directly.
- **Convex guidelines:**
  - Index names list every field, so `by_userId` and `by_userId_and_paintId`, not DATABASE's `by_user` and `by_user_paint`.
  - Queries are bounded.
  - Never take a user ID as an argument.

## Defaults the docs leave open (change any)

- **Toast: a small in-app component, not shadcn Sonner.** DESIGN_SYSTEM §12 names Sonner, but the only toast in the MVP is "Couldn't save". A ~40-line `aria-live` toast avoids the `sonner` dependency and its styling conversion. Sonner remains the upgrade if more toast types appear.
- **Icons:** Own is a check in a circle (`CircleCheck`), and Want is a heart (`Heart`). Active toggles are filled with Primary, with the icon in Primary foreground. Inactive toggles are outlined in `--color-input-border` (3:1, a control boundary). The filled shape is the non-color cue.
- **Signed-out handoff:** tapping a toggle while signed out remembers that one action and opens the sign-in sheet. After sign-in, it applies the action once the `users` row exists (`users.me` non-null), so `set` never races `store`. Closing the sheet without signing in drops it.
- **Sign-in sheet becomes app-wide:** one sheet controlled from a provider, so any toggle and Settings can open it. After sign-in it returns to the current page, not `/settings`.
- **`listMine` is bounded at 5,000 rows.** That's well over the catalog's 2,837 paints, since a user has at most one row per paint.
- **"You own this"** shows as text on owned paints in the equivalents list only, the case PRD names. In the main list the pressed Own toggle already says it.

## Scope

**In scope**

- `userPaints` schema; `userPaints.set` and `userPaints.listMine`; Convex tests
- `CollectionProvider`: subscribes to `listMine` and exposes each paint's flags
- `useSetPaintFlags`: the only write path, with a Convex optimistic update on `listMine`; reverts and toasts on failure
- `PaintToggles` component; `PaintRow` restructured so the link and toggles are siblings; toggles on the detail screen
- App-wide sign-in sheet with the pending-action handoff; Settings uses it
- `Toast` component and a minimal toast provider
- "You own this" on equivalents
- Docs

**Out of scope**

- My Paints tab, the Owned/Wishlist filter, signed-in E2E (next item)
- Offline outbox, persisted queue, "n changes waiting to sync" (outbox item). Until then, Convex's client keeps unsent mutations in memory while disconnected and sends them on reconnect, but they're lost if the app is closed first.
- Delete account (Settings item)

## Requirements

- **R1** — `userPaints.set` behaves exactly as API.md specifies (insert, update, independent flags, delete when both false, last-write-wins, idempotent, validation errors). It derives the user with `requireUser` and never accepts a user ID.
- **R2** — `userPaints.listMine` returns the caller's rows only, `[]` when signed out or not stored, at most 5,000.
- **R3** — Every paint row (Paints list and equivalents) and the detail screen show an Own and a Want toggle:
  - Each is a 44px button with `aria-pressed` and a name like "Mark Mephiston Red as owned".
  - Pressed toggles are filled; unpressed ones are outlined at 3:1.
  - The row's link still opens the paint, and the toggles never trigger it.
- **R4** — Signed in, tapping a toggle updates it immediately, persists through `useSetPaintFlags`, and survives reload. Own and Want change independently.
- **R5** — If a save fails, the toggle returns to its previous state and a toast says "Couldn't save. Check your connection." It's announced politely and dismissable.
- **R6** — Signed out, tapping a toggle opens the sign-in sheet. After signing in, that one action is applied without a second tap. Closing the sheet instead changes nothing.
- **R7** — On the detail screen, an equivalent the user owns shows "You own this".
- **R8** — Every collection write in the app goes through `useSetPaintFlags`; nothing else calls `userPaints.set`.

## Acceptance criteria

- **AC1** (R3, R4) — Given I'm signed in on `/paints`, when I tap Own on Mephiston Red, then it fills immediately; after a reload it's still filled. Tapping Want too leaves Own filled.
- **AC2** (R4) — Given Own and Want both on, when I tap both off, then the Convex `userPaints` row for that paint is gone.
- **AC3** (R6) — Given I'm signed out, when I tap Want on a paint, then the sign-in sheet opens; after entering the code, the sheet closes and that paint's Want is on.
- **AC4** (R5) — Given DevTools blocks `*.convex.cloud`, when I tap Own, then it reverts and the toast appears.
- **AC5** (R7) — Given I own Vallejo Blood Red, when I open Mephiston Red, then Blood Red in the Vallejo equivalents says "You own this".
- **AC6** (R3) — Given VoiceOver, when I move through a row, then I hear the paint link, then "Mark Mephiston Red as owned, toggle button, not pressed", then the Want toggle.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `inserts, updates and deletes a user's paint flags` | `convex/userPaints.test.ts` | Set owned → row with `owned: true, wishlisted: false`; set wishlisted → both true on one row; both false → row deleted |
| T2 | R1 | `applies last-write-wins and is idempotent` | `convex/userPaints.test.ts` | An older `clientUpdatedAt` after a newer one is ignored; replaying the same call changes nothing |
| T3 | R1 | `validates arguments` | `convex/userPaints.test.ts` | Bad `paintId`, no flags, and `clientUpdatedAt` more than 5 min ahead each throw; 4 min ahead is accepted |
| T4 | R1, R2 | `keeps users apart and requires sign-in` | `convex/userPaints.test.ts` | Signed out: `set` throws UNAUTHENTICATED and `listMine` returns `[]`; user B never sees or changes user A's rows |
| T5 | R4, R5, R8 | `updates optimistically and reverts with a toast on failure` | `src/features/collection/use-set-paint-flags.test.tsx` | Calls the mutation with `clientUpdatedAt` from the clock; on rejection, shows the "Couldn't save" toast; never called while signed out |
| T6 | R3, R6 | `renders accessible toggles and hands off when signed out` | `src/features/collection/paint-toggles.test.tsx` | Names and `aria-pressed` follow the flags; signed in → click calls `setFlags`; signed out → click opens the sign-in sheet and records the pending action |
| T7 | R6 | `applies the pending action after sign-in` | `src/features/auth/sign-in-provider.test.tsx` | A pending action plus `users.me` turning non-null → `setFlags` called once; closing the sheet first → never called |
| T8 | R3 | `keeps the row link and toggles separate` | `src/components/paint-row.test.tsx` | The row has one link to the detail and two toggle buttons outside it |
| T9 | R5 | `announces and dismisses the toast` | `src/components/ui/toast.test.tsx` | Message in a `status` region; Dismiss removes it; it auto-hides after its timeout |
| T10 | R7 | `marks owned equivalents` | `src/features/catalog/paint-detail.test.tsx` | Collection with an owned equivalent → "You own this" on that row only |

**Not unit testable:**

- Real sign-in plus a toggle (AC3), sync across two devices, and VoiceOver (AC6) are manual.
- The signed-in E2E arrives with the My Paints item.

## Implementation plan

1. [x] Schema and functions, with T1–T4: `userPaints` table (`userId`, `paintId`, `owned`, `wishlisted`, `updatedAt`, indexes `by_userId` and `by_userId_and_paintId`), `userPaints.set` and `userPaints.listMine`. Push to the dev deployment (`npx convex dev --once`, announced). Touches `convex/schema.ts`, `convex/userPaints.ts`, `convex/userPaints.test.ts`, `convex/_generated` (regenerated).
2. [x] Toast component and provider, with T9. Touches `src/components/ui/toast.tsx`, `toast.css`, `toast.test.tsx`, `src/features/feedback/toast-provider.tsx`.
3. [x] `CollectionProvider` (`useQuery(api.userPaints.listMine)` → a map of paint ID to flags, exposed with `useCollection()` and `usePaintFlags(paintId)`) and `useSetPaintFlags` (optimistic update on `listMine`, error → toast), with T5. Touches `src/features/collection/collection-provider.tsx`, `use-set-paint-flags.ts`, `use-set-paint-flags.test.tsx`.
4. [x] App-wide sign-in: `SignInProvider` owns the sheet's open state and one pending action; it applies it after `users.me` becomes non-null. `SignInSheet` becomes controlled, and Settings' Sign in uses `useSignIn().open()`. `forceRedirectUrl` is the current location. T7. Touches `src/features/auth/sign-in-provider.tsx`, `sign-in-sheet.tsx`, `account-section.tsx` and tests.
5. [x] `PaintToggles` (T6), and `PaintRow` restructured so the `<li>` holds the link and the toggles side by side (T8). Toggles on the detail screen under the facts, and "You own this" on equivalents (T10). Touches `src/features/collection/paint-toggles.tsx`, `.css`, `.test.tsx`, `src/components/paint-row.tsx`, `.css`, `.test.tsx`, `src/features/catalog/paint-detail.tsx`, `.css`, `.test.tsx`.
6. [x] Mount the providers in `main.tsx` inside the Convex provider: toast, collection, sign-in. Update `src/test/setup.ts` and the route test helper so screens render with stub providers (signed out, empty collection). Touches `src/main.tsx`, `src/test/setup.ts`, `src/test/render-route.tsx`.
7. [x] Docs. Touches the files listed.
    - **DECISIONS 029:** in-app toast instead of Sonner.
    - **DECISIONS 030:** the signed-out handoff and the app-wide sign-in sheet.
    - **DATABASE §4 and §7:** `userPaints` index names.
    - **API:** `listMine` bound; index names.
    - **DESIGN_SYSTEM:** §8 toggles as built, §10 row layout, §12 toast.
    - **UX_FLOWS:** Flow 4 step 4 and Flow 5 as built.
8. [x] Verify: `npm run check`, `npm run build`, `npm run test:e2e` (existing journeys, signed out), `prettier --check .`, and screenshots of rows and the detail screen (signed out) through a temporary spec. Then your manual signed-in check (AC1–AC5). Touches nothing.

**Must not change:** search, filters, detail and offline behavior; `users` functions; `requireUser`'s contract.

## Risks and open questions

- **The defaults above,** especially the in-app toast instead of Sonner (DESIGN_SYSTEM §12 names Sonner).
- **Row width at 320px:** swatch, text and two 44px toggles leave about 130px for the name and meta; long names wrap to two lines. That's acceptable, but worth checking on a small phone.
- **Offline gap until the outbox item:** a toggle tapped offline is held in memory by Convex's client and sent on reconnect, but it's lost if the app is closed first. PRD's offline promise lands with the outbox item, which is next after My Paints.
- **The handoff waits for `users.me`:** if storing the user fails, the pending action never runs. It's dropped when the sheet closes, and the error is logged.
- **Equivalents rows get toggles too,** which adds about 30 buttons to a detail page. That's fine for keyboard and screen-reader users because rows are lists with headings, but it's worth listening to with VoiceOver.
- **Estimate:** 2 sessions.

## Progress log

- 2026-10-07 — Planned. Decided in conversation: split the ROADMAP item into Own/Want toggles (this) and My Paints tab.
- 2026-10-07 — Approved as written, including the four defaults (in-app toast, icons, app-wide sign-in sheet, `listMine` bound).
- 2026-10-07 — Implementation started in worktree `../grimify-v2-worktrees/story-own-want-toggles` on `story/own-want-toggles`; `.env.local` copied in (gitignored).
- 2026-10-07 — Steps 1–8 done, except the manual signed-in check (AC1–AC5). `npm run check` (144 tests in 34 files; 8 Convex), `npm run build`, `npm run test:e2e` (9 passed, signed out) and `prettier --check .` exit 0. `userPaints` and its functions pushed to `dev:proper-bloodhound-699` only. Screenshots: rows at 320px fit both 44px toggles, the detail toggles render in dark mode, and a signed-out Want tap opens the sign-in sheet on the same URL. Drift:
  - One index, `by_userId_and_paintId`: `listMine` uses its `userId` prefix, so DATABASE's separate `by_user` isn't needed.
  - Filed GitHub issue #4: a deleted row loses its timestamp, so an older queued change from another device can re-create it. That's inherent in API.md's delete-when-both-false rule; resolve in the outbox item.
  - Steps 5 and 6 share a commit: the screens can't render the toggles without the providers. `AppProviders` (toast, collection, sign-in, `StoreUser`) now wraps the router in `main.tsx` and in `renderRoute`. `convex/react` is mocked globally in test setup as signed out with an empty collection.
  - `PaintRow` takes `actions` and `note` slots instead of importing collection code, so it stays presentational (ARCHITECTURE §8).
  - `useSetPaintFlags` throws if called while signed out, so a missed handoff fails loudly. `useCanSavePaints` lets components check first without touching Convex directly.
  - Added beyond the plan: a signed-out tap while offline shows "Signing in needs an internet connection." instead of opening an empty sheet.
  - Test mocks compare Convex function references with `getFunctionName`, because `api.x.y` returns a new reference on each access.
- 2026-10-07 — Staged. Version 0.7.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/own-want-toggles`.
- 2026-10-07 — Released. Owner approved the review; the manual signed-in results (AC1–AC6) weren't reported in the approval. Squash-merged 10 commits from `story/own-want-toggles` into `main` as 0.7.0 (65dc900), tagged `v0.7.0`. Worktree (only ignored files left: the copied `.env.local`, build output, test results) and branch removed. Issue #4 stays open for the outbox item.
