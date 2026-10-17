---
type: bug
slug: palette-group-drag-offset
status: staged
branch: bug/palette-group-drag-offset
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/bug-palette-group-drag-offset
created: 2026-10-16
approved: 2026-10-16
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.19.4
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Group drag lands away from the pointer once groups collapse

## Summary

Dragging a group in arrange mode can leave the drag preview well away from where it was grabbed. Picking up a group collapses every group to its heading, which can shorten the page by hundreds of pixels; the browser clamps the scroll position, so dnd-kit's one-time layout-shift compensation can't put the heading back under the pointer, and the preview (placed at the heading's new position) ends up 60–130px off. The preview now keeps the grab point under the pointer or finger for the whole drag; drop targets already followed the pointer. Fixes GitHub issue #23.

## Context

Issue: #23, reported on v0.19.3. Follows `docs/implementation-plans/palettes/bug-palette-group-drag-gap.md` (the collapse; its plan listed "content jump under the pointer" as a risk to check) and `docs/implementation-plans/bug-palette-drag-focus-loss.md`.

**Reproduce:** open a palette with three groups, two holding four paints each. Tap Arrange. Scroll to the bottom and drag the first group by its handle, or drag the last group from anywhere the page can't scroll up far enough.

**Measured (Playwright probe against the dev server, v0.19.3 code, 2026-10-16):**

| Profile | Drag | Scroll max before → after pick-up | Heading moved | Preview off the grab point |
|---|---|---|---|---|
| iPhone 15 (WebKit) | first group, page at bottom | 649 → 81 | 136px | 88px |
| iPhone 15 | last group | 649 → 81 | 64px | 64px |
| iPhone 15 | middle group, page mid-way | 649 → 81 | 0 | 0 |
| Desktop Chrome | first group, page at bottom | 508 → 0 | 126px | 126px |

The preview was always the heading row's height (44px), so the drag node's size is not the cause.

**Cause (`@dnd-kit/core` 6.3.1, `node_modules/@dnd-kit/core/dist/core.esm.js`):** `DragOverlay` positions the preview at the active node's first measured rect (`useInitialValue(activeNodeRect)`), and `useRect` first measures in a layout effect after the collapse commits, so the preview starts where the heading is after the collapse. `useLayoutShiftScrollCompensation` scrolls once by the heading's movement to put it back, but when the collapse shortens the page below the current scroll position the scroll is clamped and the rest of the shift is left in. The sensor's transform is the pointer's movement since the press, so the preview stays offset by that leftover for the whole drag, and `closestCenter` picks targets from the offset preview.

## Scope

**In scope**

- Keeping the grab point under the pointer for mouse and touch group drags, for the preview and for collision detection.

**Out of scope**

- Keyboard group drags: there is no pointer, and keyboard moves step between heading rects.
- Paint drags: nothing collapses, so nothing shifts.
- Stopping the page itself from jumping when groups collapse; the list may still move under the finger, but the preview and the drop target follow the finger.
- The collapse and the #22 focus handling.

## Requirements

- **R1** — During a mouse or touch group drag, the drag preview keeps the point where the group was grabbed under the pointer, within 2px, including when picking up the group shortens the page.
- **R2** — During a mouse or touch group drag, the group lands on the heading nearest the preview.
- **R3** — Keyboard group drags and paint drags position the preview as before.
- **R4** — Group reorder results, focus handling and announcements are unchanged.

## Acceptance criteria

- **AC1** (R1) — Given the page scrolled to the bottom, when the user mouse-drags the first group's handle, then the preview's top is the pointer's y minus the grab offset in the heading, within 2px.
- **AC2** (R2) — Given AC1, when the user moves the pointer over the last group's heading and releases, then the dragged group is last.
- **AC3** (R3) — Given a keyboard group drag, then the preview sits at the dragged heading, as before.
- **AC4** (R4) — Existing arrange unit and e2e tests pass unchanged.

## Test plan

Unit tests in `src/features/palettes/palette-arrange.test.tsx` (Vitest + Testing Library), and one Playwright journey in `tests/e2e/palettes.spec.ts`, which runs against the production build with real layout (TESTING §2). jsdom has no layout, so the unit test stubs `getBoundingClientRect`: a group section reports `top: 300` while its group still renders paint rows and `top: 100` once collapsed, 44px tall, so picking it up "moves" it 200px like a clamped scroll. The dnd-kit overlay wrapper is the parent of `.drag-preview`; its on-screen top is its inline `top` plus the `translate3d` y in its inline `transform`.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `keeps the grab point under the pointer when a group drag moves the heading` | `src/features/palettes/palette-arrange.test.tsx` | Regression: with the stubbed rects, mouse down on "Drag group Highlights" at y 310 (grab offset 10), move to y 330; the overlay wrapper's top + translate y is 320. Fails on current code (120). |
| T2 | R3 | `places a keyboard group drag preview at the heading` | `src/features/palettes/palette-arrange.test.tsx` | Same stubbed rects; Space on "Drag group Highlights"; the overlay wrapper's translate y is 0 (no grab-point shift for the keyboard). |
| T3 | R4 | (existing) arrange tests | `src/features/palettes/palette-arrange.test.tsx` | Still pass unchanged. |
| T4 | R1, R2 | `keeps a dragged group under the pointer when picking it up shortens the page` | `tests/e2e/palettes.spec.ts` | Palette with three groups, two holding paints; Arrange; scroll to the bottom; mouse-drag the first group's handle: the `.drag-preview` top is within 2px of pointer y minus the grab offset; move over the last heading and release; group headings read the dragged group last. Fails on current code (88–126px off). |

**Not unit testable:** touch-hold drags on a real iPhone (installed PWA): scroll to the bottom of a palette with full groups, hold and drag the first group, and confirm the preview stays under the finger and lands where it's dropped.

## Implementation plan

1. [x] Keep the grab point under the pointer: in `PaletteArrange`, record in `onDragStart` (before the collapse renders) the pointer's offset from the top of the dragged group's sortable node, for mouse and touch group drags only, and pass `DragOverlay` a modifier that shifts the preview's transform by `pressY - grabOffset - activeNodeRect.top` so the preview keeps that offset under the pointer; clear it on drop and cancel — touches `src/features/palettes/palette-arrange.tsx`, `src/features/palettes/palette-arrange.test.tsx` — tests T1, T2, T3
2. [x] E2E journey for the clamped-scroll case — touches `tests/e2e/palettes.spec.ts` — tests T4
3. [x] Docs: note the grab-point modifier and why — touches `docs/features/palettes.md` — tests none

**Must not change:** sortable IDs and which element is the sortable node; `planDrop` and announcements; collision detection rules (groups only on headings); Convex functions and schema; the collapse and #22 focus handling.

**High-risk steps:** None.

## Risks and open questions

- **Modifier and scroll during the drag.** The sensor transform is in viewport coordinates and the preview is `position: fixed`, so the shift is a constant for the drag. If the page auto-scrolls mid-drag, dnd-kit adjusts collisions for scroll separately; T4 covers a drop after the collapse, and the manual check covers auto-scroll on a long palette.
- **Collision box follows the modifier.** Resolved: a `DndContext` modifier also moves `collisionRect`, and T4 showed groups then dropped short by the clamp. dnd-kit measures the overlay, shift included, for its collision box, so targets follow the corrected preview and the modifier goes on `DragOverlay` only; the shift is fixed at the first measure because `activeNodeRect` can be re-measured mid-drag. It reads `activeNodeRect`, not `draggingNodeRect`: dnd-kit measures the overlay including its transform, which already holds the shift.
- **E2E runs a preview server.** `npm run test:e2e` builds and serves the app on port 4173 for the length of the run (playwright.config.ts `webServer`), against the Convex deployment in `.env.local`.

## Progress log

- 2026-10-16 — Planned.
- 2026-10-16 — Plan approved.
- 2026-10-16 — Started on branch bug/palette-group-drag-offset from origin/dev.
- 2026-10-16 — Re-planned: browser probe showed the overlay was already heading-sized; real cause is clamped scroll after the collapse defeating dnd-kit's layout-shift compensation. Reverted the heading-node change (3c03d34); new plan keeps the grab point under the pointer with a DndContext modifier
- 2026-10-16 — Step 1 revised after T4: modifier moved from DndContext to DragOverlay (26c9654); on DndContext it shifted drop targets by the clamp. Existing 'arranges a palette by keyboard and mouse' e2e fails on origin/dev code too (pre-existing, filed separately)
- 2026-10-16 — Review: shift fixed at first measure; comment/docs corrected (targets follow via the measured overlay, not a scroll adjustment); T4 asserts the page shortened below the scroll position (WebKit doesn't move the heading, so a heading-moved guard failed there)
- 2026-10-16 — Test audit: added touch, mid-drag re-measure and two-drags tests; each kills its mutant. Remaining survivors (paint drags without the group check, a single reset removed) behave the same as the real code
- 2026-10-16 — Staged: verification passed; version 0.19.3 → 0.19.4; no changelog file.
