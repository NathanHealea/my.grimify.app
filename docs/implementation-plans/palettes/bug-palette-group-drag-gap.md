---
type: bug
epic: palettes    # removed by `wi new` when there is no parent epic
slug: palette-group-drag-gap
status: staged
branch: bug/palette-group-drag-gap
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/bug-palette-group-drag-gap
created: 2026-10-14
approved: 2026-10-14
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.19.2
review_approved: 2026-10-16
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Group drag leaves a group-sized gap

## Summary

Dragging a group in arrange mode leaves a large empty space once it passes another group, as tall as the dragged group with all its paints. While a group is being dragged, every group now collapses to its heading row, so each group, including the dragged one's placeholder, is one row tall and groups shift by one row as the drag passes them.

## Context

Epic: `docs/implementation-plans/palettes/epic-palettes.md`, child 5. Follows `palette-drag-drop` (v0.18.0).

**Reproduce:** open a palette with two or more groups, at least one holding several paints. Tap Arrange. Drag a group by its heading's handle past a neighbouring group.

**Observed:** the neighbour shifts, and a gap the full height of the dragged group (heading plus every paint row) opens where the dragged group used to sit. The gap is the dragged group's own `<section>`, left in place with the dashed `[data-dragging]` outline while the glass `DragOverlay` follows the pointer.

**Expected (user's request):** while dragging a group, every group shows as a single row (its heading), and the dragged group's placeholder is the size of one row.

**Cause:** `src/features/palettes/palette-groups.tsx` sorts groups with `verticalListSortingStrategy`. In `@dnd-kit/sortable` 10.0.0 (`node_modules/@dnd-kit/sortable/dist/sortable.esm.js`, `verticalListSortingStrategy`), passed items shift by the active item's full measured height, and the active item's placeholder keeps that height. Groups vary from one row to dozens, so the shift and placeholder are as tall as the whole group.

Relevant code:

- `ArrangeGroup` in `palette-groups.tsx`: the `<section>` is the sortable node (`setNodeRef`); inside it, `.palette-groups__zone` holds the heading and either `.palette-groups__paints` or `.palette-groups__empty`.
- `PaletteArrange` in `palette-arrange.tsx`: the one `DndContext`; `onDragStart` sets `dragging`. It uses default measuring, which measures droppable rects when the drag starts.
- `useDndContext()` exposes `active` and `measureDroppableContainers(ids)`.

## Scope

**In scope**

- Collapsing every group to its heading row while a group is dragged, by pointer, touch or keyboard.
- Making dnd-kit measure the collapsed sizes so shifts and the placeholder are one row.

**Out of scope**

- Paint drags. Groups stay expanded while a paint is dragged, since a paint lands on a row inside a group.
- The All paints section; it isn't part of the group list.
- The Move sheet; it doesn't change layout.
- Animating the collapse. It happens in one frame, which also covers reduced motion.

## Requirements

- **R1** — While a group is being dragged, every group in arrange mode shows only its heading row: no paint rows and no "No paints in this group yet" text.
- **R2** — While a group is being dragged, the dragged group's placeholder and each group that shifts out of its way are one heading row tall, so no gap taller than one row opens.
- **R3** — When the group drag ends by drop or by cancel (pointer, touch or keyboard), every group shows its paints again.
- **R4** — While a paint is being dragged, groups stay expanded and show their paints.
- **R5** — During a keyboard group drag, focus stays on the dragged group's handle, and the pick-up, over and drop announcements are unchanged (WCAG 2.4.3, 4.1.3).

## Acceptance criteria

- **AC1** (R1) — Given arrange mode with groups Trim (2 paints) and Highlights (empty), when the user picks up the Trim handle, then neither group shows paint rows or empty-group text, and both headings stay visible.
- **AC2** (R2) — Given a tall group dragged past a one-row group on a phone, when the neighbour shifts, then the space left is one heading row tall, not the height of the dragged group with its paints.
- **AC3** (R3) — Given a group drag in progress, when the user drops it or presses Escape, then every group shows its paints again.
- **AC4** (R4) — Given arrange mode, when the user picks up a paint's handle in a group, then every group still shows its paint rows.
- **AC5** (R5) — Given a keyboard user picks up a group with Space, when the groups collapse, then focus stays on that group's drag handle and the pick-up announcement is "Picked up group Trim…" as before.

## Test plan

Vitest + Testing Library, in the existing palette arrange tests. jsdom doesn't load the CSS or lay out, so the unit tests assert that paint rows and empty-group text aren't rendered while collapsed. Keyboard drags start with Space on a handle, as dnd-kit's keyboard sensor expects.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `collapses every group to its heading while a group is dragged` | `src/features/palettes/palette-arrange.test.tsx` | Regression: after Space on "Drag group Trim", Trim's paint rows and Highlights' "No paints in this group yet" are gone and both headings remain. Fails on current code. |
| T2 | R3 | `expands the groups again when a group drag is dropped or cancelled` | `src/features/palettes/palette-arrange.test.tsx` | After Space then Space (drop), and separately Space then Escape, Trim's paint rows are back. |
| T3 | R4 | `keeps groups expanded while a paint is dragged` | `src/features/palettes/palette-arrange.test.tsx` | After Space on a paint handle inside Trim, Trim's paint rows and Highlights' empty text are still rendered. |
| T4 | R5 | `keeps focus on the group handle when a keyboard group drag collapses the groups` | `src/features/palettes/palette-arrange.test.tsx` | After Space on "Drag group Trim", that handle is `document.activeElement` and the live region reads "Group Trim is over position 1 of 2.", today's text. In jsdom the over announcement replaces the pick-up in the same render, so the pick-up text can't be asserted. |

**Not unit testable:** R2 needs real layout. Verified by hand on an iPhone (Safari, installed PWA) and in desktop Chrome: with a group of 5+ paints dragged past a one-row group, the placeholder and the shift are one heading row; repeat by mouse, touch hold and keyboard. Also check the page doesn't jump the dragged heading away from the finger when groups above it collapse.

## Implementation plan

1. [x] Collapse groups during a group drag: in `PaletteGroups` (arrange branch) read `active` from `useDndContext()`, and when the active item is a group have `ArrangeGroup` skip rendering the paint list and empty text — touches `src/features/palettes/palette-groups.tsx`, `src/features/palettes/palette-arrange.test.tsx` — tests T1, T2, T3, T4
2. [x] Re-measure after the collapse: in a layout effect keyed on the collapsed state, call `measureDroppableContainers` with the group heading IDs so `verticalListSortingStrategy` uses the one-row rects; spike on a phone first, and if the rects are still stale switch `PaletteArrange`'s `DndContext` to `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` — touches `src/features/palettes/palette-groups.tsx`, possibly `src/features/palettes/palette-arrange.tsx` — tests none (layout; manual check for R2)
3. [x] Docs: note the collapse in the Arrange mode paragraph — touches `docs/features/palettes.md`, `docs/UX_FLOWS.md` (Arrange step 2) — tests none

**Must not change:** Convex functions and schema; `planDrop` and the drop table (DECISIONS 053); sortable IDs; announcement texts; the Move sheet.

**High-risk steps:** None.

## Risks and open questions

- **Stale rects.** dnd-kit measures droppables when the drag starts, possibly before the collapse renders. Step 2 re-measures; if that isn't enough, `MeasuringStrategy.Always` works but re-measures on every render for paint drags too, which costs more on a large palette. The spike decides.
- **Content jump under the pointer.** Collapsing groups above the dragged one moves its heading up the page. The overlay stays under the pointer, but on a long, scrolled palette the page may get shorter than the scroll position and jump. Check by hand; if it's bad, an open question for you on whether to scroll the heading back under the pointer.
- **Paint rows unmounted mid-drag.** Not rendering paint rows (rather than hiding them with CSS) also removes their sortable droppables, so a group can't collide with them. That's the intent, since groups only land on headings. If unmounting causes a flash on drop, fall back to hiding them with `display: none`.
- 2026-10-14 — Plan approved.
- 2026-10-14 — Started on branch bug/palette-group-drag-gap from origin/dev.
- 2026-10-14 — Step 1: no CSS needed, so no data-collapsed attribute; T4 asserts today's over announcement since jsdom overwrites the pick-up text in the same render
- 2026-10-14 — Step 2: no code. dnd-kit 6.3.1 sets status Initialized in an effect after the collapsed render commits, and its useDroppableMeasuring re-measures every droppable on that change (and again when the unmounted paint rows unregister), so heading rects are already one row. Not yet checked in a browser; R2 stays a manual phone check
- 2026-10-16 — Staged: verification passed; version 0.19.1 → 0.19.2; no changelog file.
- 2026-10-16 — Review approved.
