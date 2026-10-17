---
type: task
slug: arrange-e2e-races
status: staged
branch: task/arrange-e2e-races
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/task-arrange-e2e-races
created: 2026-10-17
approved: 2026-10-17
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.19.5
review_approved: 2026-10-17
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Fix races in the palette arrange e2e journey

## Summary

The `arranges a palette by keyboard and mouse` journey in `tests/e2e/palettes.spec.ts` has failed on both Playwright projects since it was added in v0.18.0. The app works; the test acts faster than dnd-kit's internal timers allow, which is unlikely for a person and recoverable (a lost arrow is announced as the paint staying put). It now waits on signals the page shows before each step. Fixes GitHub issue #24.

## Context

Issue: #24. Found while working on #23.

**Not a regression:** the journey fails the same way on v0.18.0 (where it was added), v0.19.1 and current `dev`.

**Diagnosis (Playwright with temporary logging in a scratch worktree, 2026-10-17):** three races with `@dnd-kit/core` 6.3.1 (`node_modules/@dnd-kit/core/dist/core.esm.js`):

1. **Keyboard pick-up.** `KeyboardSensor.attach()` adds its keydown listener in a `setTimeout`; measured 20ms after pick-up on Pixel 7, 7ms on iPhone 15. The journey presses ArrowDown straight after Space, so the sensor never sees it, the paint stays at position 1, and the next Space drops it in place ("Mephiston Red is back at position 1 of 3"). Neither the drag preview nor the announcement shows the listener is ready, and waiting one timer turn wasn't enough on Chromium.
2. **Mouse drag straight after a keyboard drop.** The press lands during the 250ms drop animation, while the drop preview animates over the page, and no drag starts; the live region still reads the keyboard drop when the mouse is released, and Trim gets no paint.
3. **Click straight after a mouse drop.** `AbstractPointerSensor` blocks clicks on the document for 50ms after a pointer drag ends; the journey's next click ("Move group Trim") is swallowed and the Move sheet never opens.

With a 500ms pause before ArrowDown and a wait for the drop to settle, the journey passes; the mouse drops themselves work on both engines.

## Scope

**In scope**

- Making the arrange journey wait for dnd-kit before each step, using what the page shows.

**Out of scope**

- App code: acting within 20–250ms of a pick-up or drop is unlikely for a person (switch access or key macros could), and the result is announced and can be retried. Worth a check on a low-end Android device if it's reported.
- Other journeys, and cleanup of palettes left by failed runs (a failed run skips its delete step; filed separately if wanted).

## Requirements

- **R1** — The arrange journey passes on iPhone 15 and Pixel 7, three runs in a row each, against current `dev` code.
- **R2** — The journey waits on page signals, not fixed sleeps: the drag preview gone after each drop, the live region for the keyboard move, and the Move sheet for the click after a drop.
- **R3** — A lost ArrowDown or Move click is retried at most once; a delivered one is repeated only if it isn't announced within 500ms, and more than two presses fails the step within 5s.

## Acceptance criteria

- **AC1** (R1) — Given the journey, when run with `--repeat-each 3 --workers 1` on both projects, then all six runs pass.
- **AC2** (R2) — Given the journey's source, then it has no `waitForTimeout`.
- **AC3** (R3) — Given the keyboard step, then ArrowDown is pressed only while the live region says position 1, and the step ends when it says position 2.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R3 | `arranges a palette by keyboard and mouse` (existing, fixed) | `tests/e2e/palettes.spec.ts` | Passes 3 runs in a row on each project; failed on every run before. |
| T2 | R2 | Source check | `tests/e2e/palettes.spec.ts` | `grep waitForTimeout` finds nothing in the journey. |

**Not unit testable:** None; this is the test.

## Implementation plan

1. [x] Wait for dnd-kit in the arrange journey: after each drop (keyboard and in `mouseDrag`) wait for `.drag-preview` to be gone, which outlasts the 50ms click block; for the keyboard move, press ArrowDown inside `expect(...).toPass()` only while the live region reads position 1, and expect position 2; open the Move sheet the same way (click only while it's closed), since a drop that unmounts the dragged row skips the animation and the 50ms click block can outlast the preview — touches `tests/e2e/palettes.spec.ts` — tests T1, T2

**Must not change:** app code; the journey's steps and assertions; the other journeys.

**High-risk steps:** None.

## Risks and open questions

- **Reduced motion.** With `prefers-reduced-motion`, there's no drop animation, so the preview disappears at once and the 50ms click block could still swallow a click. Playwright doesn't emulate reduced motion in these projects; if that changes, the click step needs its own wait.
- **Shared test user.** Failed runs leave palettes on the shared E2E user; 50 hit the cap on 2026-10-17 and were deleted by hand. Worth a follow-up issue for `test.afterEach` cleanup.

## Progress log

- 2026-10-17 — Planned.
- 2026-10-17 — Plan approved.
- 2026-10-17 — Started on branch task/arrange-e2e-races from origin/dev.
- 2026-10-17 — Passes 4/4 on each project serially; Move sheet click also guarded after a 1-in-6 swallowed click (drop to another group skips the animation)
- 2026-10-17 — Review: guards bounded (<=2 presses/clicks, 5s); Enter wouldn't avoid the click block (it dispatches a click); doc softened to 'unlikely, recoverable'. 6/6 passes after
- 2026-10-17 — Staged: verification passed; version 0.19.4 → 0.19.5; no changelog file.
- 2026-10-17 — Review approved.
