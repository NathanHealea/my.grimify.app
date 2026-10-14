---
type: story
epic: palettes    # removed by `wi new` when there is no parent epic
slug: palette-drag-drop
status: staged
branch: story/palette-drag-drop
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-palette-drag-drop
created: 2026-10-13
approved: 2026-10-13
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.18.0
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Drag and drop with glass drag preview

## Summary

Painters can arrange a palette by hand: reorder its paints, reorder its groups, drag a paint from All paints into a group, and drag a paint from one group to another. Dragging works with touch, mouse and keyboard, shows a frosted-glass preview of the paint, and is announced to screen readers. Every drag has a menu equivalent, so nobody has to drag. This finishes the palettes epic (epic R6, R7 and the drag half of R8).

## Context

Epic: `docs/implementation-plans/palettes/epic-palettes.md`, child 4. Depends on `palette-groups` (v0.17.0), released into `dev` with `palettes-core` (v0.15.0) and `palette-paints` (v0.16.0).

Already in place:

- `convex/palettes.ts`: each palette document has `paintIds` (the main list, in order) and `groups: { id, name, paintIds }[]` (DECISIONS 048). Mutations append only. Nothing reorders yet. `addPaintToGroup` and `movePaintToGroup` append to the end of the target group. Every function starts with `requireUser` and `requireOwnPalette` (`NOT_FOUND` for someone else's palette), checks paint IDs (`INVALID_PAINT_ID`) and groups (`GROUP_NOT_FOUND`), and only bumps `updatedAt` when something changes.
- `src/features/palettes/palette-detail.tsx`: the "All paints" section (`PaintList`). Each row is a link to paint detail (swatch, name, brand), a Groups button (when groups exist) and a ✕ Remove button. That makes two 44px icon buttons per row.
- `src/features/palettes/palette-groups.tsx`: one `<section>` per group. The heading is an `h2` plus "Actions for group X" (Rename, Delete). Each row has swatch, name, brand and "Actions for X in Y", which opens `group-paint-actions-sheet.tsx` (Move to group…, Copy to group…, Remove from group).
- Offline, every edit control is disabled and `OFFLINE_EDIT_NOTE` shows in a `role="status"` region (DECISIONS 047). Convex holds mutations while offline, so a control that may hold focus during a save uses `aria-disabled` plus a guard (`locked = saving && online`).
- Glass: `--color-glass`, `--glass-blur` and `--glass-saturate` in `src/styles/tokens.css`. DECISIONS 045 sets `--color-glass` as the thinnest surface that keeps text at 4.5:1 over black or white behind it.
- Styling rule (CLAUDE.md, CODE_STYLE §5a): no inline `style` except to pass a data value as a CSS custom property.
- No drag library is installed. The epic approved `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0, pinned exactly. Checked on npm on 2026-10-13: both are still `latest` (published 2024-12-05 and 2024-12-04). Their peer range is `react >=16.8.0`, which covers React 19.3.0. Their only dependencies are `@dnd-kit/utilities`, `@dnd-kit/accessibility` and `tslib`. The newer `@dnd-kit/react` is at 0.5.0, before 1.0, so it isn't used.
- Convex 1.46.0 has `useMutation(...).withOptimisticUpdate` with `localStore.setQuery` (`node_modules/convex/dist/esm-types/react/client.d.ts`).

## Defaults this plan picks (change any)

- **Arrange mode, not always-on handles.** All paints rows already have two icon buttons, and the epic rules out a fourth at 320px. A third (a handle) leaves the name about 100px. Instead, an "Arrange" button sits next to the "All paints" heading. In arrange mode:
  - every paint row (All paints and groups) and every group heading shows a drag handle and a Move button;
  - the link, Groups, Remove and Actions buttons are hidden;
  - the button reads "Done".

  This follows Select mode's pattern (DECISIONS 051). Leaving the mode puts focus back on the Arrange button.
- **The handle is the only drag target.** The rest of the row scrolls the page on touch as usual. The handle is a 44×44px button, named "Drag Macragge Blue" for paints and "Drag group Armor" for groups, and has `touch-action: none`. Mouse drags start after 5px of movement and touch drags after holding 150ms (dnd-kit activation constraints). Step 2's iPhone spike tunes both values.
- **What each drop does:**

  | From → to | Result | Server call |
  |---|---|---|
  | All paints → All paints | Reorder | `movePaint` |
  | Group → same group | Reorder | `moveGroupPaint` |
  | All paints → a group | Adds at the drop position; it stays in All paints | `addPaintToGroup` with `toIndex` |
  | Group → another group | Moves at the drop position | `movePaintToGroup` with `toIndex` |
  | Group heading → group heading | Reorders groups | `moveGroup` |
  | Group → All paints | Nothing ("Already in All paints") | none |
  | Any → a group already holding it | Nothing ("Already in Trim") | none |
  | Dropped where it started, or cancelled | Nothing | none |

  - **Drop position:** dropping on a row puts the paint before that row. Dropping on a group's heading, empty text or empty space appends it.
  - **Within one list,** rows shift to make room, as standard sortable lists do.
  - **Across lists,** the target group gets a highlight and the row under the pointer an insertion line. Rows don't shift, which avoids dnd-kit's live cross-container state.
  - **Dragging a group** only collides with group headings, through a filtered collision detection.
- **The menu equivalent of reordering (epic R8)** is a Move button on each row and group heading in arrange mode: "Move Macragge Blue" or "Move group Armor". It opens a sheet with Move to top, Move up, Move down and Move to bottom. Buttons that don't apply are disabled, such as Up on the first row.
  - Cross-list moves already have menus: the Groups sheet adds to a group, and the group row's "Move to group…" moves between groups. Arrange mode hides those buttons, so they're reached outside it.
  - When the epic's "menu" says Move up/down, that's this sheet.
- **Server (`convex/palettes.ts`), by position, not by sending the whole order:**
  - `movePaint({ paletteId, paintId, toIndex })`: main list.
  - `moveGroupPaint({ paletteId, groupId, paintId, toIndex })`.
  - `moveGroup({ paletteId, groupId, toIndex })`.
  - `addPaintToGroup` and `movePaintToGroup` gain an optional `toIndex`. Leaving it out appends, exactly as today.
  - `toIndex` is the paint's index in the resulting list. A non-integer or negative value throws `INVALID_INDEX`. A value past the end is clamped to the end.
  - A paint not in the list is a no-op. So is a move to the same index, and `updatedAt` isn't bumped.

  Sending one paint and an index, rather than the whole order, means a concurrent add on another device isn't overwritten. The last write still wins for the same paint (DECISIONS 049).
- **Optimistic updates:** each drag and Move-sheet mutation uses `withOptimisticUpdate` to rewrite the cached `api.palettes.get` result, so the row lands where it was dropped instead of snapping back for a round trip. On failure, Convex rolls the change back and a toast says "Couldn't move Macragge Blue. Check your connection and try again."
- **Glass drag preview:** dnd-kit's `DragOverlay` renders `DragPreview`. For a paint it shows the swatch, name and brand and nothing else; an unknown paint shows the fallback swatch and "Unknown paint". For a group it shows the group's name. The background is `--color-glass` with `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))`, plus `--shadow-lg`. Where `backdrop-filter` isn't supported, it falls back to `--color-surface`.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, there's no drop animation and rows don't animate as they shift. They jump into place instead.
- **Screen readers:** dnd-kit's keyboard sensor uses Space to pick up and drop, the arrow keys to move, and Escape to cancel. Each handle points (`aria-describedby`) at the instructions: "Press Space to pick up. Use the arrow keys to move, Space to drop, Escape to cancel." The live-region announcements name things:
  - "Picked up Macragge Blue, position 2 of 5 in All paints."
  - "Macragge Blue is over position 4 of 5 in All paints." / "…over Trim, position 1 of 3. Dropping adds it to Trim."
  - "Dropped Macragge Blue at position 4 of 5 in All paints." / "Added Macragge Blue to Trim." / "Moved Macragge Blue to Highlights."
  - "Macragge Blue is already in Trim; nothing changed." / "Cancelled; Macragge Blue is back at position 2."
- **Focus after a drop:** a keyboard drop within one list keeps focus on the handle, which dnd-kit restores. After a cross-list drop, focus goes to the paint's handle in the target group once it renders. This uses a `pending focus` ref and an effect, the same pattern as focusing a new group in `palette-groups`, and doesn't rely on whether Convex renders before the mutation resolves. After the Move sheet, focus returns to the row's Move button.
- **Offline:** Arrange is disabled, and if the connection drops mid-arrange, the handles and Move buttons are disabled. A drag in progress when the connection drops is cancelled. `OFFLINE_EDIT_NOTE` shows as elsewhere.
- **Inline styles:** `useSortable` returns a transform. Rows get it as custom properties (`style={{ "--drag-x": "…px", "--drag-y": "…px" }}`), and the CSS applies `transform: translate3d(var(--drag-x), var(--drag-y), 0)`. Transition timing lives in CSS. `@dnd-kit/utilities` isn't imported directly.

## Scope

**In scope**

- Three new mutations and an optional `toIndex` on two existing ones, with tests.
- `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0, pinned exactly.
- Arrange mode on the palette screen: drag handles, drag and drop for every row in the table above, the glass drag preview, announcements and focus handling.
- The Move sheet (top, up, down, bottom) for paint rows and group headings.
- Optimistic updates for the new moves.
- E2E for keyboard and mouse drags; docs (API, UX_FLOWS, DESIGN_SYSTEM, DECISIONS, the palettes feature doc, PRD, ROADMAP).

**Out of scope**

- Dragging outside arrange mode or without a handle.
- Copying by drag between groups (a modifier key has no touch equivalent). "Copy to group…" stays the way to copy.
- Dragging a paint out of a group to remove it from that group, and dragging to All paints.
- Dragging paints between palettes, or reordering the palettes list.
- Optimistic updates for the existing mutations, which keep their current behaviour.
- Multi-select drag.

## Requirements

- **R1** — The palette screen has an Arrange button, disabled offline. In arrange mode, every paint row and group heading shows a drag handle and a Move button, and the link, Groups, Remove and Actions buttons are hidden. "Done" leaves the mode and returns focus to the button.
- **R2** — Dragging a handle reorders paints within All paints, paints within a group, and groups among themselves. The new order persists after reload.
- **R3** — Dragging a paint from All paints into a group adds it there at the drop position and keeps it in All paints. Dragging it from one group to another moves it there at the drop position. A drop that would duplicate a paint in a group, or go from a group to All paints, changes nothing and says so.
- **R4** — Dragging works by touch (on iOS Safari and the installed PWA), mouse and keyboard (Space, arrows, Escape). Touching a row outside its handle scrolls the page.
- **R5** — While dragging, the preview shows only the paint's swatch, name and brand (or a group's name) on a glass background built from the design tokens. Its text meets 4.5:1 contrast. With reduced motion, nothing animates.
- **R6** — Screen-reader users get drag instructions on each handle, plus announcements that name the paint, the list and the position when it's picked up, moved over a spot, dropped and cancelled.
- **R7** — Every reorder has a non-drag equivalent: the Move sheet with Move to top, up, down and to bottom, for paint rows and group headings. Moves that don't apply are disabled. Cross-list moves keep their existing menus.
- **R8** — The new and extended mutations only change the caller's palette (`NOT_FOUND` otherwise, `UNAUTHENTICATED` when signed out). They reject bad input (`INVALID_INDEX`, `INVALID_PAINT_ID`, `GROUP_NOT_FOUND`, and `PAINT_NOT_IN_PALETTE` for adds). Moving to the same place is a no-op without an `updatedAt` change. Calls without `toIndex` behave exactly as before.
- **R9** — A drop or a Move-sheet move shows straight away. If the server rejects it, the old order comes back and a toast says the move failed.
- **R10** — All new UI meets WCAG 2.1 AA: handles and Move buttons are 44×44px with visible focus and names that say what they act on; focus lands as described in "Focus after a drop"; and arrange mode works at 320px and 200% text.

## Acceptance criteria

- **AC1** (R1) — Given a palette with paints, when the user taps Arrange, then each row shows "Drag <name>" and "Move <name>" and no Remove button. When they tap Done, the rows return to normal and focus is on Arrange.
- **AC2** (R2) — Given All paints in the order A, B, C, when the user drags C above A, then the order is C, A, B, and it stays that way after reload.
- **AC3** (R3) — Given Macragge Blue in All paints and an empty group "Trim", when the user drags it onto Trim, then it's in Trim and still in All paints.
- **AC4** (R3) — Given Macragge Blue in "Armor", when the user drags it onto "Highlights" between two paints, then it's between them in Highlights and gone from Armor.
- **AC5** (R3, R6) — Given Macragge Blue already in Trim, when the user drags it from All paints onto Trim, then nothing changes and the live region says it's already in Trim.
- **AC6** (R4, R6) — Given a keyboard user on "Drag Macragge Blue" at position 2 of 5, when they press Space, ArrowDown twice and Space, then it's at position 4 and the live region says "Dropped Macragge Blue at position 4 of 5 in All paints."
- **AC7** (R4) — Given an iPhone, when the user swipes up on a row's name in arrange mode, then the page scrolls. When they hold and drag the handle, then the row moves.
- **AC8** (R5) — Given a drag in progress, then the preview shows the swatch, name and brand on frosted glass, and nothing else.
- **AC9** (R7) — Given the first row in All paints, when the user opens "Move <name>", then Move to top and Move up are disabled. Choosing Move to bottom puts it last and focus returns to its Move button.
- **AC10** (R7, R2) — Given groups Armor, Trim and Highlights, when the user opens "Move group Highlights" and picks Move up, then the order is Armor, Highlights, Trim.
- **AC11** (R8) — Given user A's palette, when user B calls `movePaint`, `moveGroupPaint` or `moveGroup` with its ID, then it fails with `NOT_FOUND` and A's palette is unchanged.
- **AC12** (R9) — Given a move the server rejects, when the user drops, then the row shows at the drop position, then returns to where it was, and a toast says "Couldn't move <name>…".
- **AC13** (R1) — Given the device is offline, then Arrange is disabled and the offline note is visible. If it goes offline in arrange mode, the handles and Move buttons are disabled.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R2, R8 | `moves a paint within the main list` | `convex/palettes.test.ts` | `movePaint` to 0, middle and last; past-the-end is clamped; same index → no write, `updatedAt` unchanged; absent paint → no-op; `-1` and `1.5` → `INVALID_INDEX`; groups untouched |
| T2 | R2, R8 | `moves paints within a group and moves groups` | `convex/palettes.test.ts` | `moveGroupPaint` reorders only that group; `moveGroup` reorders `groups` with their paints intact; same-index no-ops; `GROUP_NOT_FOUND`; `INVALID_INDEX` |
| T3 | R3, R8 | `adds and moves into a group at a position` | `convex/palettes.test.ts` | `addPaintToGroup` with `toIndex` inserts there; `movePaintToGroup` with `toIndex` removes from the source and inserts in the target; without `toIndex` both still append (regression); a move into a group already holding it only removes from the source |
| T4 | R8 | `keeps reordering to the owner` | `convex/palettes.test.ts` | B → `NOT_FOUND` for the three new mutations and for both with `toIndex`; signed out → `UNAUTHENTICATED`; `"Bad ID!"` → `INVALID_PAINT_ID`; A's row unchanged |
| T5 | R2, R3 | `plans what a drop does` | `src/features/palettes/drop-plan.test.ts` | Pure `planDrop(active, over, palette)` returns the right call and index for every row of the drop table; group→main, already-in-group, same spot and no `over` → `none` with a reason; a group heading over a paint row → `none` |
| T6 | R6 | `announces drags with names and positions` | `src/features/palettes/drop-plan.test.ts` | Pick up, over (same list and cross-list), drop (reorder, add, move), no-op and cancel messages match the wording in Defaults; unknown paints say "Unknown paint" |
| T7 | R1, R10 | `arrange mode swaps row controls for handles` | `src/features/palettes/palette-arrange.test.tsx` | Arrange shows "Drag X" and "Move X" for every paint row and group, hides the link, Groups, Remove and Actions; handles have the instructions as their description; Done restores the controls and focuses Arrange |
| T8 | R1 | `arrange is disabled offline` | `src/features/palettes/palette-arrange.test.tsx` | Offline: Arrange disabled with the note shown; going offline inside the mode disables handles and Move buttons |
| T9 | R9 | `a move shows at once and reverts on failure` | `src/features/palettes/palette-arrange.test.tsx` | The optimistic updater rewrites `palettes.get` for each mutation (unit-tested as a pure function with a fake local store); a rejected mutation toasts "Couldn't move X. Check your connection and try again." |
| T10 | R7, R10 | `Move sheet moves a paint or group by one or to an end` | `src/features/palettes/move-sheet.test.tsx` | Top, Up, Down and Bottom call the right mutation with the right index; first row disables Top and Up, last disables Down and Bottom; a one-item list disables all four; focus returns to the Move button; offline disables the actions; errors show a message |
| T11 | R5 | `drag preview shows only swatch, name and brand` | `src/features/palettes/drag-preview.test.tsx` | Paint preview has the swatch, name and brand and no buttons or links; unknown paint fallback; a group preview shows its name; the root carries the glass class |
| T12 | R5 | `glass keeps preview text readable` | `src/features/palettes/drag-preview.test.tsx` | Reads `--color-glass`'s mix percentage and the text tokens from `tokens.css`, composites them over black and white with culori, and asserts ≥4.5:1 in light and dark |
| T13 | R2, R3, R4, R6 | `arranges a palette by keyboard and mouse` | `tests/e2e/palettes.spec.ts` | Real layout: keyboard Space, ArrowDown, Space reorders All paints and the live region says "Dropped…"; a mouse drag from All paints into a group adds; a mouse drag group→group moves; Move sheet Move up on a group; order kept after reload; cleans up |

**Not unit testable:**
- **R4 touch:** hold-to-drag, page scroll outside the handle, and auto-scroll near the floating nav are checked by hand on an iPhone in Safari and in the installed PWA. Step 2 stops for this before the rest is built.
- **R5 visuals:** the glass look, blur and reduced motion are checked by hand.
- **R10 layout:** 320px and 200% text, plus 44px targets, are measured in Playwright where possible and otherwise checked by hand.
- **VoiceOver:** reading the announcements on iOS is a manual check.

All of these go in the stage summary.

## Implementation plan

1. [x] Add `movePaint`, `moveGroupPaint`, `moveGroup` and the optional `toIndex` on `addPaintToGroup` and `movePaintToGroup`, with owner and index checks — touches `convex/palettes.ts`, `convex/palettes.test.ts` — tests T1, T2, T3, T4
2. [x] **Spike, then stop for an iPhone check:** install the two pinned packages. Add arrange mode with handles and drag reordering of All paints only, plus `drop-plan.ts` for reorders and the optimistic update for `movePaint`. The user runs it on an iPhone (Safari and the installed PWA) and confirms hold-to-drag, scroll outside the handle and auto-scroll before step 3 starts. If touch can't be made to work, stop and re-plan. — touches `package.json`, `package-lock.json`, `src/features/palettes/palette-detail.tsx`, `palette-detail.css`, `drop-plan.ts` — tests T5 (reorder rows), T7, T8, T9 (`movePaint`)
3. [x] Add the glass drag preview and reduced-motion handling — touches `src/features/palettes/drag-preview.tsx`, `drag-preview.css`, `drag-preview.test.tsx`, `palette-detail.tsx` — tests T11, T12
4. [x] Make groups and their paints draggable: reorder groups and paints within a group, and cross-list drops (add and move at a position), with filtered collision detection, drop highlights and focus after a cross-list drop — touches `src/features/palettes/palette-groups.tsx`, `palette-groups.css`, `drop-plan.ts`, `drop-plan.test.ts`, `palette-detail.tsx` — tests T5 (all rows), T9 (all mutations)
5. [x] Add named announcements and handle instructions for every drag — touches `src/features/palettes/drop-plan.ts`, `drop-plan.test.ts`, `palette-detail.tsx` — tests T6
6. [x] Add the Move sheet to paint rows and group headings in arrange mode — touches `src/features/palettes/move-sheet.tsx`, `move-sheet.css`, `move-sheet.test.tsx`, `palette-detail.tsx`, `palette-groups.tsx` — tests T10
7. [x] Extend the E2E journey — touches `tests/e2e/palettes.spec.ts` — tests T13
8. [x] Update docs — touches `docs/API.md`, `docs/UX_FLOWS.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `docs/features/palettes.md`, `docs/PRD.md`, `docs/ROADMAP.md` — tests none (docs only)

`palette-arrange.test.tsx` (T7–T9) is written in step 2 and extended in step 4.

**Must not change:**
- the `palettes` schema;
- the existing palette functions' arguments, return values and behaviour when `toIndex` is left out;
- `removePaint` clearing a paint from every group;
- outside arrange mode, every row control, its label, offline handling and focus handling from `palette-paints` and `palette-groups`;
- the group sheets (membership, actions, rename, delete);
- `PaintRow` and the Paints and My Paints lists.

**High-risk steps:**
- **Step 1:** new mutations that write user data and must keep the owner checks.
- **Step 2:** adds the two approved dependencies to the lockfile, and is a hard stop for the user's iPhone check.

## Risks and open questions

- **dnd-kit maintenance (open):** the classic packages haven't been released since 2024-12 and haven't been tried with React 19.3 here. Step 2 is the dead-end check. If it fails on the iPhone, the options are `@dnd-kit/react` 0.5 (before 1.0) or a hand-built pointer drag, and either needs a new plan and your approval.
- **iOS touch (open until step 2):** pointer events, the hold delay, `touch-action: none` on the handle, auto-scroll under the fixed glass nav, and the installed PWA's overscroll. Only a real device answers these. I can't run it; you do.
- **Nested sortables:** one `DndContext` holds the All paints list, one list per group and the group headings, which is dnd-kit's hardest pattern. Cross-list rows don't shift (see Defaults) to keep it manageable. The cost is that the drop position shows as an insertion line, not a gap.
- **Keyboard moves across lists:** `sortableKeyboardCoordinates` moves to the nearest droppable in the arrow's direction, so getting from All paints into a group takes several presses, through every row in between. Acceptable with the Groups and Move to group menus as alternatives. E2E checks that it works at all.
- **jsdom has no layout:** dnd-kit's sensors need real rects, so component tests cover the pure `drop-plan` functions, the mode switch, the Move sheet and the optimistic updater, and the real drag paths are tested in Playwright (T13).
- **E2E needs the functions on your personal Convex dev deployment** (`npx convex dev`), as last time. T11 from `palette-groups` hasn't run either. If it still can't run at stage, both go in the summary as not run.
- **Optimistic updates and concurrent edits:** an optimistic move against a palette another device just changed can flash the wrong order until the server result arrives. The last write still wins (DECISIONS 049).
- **The arrange button is a new control in the "All paints" heading row.** It needs a check at 320px with a long translated label, though there's no localisation today.
- **Arrange mode hides the Groups and Remove buttons.** Someone who wants to remove a paint has to tap Done first. That's deliberate, to keep rows to two buttons, and recorded in the DECISIONS entry.
- **DECISIONS entry (053):** records arrange mode, the handle-only drag, the drop table, the moves being sent by position, the optimistic updates, the cross-list insertion line, and dnd-kit pinned with the `@dnd-kit/react` alternative turned down.
- **The epic file is modified in the main checkout.** `wi new` set child 4 to "planned" in `epic-palettes.md`. That's an uncommitted change on `dev`, so `deploy:dev` will refuse until it's committed.

## Progress log

- 2026-10-13 — Planned.
- 2026-10-13 — Plan approved.
- 2026-10-13 — Started on branch story/palette-drag-drop from origin/dev.
- 2026-10-13 — Step 2 built without the planned iPhone stop: the user approved completing the item; the iPhone check moves to the stage summary as a must-do before accept. A drag that ends offline is ignored rather than cancelled mid-drag (dnd-kit has no public cancel). Drag instructions set in step 2 because the T7 test needs them; the drag component lives in palette-arrange.tsx.
- 2026-10-13 — Build complete: steps 1-8 done. E2E T13 written, not run (needs functions on the personal Convex dev deployment). iPhone touch check still outstanding.
- 2026-10-13 — Staged: verification passed; version 0.17.0 → 0.18.0; no changelog file.
