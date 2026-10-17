---
type: bug
slug: palette-group-drag-offset
status: in-progress
branch: bug/palette-group-drag-offset
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/bug-palette-group-drag-offset
created: 2026-10-16
approved: 2026-10-16
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Group drag lands away from the pointer once groups collapse

## Summary

Dragging a group in arrange mode picks its drop spot from a point well below the pointer once the groups collapse to their headings, so the group shifts and lands away from where it was grabbed. dnd-kit measures the whole group section at pick-up, before the collapse, and sizes the drag overlay and its collision center from that tall rect. The heading row becomes the sortable node instead, so the measured rect, the overlay and the collision center are one heading row. Fixes GitHub issue #23.

## Context

Issue: #23, reported on v0.19.3. Follows `docs/implementation-plans/palettes/bug-palette-group-drag-gap.md` (the collapse) and `docs/implementation-plans/bug-palette-drag-focus-loss.md`.

**Reproduce:** open a palette with three or more groups, one holding several paints. Tap Arrange. Drag that group by its handle over the other headings.

**Observed:** the shift and the drop target don't follow the pointer; they act as if the pointer were lower by about half the dragged group's full (expanded) height.

**Expected:** the group lands on the heading under the pointer, by mouse, touch or keyboard.

**Cause (from `node_modules/@dnd-kit/core/dist/core.esm.js`, 6.3.1):** `ArrangeGroup` in `src/features/palettes/palette-groups.tsx` passes `setNodeRef` from `useSortable` to the `<section>`. At pick-up `useInitialRect` measures that node during render, before the collapse commits. `DragOverlay` positions `PositionedOverlay` with `useInitialValue(activeNodeRect)`, setting its `width`/`height` from that rect, and `dragOverlay.rect` (the collision rect) keeps that size. `closestCenter` then compares the centre of a full-group-height box with heading rects that were re-measured at one row each after the collapse. For a group of five paints the centre sits roughly two and a half rows below the grab point.

## Scope

**In scope**

- Making the group heading row the sortable node for group drags, so the active rect, overlay size and collision rect are one heading row.
- Keeping the shift transform and `data-dragging` placeholder styling on the section.

**Out of scope**

- The collapse itself and the focus handling from #22.
- Paint drags and the `zone:` droppable (unchanged).
- Layout-shift scroll compensation when groups above the dragged one collapse; dnd-kit already scrolls to keep the dragged node in place where the page can scroll.

## Requirements

- **R1** — During a group drag, the drag overlay is the size of the group's heading row, not the expanded group.
- **R2** — During a group drag, the group lands on the heading nearest the dragged heading, by mouse, touch or keyboard.
- **R3** — The dragged group's section still shows the dashed placeholder (`data-dragging`) and still shifts with the sorting transform.
- **R4** — Group reordering results (which group ends where) and announcements are unchanged.

## Acceptance criteria

- **AC1** (R1) — Given a group whose section is 240px tall with a 48px heading row, when the user picks it up, then the overlay is 48px tall.
- **AC2** (R2) — Given three groups on a phone, when the user drags a five-paint group by its handle onto the third heading, then it lands third.
- **AC3** (R3) — Given a group drag in progress, then the dragged group's section has `data-dragging`.
- **AC4** (R4) — Given a keyboard group drag of Trim down one place, when dropped, then `moveGroup` is called with Trim and `toIndex` 1 and the existing announcements play.

## Test plan

Vitest + Testing Library in `src/features/palettes/palette-arrange.test.tsx`. jsdom has no layout, so T1 stubs `getBoundingClientRect` for the test: elements with class `palette-groups__group` report 240px tall, `palette-groups__heading` 48px, everything else falls through to jsdom's zeros. dnd-kit's overlay wrapper is the parent element of `.drag-preview`, and gets an inline `height` from the measured rect.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `sizes the group drag overlay to the heading row` | `src/features/palettes/palette-arrange.test.tsx` | Regression: with the stubbed rects, after Space on "Drag group Trim", the `.drag-preview` parent's `style.height` is `48px`. Fails on current code (`240px`). |
| T2 | R3 | (existing) `collapses every group to its heading while a group is dragged` | `src/features/palettes/palette-arrange.test.tsx` | Still passes: Trim's section gets `data-dragging` during the drag. |
| T3 | R4 | (existing) group keyboard reorder and announcement tests | `src/features/palettes/palette-arrange.test.tsx` | Still pass unchanged. |

**Not unit testable:** R2 needs real layout and collision. Verify by hand on an iPhone (installed PWA) and desktop Chrome: with three groups, one of five or more paints, drag that group by mouse, touch hold and keyboard over each heading and confirm the shift and the drop follow the pointer; repeat with the page scrolled.

## Implementation plan

1. [x] Make the heading row the sortable node: in `ArrangeGroup`, move `setNodeRef` from the `<section>` to `.palette-groups__heading`, keeping `data-dragging` and the `--drag-*` transform variables on the section — touches `src/features/palettes/palette-groups.tsx`, `src/features/palettes/palette-arrange.test.tsx` — tests T1, T2, T3
2. [x] Docs: note that the heading row is the group's sortable node and why — touches `docs/features/palettes.md` — tests none

**Must not change:** sortable IDs; `planDrop` and announcements; the `zone:` droppable around each group; Convex functions and schema; the collapse and #22 focus handling.

**High-risk steps:** None.

## Risks and open questions

- **Diagnosis is from the library source.** Not yet reproduced in a browser. T1 proves the overlay size; the manual check proves the drop follows the pointer.
- **Shift distances.** `verticalListSortingStrategy` computes shifts from the sortable nodes' rects and the gaps between them. With headings as nodes, the gap includes the section's padding and border, so shifts still equal the distance between collapsed sections. Check by hand that neighbours shift by exactly one section.
- **Drop animation.** dnd-kit animates the overlay to the active node on drop, now the heading row, which is where the group ends up. Check it looks right.

## Progress log

- 2026-10-16 — Planned.
- 2026-10-16 — Plan approved.
- 2026-10-16 — Started on branch bug/palette-group-drag-offset from origin/dev.
