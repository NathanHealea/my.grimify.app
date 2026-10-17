---
type: bug
slug: palette-drag-focus-loss
status: in-progress
branch: bug/palette-drag-focus-loss
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/bug-palette-drag-focus-loss
created: 2026-10-16
approved: 2026-10-16
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Focus is lost when a pointer group drag collapses the focused paint row

## Summary

In arrange mode, starting a group drag by mouse or touch while keyboard focus sits on a paint row inside a group drops focus to the top of the page: the group drag collapses every group to its heading, which unmounts the focused control. Focus now moves to the dragged group's drag handle when the drag starts, so a user who mixes keyboard and pointer keeps their place. Fixes GitHub issue #22 (WCAG 2.1 SC 2.4.3 Focus Order).

## Context

Issue: #22, filed from the `palette-group-drag-gap` review (v0.19.2). Follows `docs/implementation-plans/palettes/bug-palette-group-drag-gap.md`.

**Reproduce:** open a palette with two groups, one holding paints. Tap Arrange. Tab to a paint row's "Move <name>" or "Drag <name>" button inside a group. Then drag a group heading's handle with the mouse (or a touch hold). After the drop, press Tab.

**Observed:** the collapse removes the focused paint control, focus falls to `<body>`, and Tab starts again from the top of the page. dnd-kit's own focus restore is off (`restoreFocus: false`), and `PaletteArrange` only puts focus back after keyboard-started drags (`byKeyboard`, `focusAfterDrop`).

**Expected:** focus lands on the dragged group's drag handle, which stays mounted through the collapse and the drop.

**Cause:** `ArrangeGroup` in `src/features/palettes/palette-groups.tsx` renders no paint rows while `collapsed` (a group is the active drag item). The paint rows' controls carry `data-drag-handle` / `data-move-button` set to their sortable ID, `group:<groupId>:<paintId>` (`sortableIdOf` in `palette-arrange.tsx`). Pointer sensors don't move focus on press in Safari, and mouse presses on a `<button>` don't focus it in Safari either, so focus can stay on a paint control while a heading is dragged.

## Scope

**In scope**

- Moving focus to the dragged group's handle when a group drag starts while focus is on a control that the collapse removes.

**Out of scope**

- Keyboard-started drags: focus is already on the group handle, and the existing drop/cancel focus handling stays.
- Paint drags: nothing collapses.
- Focus on anything outside group paint rows (All paints rows, Done, page links): the collapse doesn't remove it, so it's left alone.
- Screen reader virtual cursor behaviour (not controllable from focus).

## Requirements

- **R1** — When a group drag starts by mouse or touch and focus is on a Move or Drag control of a paint row inside any group, focus moves to the dragged group's "Drag group <name>" handle.
- **R2** — After that drag ends by drop or cancel, focus is still on that group's handle, not on `<body>`.
- **R3** — When a group drag starts and focus is anywhere else (not on a group paint row control), focus does not move.
- **R4** — Paint drags never move focus at drag start.

## Acceptance criteria

- **AC1** (R1) — Given arrange mode with focus on "Drag Mephiston Red" inside Trim, when the user mouse-drags "Drag group Highlights", then focus is on "Drag group Highlights".
- **AC2** (R2) — Given AC1, when the user releases the mouse, then focus is still on "Drag group Highlights".
- **AC3** (R3) — Given focus on the Done button, when the user mouse-drags "Drag group Trim", then focus stays on Done.
- **AC4** (R4) — Given focus on "Move Blood Red" inside Trim, when the user mouse-drags "Drag Mephiston Red", then focus stays on "Move Blood Red".

## Test plan

Vitest + Testing Library in `src/features/palettes/palette-arrange.test.tsx`, using the existing `twoGroups()` fixture. Mouse drags: `fireEvent.mouseDown` on the handle, then `fireEvent.mouseMove(document, …)` past the 5px activation distance, then `fireEvent.mouseUp(document)`. Focus is placed with `.focus()` before the press; jsdom doesn't move focus on mousedown of a `fireEvent`, matching Safari.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `moves focus to the dragged group's handle when a pointer group drag hides the focused paint row` | `src/features/palettes/palette-arrange.test.tsx` | Regression: focus on "Drag Mephiston Red" in Trim, mouse-drag "Drag group Highlights"; once Highlights has `data-dragging`, `document.activeElement` is "Drag group Highlights". Fails on current code (focus is `<body>`). |
| T2 | R2 | `keeps focus on the group handle after a pointer group drag that moved it ends` | `src/features/palettes/palette-arrange.test.tsx` | After T1's setup and `mouseUp`, Trim's paint rows are back and `document.activeElement` is "Drag group Highlights". |
| T3 | R3 | `leaves focus alone when a pointer group drag starts with focus outside the group rows` | `src/features/palettes/palette-arrange.test.tsx` | Focus on Done, mouse-drag "Drag group Trim"; after drag start, `document.activeElement` is Done. |
| T4 | R4 | `leaves focus alone when a pointer paint drag starts` | `src/features/palettes/palette-arrange.test.tsx` | Focus on "Move Blood Red" in Trim, mouse-drag "Drag Mephiston Red"; after drag start, `document.activeElement` is "Move Blood Red". |

**Not unit testable:** touch-hold drags and real Safari focus behaviour; check by hand on an iPhone (installed PWA) with a hardware keyboard or Full Keyboard Access: Tab to a paint row in a group, touch-hold and drag a group, then press Tab after the drop and confirm it continues from the group handle.

## Implementation plan

1. [ ] Move focus at group drag start: in `PaletteArrange`'s `onDragStart`, when the active item is a group and `document.activeElement` has a `data-drag-handle` or `data-move-button` starting with `group:`, focus `[data-drag-handle="heading:<groupId>"]` — touches `src/features/palettes/palette-arrange.tsx`, `src/features/palettes/palette-arrange.test.tsx` — tests T1, T2, T3, T4
2. [ ] Docs: note the focus move in the Arrange mode paragraph — touches `docs/features/palettes.md` — tests none

**Must not change:** Convex functions and schema; `planDrop` and announcement texts; keyboard drop/cancel focus handling (`focusAfterDrop`); sortable IDs; the collapse itself.

**High-risk steps:** None.

## Risks and open questions

- **Focus during an active drag.** Calling `focus()` on the group handle mid-drag could, in principle, trigger dnd-kit's keyboard sensor or scroll the page. The keyboard sensor only activates on keydown, and `focus({ preventScroll: true })` avoids a scroll jump while the finger is down. Verify on the phone.
- **Tests depend on dnd-kit's MouseSensor under jsdom.** No existing test drives a pointer drag. If MouseSensor won't activate in jsdom (it reads `clientX/clientY` from the events, so it should), fall back to touch events, and log the change.
- **Attribute coupling.** The check reads the `group:` prefix of `sortableIdOf`'s paint IDs. Both live in `palette-arrange.tsx`, so a change to the ID scheme sits next to the check.

## Progress log

- 2026-10-16 — Planned.
- 2026-10-16 — Plan approved.
- 2026-10-16 — Started on branch bug/palette-drag-focus-loss from origin/dev.
