---
type: story
slug: settings
status: released
branch: story/settings
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-settings
created: 2026-10-08
approved: 2026-10-08
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.10.0
review_approved: 2026-10-08
pr:                  # set by `wi pr`
tag: v0.10.0
---

# Settings: sign out, delete account, about

## Summary

Finishes the Settings screen for the MVP. A signed-in painter can delete their account: their Convex data first, then their Clerk account, after typing DELETE to confirm. Settings gains an Appearance line and an About section with the app version, where the paint data comes from, and the "not affiliated" disclaimer that SECURITY §9 requires. Sign-out is reworked so the phone's stored collection is cleared only after Clerk's sign-out succeeds (#8), can't be re-saved while sign-out is in progress (#6), and leaves focus somewhere sensible afterwards (#11).

## Context

- **Settings today:** `src/routes/settings.tsx` renders only `AccountSection` (`src/features/auth/account-section.tsx`): the email, Sign out (with the "Discard unsynced changes?" sheet from the offline-outbox item), or Sign in.
- **Docs already decided:**
  - **UX_FLOWS Flow 9:** delete account opens a confirmation, `users.deleteAccount` runs, the auth account is deleted, and the user lands on Paints with the toast "Account deleted".
  - **API.md:** `users.deleteAccount` deletes the user's `userPaints` and `users` row; the auth-provider account is deleted separately.
  - **SECURITY §8:** deletion must complete within the same session. **SECURITY §9:** cite data sources and show a "Not affiliated with…" disclaimer.
  - **DESIGN_SYSTEM §8:** Delete account uses the `destructive` button.
- **Decisions made in planning (2026-10-08):**
  - The Clerk account is deleted from the browser with Clerk's `user.delete()` after `users.deleteAccount` succeeds. There is no Clerk secret in Convex. `user.delete()` and `user.deleteSelfEnabled` exist in the installed `@clerk/shared` types (`dist/types/user.d.ts`, lines 193 and 218).
  - Scope is the ROADMAP item plus a static Theme line. "How to install" (the install banner covers it) and Privacy (ROADMAP NEXT, public launch) are left out.
  - The About text credits PaintPad by name.
  - Confirmation is typing DELETE in a sheet.
  - Issues #6, #8 and #11 are fixed here, because Delete account needs the same "end the session, then clear the device" sequence.
- **Code involved:**
  - `CollectionProvider` (`src/features/collection/collection-provider.tsx`) owns the device record. `useClearDevice()` clears it at once. Its listMine write-back effect re-saves the record whenever `listMine` answers for the Clerk user, which is #6.
  - `account-section.tsx` `signOutNow` clears the device record before `signOut()` resolves, which is #8. When sign-out finishes, the focused button is replaced and focus drops to the body, which is #11.
  - `convex/users.ts` has `store` and `me`. The user is derived with `convex/lib/auth.ts`.
  - The toast is `useToast()` (`src/features/feedback/toast-provider`). The sheet is `src/components/ui/sheet.tsx` (Radix Dialog).
- **Related issues:** fixes #6, #8, #11. Leaves #7, #9, #10 and #12 open.

## Scope

**In scope**

- `users.deleteAccount` mutation, deleting in batches.
- Delete account UI: a sheet where you type DELETE, the deletion sequence, error states, and states for offline and for deletion turned off in Clerk.
- `CollectionProvider` "end session" API: clear the device after Clerk succeeds, block re-saving and sending while a session is ending. This replaces `useClearDevice`.
- Sign out on that API, a failure message, and focus after sign-out.
- Settings screen layout: Account, Appearance ("Follows your system"), About (version, data sources, disclaimer).
- Exposing the app version to the client at build time.
- Docs.

**Out of scope**

- A Privacy page and "How to install" (ROADMAP NEXT / install banner).
- Dark mode or a theme picker (ROADMAP NEXT).
- #7 (device record kept after a sign-out done outside the app; needs a product decision), #9, #10, #12.
- Server-side Clerk deletion or Clerk webhooks.
- An E2E test that deletes an account (it would delete the shared E2E test user mid-run; see Risks).

## Requirements

- **R1** — `users.deleteAccount` deletes every `userPaints` row of the caller (tombstones included) and the caller's `users` row, and nothing belonging to anyone else. It works for more rows than one transaction can delete by continuing in scheduled batches. A caller with no `users` row gets `null` (safe to retry). A signed-out caller gets `UNAUTHENTICATED`.
- **R2** — Ending a session (sign out or delete account) clears the device record only after the Clerk step succeeds. While the session is ending, no `listMine` answer is saved to the device and no outbox entry is sent. If the Clerk step fails, the record is left as it was, and saving and sending resume. (Fixes #6, #8.)
- **R3** — Sign out that fails shows the toast "Couldn't sign out. Check your connection." and keeps any pending changes and the signed-in view.
- **R4** — After sign-out completes, keyboard focus is on the Account heading. (Fixes #11.)
- **R5** — Signed in, Settings shows a "Delete account" button (destructive). It opens a modal sheet titled "Delete your account?" with the text "This permanently deletes your Grimify account and your saved paints. It can't be undone." When there are pending changes, it adds "n changes that haven't synced will be lost too." It has a text field labelled "Type DELETE to confirm", a Cancel button, and a "Delete account" button that stays disabled until the field is exactly `DELETE`.
- **R6** — Confirming runs `users.deleteAccount`, clears the device (its data no longer exists on the server), then runs Clerk's `user.delete()`. The app then opens `/paints` and shows the toast "Account deleted".
- **R7** — If `users.deleteAccount` fails, nothing is deleted on the device, the sheet stays open, and the sheet shows "Couldn't delete your account. Check your connection and try again." If `users.deleteAccount` succeeds but `user.delete()` fails, the device record is still cleared (its data no longer exists on the server). The sheet then shows "Couldn't finish deleting your account. Try again.", and retrying completes it.
- **R8** — Offline, the Delete account button is disabled with the note "Deleting your account needs an internet connection." When Clerk reports `deleteSelfEnabled` false, it is disabled with the note "Account deletion isn't available right now."
- **R9** — Settings is organised as three sections with `h2` headings: Account, Appearance ("Theme: Follows your system"), and About.
- **R10** — About shows "Version x.y.z" (from `package.json` at build time) and a data-sources paragraph. The paragraph says paint colours are approximate on-screen values, that most hex values come from PaintPad (paintpad.app) with the rest from manufacturer pages, and that "Paint and brand names are trademarks of their owners. Grimify isn't affiliated with any paint manufacturer."
- **R11** — Accessibility (WCAG 2.1 AA):
  - The delete sheet is modal, with a title and description, a focus trap and Escape, and focus returns to Delete account when it closes.
  - The confirm field has a visible label and a 16px+ font (iOS).
  - The disabled reason is in text, not colour.
  - The error inside the sheet is in a live region.
  - All buttons meet the 44px target.

## Acceptance criteria

- **AC1** (R1) — Given a user with 3 rows and a tombstone, and another user with rows, when the first calls `users.deleteAccount`, then the first user's rows and `users` row are gone and the second user's data is untouched.
- **AC2** (R2, R3) — Given 2 pending changes and no connection, when I confirm sign-out and Clerk's sign-out fails, then I'm still signed in, the badge still says 2 changes, and a toast says "Couldn't sign out. Check your connection."
- **AC3** (R4) — Given I'm on Settings using a keyboard, when I sign out, then focus lands on the Account heading.
- **AC4** (R5, R6) — Given I'm signed in online, when I open Delete account, type DELETE and confirm, then I'm on Paints, signed out, with the toast "Account deleted", and signing in with the same email starts an empty collection.
- **AC5** (R7) — Given the connection drops before I confirm, when I confirm, then the sheet stays open with "Couldn't delete your account. Check your connection and try again." and nothing is lost.
- **AC6** (R8) — Given I'm offline, when I open Settings, then Delete account is disabled and says why.
- **AC7** (R9, R10) — Given any state, when I open Settings, then I see Account, Appearance and About, with the version, data sources and disclaimer.
- **AC8** (R11) — Given VoiceOver, when I open the delete sheet, then its title and description are read, the field's label is read, and the confirm button is announced disabled until I type DELETE.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `deletes the caller's data and nobody else's` | `convex/users.test.ts` | A's flagged rows, tombstone and `users` row are gone; B's rows and `users` row remain |
| T2 | R1 | `deletes large collections in batches` | `convex/users.test.ts` | More rows than one batch → after `finishAllScheduledFunctions`, none of A's rows remain |
| T3 | R1 | `rejects signed-out callers and is safe to retry` | `convex/users.test.ts` | No identity → `UNAUTHENTICATED`; identity with no `users` row → `null` |
| T4 | R2 | `ends a session before clearing the device` (regression, #6 and #8) | `src/features/collection/collection-provider.test.tsx` | While `endSession(action)` is pending, a new `listMine` answer isn't saved and the outbox isn't sent; action resolves → record cleared; action rejects → record intact, a later `listMine` answer is saved again, the outbox flushes. Fails on current code |
| T5 | R2, R3 | `keeps pending changes when sign-out fails` (regression, #8) | `src/features/auth/account-section.test.tsx` | `signOut` rejects → toast "Couldn't sign out. Check your connection.", device record not cleared, still signed-in view; `signOut` resolves → cleared after it |
| T6 | R4 | `moves focus to the Account heading after sign-out` (regression, #11) | `src/features/auth/account-section.test.tsx` | Sign out, then Clerk reports signed out → the Account `h2` has focus |
| T7 | R5, R6, R11 | `deletes the account after typing DELETE` | `src/features/auth/delete-account.test.tsx` | Confirm button disabled for "", "delete", "DELETE " and enabled for "DELETE"; pending-changes line shown with count; confirm calls `deleteAccount`, then clears the device, then `user.delete`, navigates to `/paints` and shows the toast "Account deleted"; focus returns to Delete account on Cancel |
| T8 | R7 | `reports a failed deletion` | `src/features/auth/delete-account.test.tsx` | `deleteAccount` rejects → error text in a live region, `user.delete` not called, device not cleared; `deleteAccount` resolves and `user.delete` rejects → device cleared, "Couldn't finish deleting your account. Try again."; retry completes |
| T9 | R8 | `explains when deletion is unavailable` | `src/features/auth/delete-account.test.tsx` | Offline → disabled + "Deleting your account needs an internet connection."; `deleteSelfEnabled: false` → disabled + "Account deletion isn't available right now." |
| T10 | R9, R10 | `shows account, appearance and about` | `src/features/settings/settings-screen.test.tsx` | Three `h2` headings in order; "Theme: Follows your system"; "Version " + the injected version; the PaintPad sentence and the disclaimer |

**Not unit testable:**
- AC4 end to end, with the real Clerk and Convex: a manual check on the dev instance with a throwaway account. It needs Clerk's "users can delete their own account" setting on.
- R11's VoiceOver reading and focus on a real phone: manual check.

## Implementation plan

1. [x] `users.deleteAccount` with batched deletion of `userPaints` (internal continuation mutation) and the `users` row; read `convex/_generated/ai/guidelines.md` first — touches `convex/users.ts`, `convex/users.test.ts` — tests T1, T2, T3
2. [x] `CollectionProvider` `useEndSession()`: `endSession(action)` blocks write-back and sending while `action` runs, clears the device record when it resolves, resumes when it rejects; also `clearDevice` for the delete path's partial success; replaces `useClearDevice` — touches `src/features/collection/collection-provider.tsx`, `src/features/collection/collection-provider.test.tsx` — tests T4
3. [x] Sign out through `endSession`, the failure toast, focus to the Account heading — touches `src/features/auth/account-section.tsx`, `src/features/auth/account-section.css`, `src/features/auth/account-section.test.tsx` — tests T5, T6
4. [x] Delete account button and sheet — touches `src/features/auth/delete-account.tsx`, `src/features/auth/delete-account.css`, `src/features/auth/delete-account.test.tsx`, `src/features/auth/account-section.tsx` — tests T7, T8, T9
5. [x] App version at build time (`define` in Vite with a type declaration) — touches `vite.config.ts`, `src/env.d.ts` — tests none (wiring; T10 reads it)
6. [x] Settings screen with Account, Appearance and About — touches `src/features/settings/settings-screen.tsx`, `src/features/settings/settings-screen.css`, `src/features/settings/settings-screen.test.tsx`, `src/routes/settings.tsx` — tests T10
7. [x] Docs:
    - **DECISIONS 037:** the Clerk account is deleted from the browser after `users.deleteAccount`.
    - **DECISIONS 038:** the device is cleared only after the Clerk step succeeds (#6, #8).
    - **API** (`users.deleteAccount`, now built).
    - **SECURITY** (deletion sequence, checklist item).
    - **UX_FLOWS** Flow 9.
    - **DESIGN_SYSTEM** (settings sections, type-to-confirm).
    - **ENVIRONMENT** (the Clerk dashboard setting).
    - **TESTING.**
    - **ROADMAP.**

    Touches `docs/DECISIONS.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/UX_FLOWS.md`, `docs/DESIGN_SYSTEM.md`, `docs/ENVIRONMENT.md`, `docs/TESTING.md`, `docs/ROADMAP.md` — tests none (docs only)

**Must not change:**
- The `userPaints` and `users` schema.
- `userPaints.set` and `listMine` contracts.
- `users.store` / `users.me`.
- `useSetPaintFlags` as the only write path.
- The device record shape.
- The signed-out sign-in handoff (DECISIONS 030).

**High-risk steps:**
- **Step 1:** deletion of user data on the server, which `git revert` can't undo once run.
- **Step 2:** decides when the device data of a signed-in user is discarded, and blocks sending during sign-out.
- **Step 4:** triggers the irreversible deletion of both the Convex data and the Clerk account.

## Risks and open questions

1. **Clerk setting (you).** `user.delete()` only works if self-deletion is allowed in the Clerk dashboard (User & authentication → "Allow users to delete their accounts"). Please confirm it's on for the dev instance, and plan it for production. R8 covers the off case in the UI.
2. **Not atomic.** The Convex data goes first, then the Clerk account.
   - If the Clerk step fails, the account exists with no data. R7 tells the user to retry, and a retry succeeds because `deleteAccount` is safe to repeat.
   - `StoreUser` recreates an empty `users` row while the account still exists. A second `deleteAccount` removes it.
3. **Scheduled batches finish after the response.** For collections over one batch (sized well below Convex's per-transaction write limit; 2,837 paints is the realistic maximum, but the server doesn't enforce it), the rest of the rows are deleted by scheduled mutations shortly after the toast. SECURITY's "within the same session" holds in practice. Say if you want a hard cap instead.
4. **No E2E for deletion.** Deleting the shared E2E user mid-run would break parallel collection tests (DECISIONS 032). Covered by T1–T3, T7–T9 and the manual check in the test plan.
5. **Clerk session after `user.delete()`.** Clerk is expected to end the session when the user is deleted, but I haven't verified that against Clerk's docs. Step 4 confirms it in the dev instance. If the session lingers, the code calls `signOut()` after `delete()`.
6. **Focus after Delete account.** The app navigates to Paints; focus follows the router's default (top of the page), and the toast announces "Account deleted". R4's focus rule applies to sign-out only.
7. **PaintPad credit.** The About text names PaintPad while permission is still pending (DECISIONS 015). You chose to credit them now.

## Progress log

- 2026-10-08 — Planned. Decided with the owner:
  - Clerk deletion from the browser.
  - ROADMAP scope plus the Theme line.
  - #6, #8 and #11 included.
  - Type-DELETE confirmation.
- 2026-10-08 — Plan approved.
- 2026-10-08 — Started on branch story/settings from origin/main.
- 2026-10-08 — R6/T7 order corrected to deleteAccount → clear device → user.delete, the only order that meets R7 (device cleared even if Clerk's step fails).
- 2026-10-08 — Build done: steps 1-7 landed. Convex dev deployment has deleteAccount for the manual check.
- 2026-10-08 — Staged: verification passed; version 0.9.0 → 0.10.0; no changelog file.
- 2026-10-08 — Review approved.
- 2026-10-08 — Released 0.10.0 as v0.10.0.
