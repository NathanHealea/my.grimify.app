---
type: story
epic: palettes    # removed by `wi new` when there is no parent epic
slug: palette-paints
status: staged
branch: story/palette-paints
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-palette-paints
created: 2026-10-12
approved: 2026-10-12
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.16.0
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Add and remove palette paints

## Summary

Painters can put catalog paints into their palettes and take them out again. "Add to palette" sits on paint detail, and a Select mode in Paints and My Paints lets them tick several paints and add them all at once. On a palette's screen each paint has a Remove button. Until now palettes could be created but stayed empty.

## Context

Epic: `docs/implementation-plans/palettes/epic-palettes.md`, child 2 (epic R2). Depends on story `palettes-core` (staged as 0.15.0 on `story/palettes-core`, not yet in `dev`). **This item can't start until `palettes-core` is released into `dev`**, because `wi start` branches from `dev`.

Already in place after `palettes-core`:

- `convex/palettes.ts`: `listMine`, `get`, `create`, `rename`, `remove`. Every function starts with `requireUser`; another user's palette throws `NOT_FOUND` like a missing one. `paintIds` is the main list in order; `groups` exist in the schema but are always empty.
- `convex/userPaints.ts`: `PAINT_ID` regex (`/^[a-z0-9-]{3,100}$/`), the shape of a catalog paint ID.
- `src/features/palettes/`: `palettes-screen.tsx`, `palette-detail.tsx` (main list in `PaintList`, actions sheet, offline handling with `locked`), `palette-name-sheet.tsx` (create/rename, exports `OFFLINE_EDIT_NOTE`), `use-paint-lookup.ts`.
- `src/features/catalog/paints-screen.tsx`: the shared search list used by `/paints` and `/my-paints`. Rows are `<PaintRow>` (`src/components/paint-row.tsx`) whose body is a link to paint detail, with `<PaintToggles>` (Own, Want, Favorite; three 44px buttons) in the `actions` slot.
- `src/features/catalog/paint-detail.tsx`: `<PaintToggles>` under the paint's facts.
- Toasts (`useToast`) take a message only, no action button.

Decided while planning (2026-10-12):

- **Remove is part of this story** (the user asked for it), so a mis-add can be undone before the groups story. Removing a paint also removes it from every group, so the epic's R5 rule holds from the start even though groups are still empty.
- **Rows get Select mode, not a fourth button.** At 320px a row with three toggles leaves the name about 80px; a fourth 44px button would leave about 28px. Select mode swaps the toggles for a checkbox while it's on, and adding many paints at once suits building a scheme.

## Defaults this plan picks (change any)

- **Server:** `palettes.addPaints({ paletteId, paintIds })` appends the IDs not already in the main list, in the order given, skipping duplicates (within the call too), and returns `{ added }`. `palettes.removePaint({ paletteId, paintId })` removes the paint from the main list and every group. Both set `updatedAt`.
- **Validation:** each paint ID must match `PAINT_ID` (`INVALID_PAINT_ID`); at most 200 IDs per call; IDs aren't checked against the catalog (same as `userPaints.set`). If the palette would go over 200 paints, nothing is added and the call throws `PALETTE_FULL`.
- **Picker:** "Add to palette" opens a sheet listing the user's palettes (from `listMine`) as buttons, plus "New palette". Choosing a palette adds and closes with a toast: "Added to Ultramarines", "Added 3 paints to Ultramarines", or "Already in Ultramarines" when nothing was new. "New palette" opens the name sheet, creates the palette and adds to it.
- **Signed out:** paint detail's "Add to palette" opens sign-in (no replay after sign-in). The Select button isn't shown signed out, since palettes need an account.
- **Offline:** "Add to palette" and Remove are disabled, with `OFFLINE_EDIT_NOTE`. Select mode can still be entered and paints ticked, but its "Add to palette" is disabled with the note.
- **Select mode:** a "Select" button beside the result count. While on, each row shows a checkbox labelled "Select <paint name>" in place of the toggles, and tapping the row toggles it instead of opening the paint. A bar fixed above the nav shows "n selected", "Add to palette" and "Done". Selections survive search and filter changes. "Done", a successful add, or leaving the screen ends select mode and clears the selection. At most 200 selected; further checkboxes are disabled.
- **Remove:** an icon button per paint on the palette screen, labelled "Remove <paint name> from palette" (or "Remove unknown paint from palette"), no confirmation, toast "Removed <name>".

## Scope

**In scope**

- Convex `addPaints` and `removePaint`, with tests.
- "Add to palette" on paint detail, with the palette picker sheet and "New palette" inside it.
- Select mode in Paints and My Paints with the selection bar.
- Remove on the palette screen.
- E2E journey; docs (API, UX_FLOWS, DESIGN_SYSTEM for the selection bar, DECISIONS, the palettes feature doc, epic R2 wording).

**Out of scope**

- Reordering paints, and drag and drop (story `palette-drag-drop`).
- Groups, and moving or copying between groups (story `palette-groups`).
- Showing which palettes already hold a paint in the picker (needs a membership query; later).
- Replaying "Add to palette" after sign-in.
- Undo for Remove (toasts have no action button).
- Select mode on the equivalents list in paint detail.

## Requirements

- **R1** — A signed-in user can add one or more catalog paints to one of their palettes; paints already in it aren't duplicated and new ones go to the end in the order chosen.
- **R2** — A palette holds at most 200 paints; an add that would exceed it adds nothing and shows "This palette is full (200 paints)".
- **R3** — A user can remove a paint from their palette; it leaves the main list and every group, and the rest keep their order.
- **R4** — Add and remove only ever change the caller's palettes. Another user's palette ID behaves like a missing one (`NOT_FOUND`); signed-out calls fail with `UNAUTHENTICATED`; malformed paint IDs are rejected (`INVALID_PAINT_ID`).
- **R5** — Paint detail has an "Add to palette" button that opens the picker; signed out it opens sign-in.
- **R6** — The picker lists the user's palettes and "New palette"; choosing one adds the paint(s), closes the picker and reports the result in a toast; "New palette" creates a palette with the given name and adds to it. With no palettes, it shows only "New palette".
- **R7** — Paints and My Paints have a Select mode: rows show labelled checkboxes instead of toggles, a bar shows the count with "Add to palette" and "Done", selections persist across search changes, and at most 200 can be selected.
- **R8** — Offline, "Add to palette" (paint detail and selection bar) and Remove are disabled and `OFFLINE_EDIT_NOTE` is shown in a `role="status"` region.
- **R9** — All new UI meets WCAG 2.1 AA: labelled checkboxes and buttons, 44×44px targets, visible focus, the selection count announced in a live region, sheets that trap and return focus, and the selection bar doesn't cover the last row or the nav.

## Acceptance criteria

- **AC1** (R1, R5, R6) — Given a signed-in user with palette "Ultramarines", when they open Macragge Blue, tap "Add to palette" and choose "Ultramarines", then a toast says "Added to Ultramarines" and the palette lists Macragge Blue last.
- **AC2** (R1, R6) — Given Macragge Blue is already in "Ultramarines", when they add it again, then the toast says "Already in Ultramarines" and the palette holds one copy.
- **AC3** (R1, R7) — Given Paints, when the user taps Select, ticks three paints, taps "Add to palette" and chooses "Ultramarines", then the toast says "Added 3 paints to Ultramarines", select mode ends, and the three are last in the palette in the order ticked.
- **AC4** (R2) — Given a palette with 199 paints, when the user adds 2, then nothing is added and they see "This palette is full (200 paints)".
- **AC5** (R3) — Given a palette with Macragge Blue, when the user taps "Remove Macragge Blue from palette", then it disappears and a toast says "Removed Macragge Blue".
- **AC6** (R4) — Given user A's palette, when user B calls `addPaints` or `removePaint` with its ID, then the call fails with `NOT_FOUND` and A's palette is unchanged.
- **AC7** (R6) — Given a signed-in user with no palettes, when they tap "Add to palette", choose "New palette" and name it "Nurgle", then "Nurgle" exists holding that paint.
- **AC8** (R7) — Given select mode with two paints ticked, when the user searches for something else and ticks one more, then the bar says "3 selected".
- **AC9** (R8) — Given the device is offline, then "Add to palette" on paint detail and in the selection bar, and Remove on the palette screen, are disabled and the offline note is visible.
- **AC10** (R5) — Given a signed-out user on paint detail, when they tap "Add to palette", then the sign-in sheet opens.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `adds paints to the end without duplicates` | `convex/palettes.test.ts` | Order kept; existing and repeated IDs skipped; `added` count; `updatedAt` set |
| T2 | R2 | `rejects an add past 200 paints` | `convex/palettes.test.ts` | 199 + 2 → `PALETTE_FULL`, row unchanged; 199 + 1 accepted; over 200 IDs in one call rejected |
| T3 | R4 | `rejects malformed paint IDs` | `convex/palettes.test.ts` | `"Bad ID!"`, `""` → `INVALID_PAINT_ID`, nothing added |
| T4 | R3 | `removes a paint from the main list and every group` | `convex/palettes.test.ts` | Seeded groups lose it; others keep order; removing an absent paint is a no-op |
| T5 | R4 | `keeps add and remove to the owner` | `convex/palettes.test.ts` | B → `NOT_FOUND` for both; A's row unchanged; signed out → `UNAUTHENTICATED` |
| T6 | R3, R8 | `removes a paint from the palette screen` | `src/features/palettes/palette-detail.test.tsx` | Remove calls `removePaint` with the ID; toast; button disabled offline; unknown paint has its own label |
| T7 | R6 | `picker adds to a palette and reports the result` | `src/features/palettes/add-to-palette-sheet.test.tsx` | Lists palettes; choosing calls `addPaints`; toasts for 1, n and 0 added; `PALETTE_FULL` message; empty list shows only New palette |
| T8 | R6 | `picker creates a palette and adds to it` | `src/features/palettes/add-to-palette-sheet.test.tsx` | New palette → name sheet → `create` then `addPaints` with the new ID |
| T9 | R5, R8 | `paint detail offers Add to palette` | `src/features/catalog/paint-detail.test.tsx` | Opens the picker signed in; opens sign-in signed out; disabled with note offline |
| T10 | R7 | `select mode ticks paints and keeps them across searches` | `src/features/catalog/paints-screen.test.tsx` | Select shows checkboxes not toggles; row tap toggles; count in `role="status"`; selection survives a query change; Done clears; 201st disabled |
| T11 | R7, R8 | `selection bar adds the selection` | `src/features/catalog/paints-screen.test.tsx` | Add to palette opens the picker with the IDs in tick order; success ends select mode; disabled offline with note; Select hidden signed out |
| T12 | R7, R9 | `PaintRow selection variant` | `src/components/paint-row.test.tsx` | Checkbox labelled "Select <name>"; row isn't a link while selecting; `aria-checked` state |
| T13 | R1, R3, R7 | `add paints to a palette and remove one` | `tests/e2e/palettes.spec.ts` | On the dev deployment: add from paint detail and by Select mode, see them in order, remove one; cleans up |

**Not unit testable:** R9's visual parts (44px targets, focus ring, the bar not covering the last row or the nav at 320px and 640px) are checked in Playwright where measurable (`tests/e2e/palettes.spec.ts`) and by hand on an iPhone, listed in the stage summary.

## Implementation plan

1. [x] Add `palettes.addPaints` and `palettes.removePaint` with paint ID validation, the 200-paint cap and owner checks — touches `convex/palettes.ts`, `convex/palettes.test.ts`, `convex/userPaints.ts` (export `PAINT_ID`) — tests T1, T2, T3, T4, T5
2. [x] Add Remove to the palette screen's paint list — touches `src/features/palettes/palette-detail.tsx`, `palette-detail.css`, `palette-detail.test.tsx` — tests T6
3. [x] Build the Add to palette picker sheet, with New palette — touches `src/features/palettes/add-to-palette-sheet.tsx`, `.css`, `.test.tsx` — tests T7, T8
4. [x] Add "Add to palette" to paint detail — touches `src/features/catalog/paint-detail.tsx`, `paint-detail.css`, `paint-detail.test.tsx` — tests T9
5. [x] Add the selection variant to `PaintRow` — touches `src/components/paint-row.tsx`, `paint-row.css`, `paint-row.test.tsx` — tests T12
6. [x] Add Select mode and the selection bar to the paints list — touches `src/features/catalog/paints-screen.tsx`, `paints-screen.css`, `paints-screen.test.tsx`, `src/features/catalog/selection-bar.tsx`, `selection-bar.css` — tests T10, T11
7. [x] Extend the E2E journey — touches `tests/e2e/palettes.spec.ts` — tests T13
8. [x] Update docs — touches `docs/API.md`, `docs/UX_FLOWS.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `docs/features/palettes.md`, `docs/features/catalog/search-and-filters.md` — tests none (docs only)

**Must not change:** the `palettes` schema and the existing palettes, `users` and `userPaints` function signatures; `PaintToggles` behavior and the outbox; `PaintRow`'s existing props and its default (link) rendering; search and filter URLs.

**High-risk steps:** 1 (new mutations that write user data and must keep the owner checks).

## Risks and open questions

- **Blocked on `palettes-core`:** it has to be accepted and released into `dev` first.
- **Select mode changes a shared list:** `paints-screen.tsx` serves both Paints and My Paints, and select mode replaces each row's link with a toggle. The default rendering must stay unchanged; T12 and the existing paints-screen tests guard it.
- **Selection bar and the floating nav:** on phones the nav floats at the bottom, so the bar has to sit above it, and the list needs extra bottom padding so the last row isn't hidden. From 640px the nav is at the top and the bar sits at the bottom edge. It needs real checks at 320px and 640px.
- **Paint cap of 200** is enforced for the first time here (DECISIONS 048 lists it). A palette written by an older build can't exceed it, because nothing could add paints before.
- **Picker doesn't show membership:** a user only learns a paint was already there from the toast. A membership query (palettes that contain a paint) is out of scope.
- **Convex holds mutations offline:** the same issue `palettes-core` left for review (Cancel offline doesn't stop a queued mutation) applies to Add and Remove. Disabling them offline avoids starting one; a mutation in flight when the connection drops still completes later.

## Progress log

- 2026-10-12 — Planned.
- 2026-10-12 — Plan approved.
- 2026-10-12 — Plan approved.
- 2026-10-12 — Started on branch story/palette-paints from origin/dev.
- 2026-10-12 — Steps 1-3 done. Step 3's tests were written while the implementation was in progress, so they passed on first run instead of failing first; four mutation checks (PALETTE_FULL message, add after create, single-add toast, close on success) each failed the tests as expected.
- 2026-10-12 — Build complete: all 8 steps done, wi verify green. T13 (E2E) written but not yet passing: dev deployment lacks addPaints/removePaint until functions are pushed. Fixed during build: Add to palette before Clerk loads opened sign-in (72d48be); removing an absent paint bumped updatedAt (1f674dc).
- 2026-10-12 — Review: 2 cycles (code, security, a11y) + mutation audit. Fixed: picker auth gating, selection bar DOM order/sticky/wrap, Remove focus + pending lock, removePaint PAINT_ID check, checkbox description, 200-cap note, two focus regressions from the fixes; 9 tests added for audit gaps.
- 2026-10-12 — Staged: verification passed; version 0.15.0 → 0.16.0 (bumped by hand: wi read the base version from origin/dev, which lacks palettes-core 0.15.0); no changelog file.
