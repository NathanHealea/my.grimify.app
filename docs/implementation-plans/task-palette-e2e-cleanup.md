---
type: task
slug: palette-e2e-cleanup
status: staged
branch: task/palette-e2e-cleanup
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/task-palette-e2e-cleanup
created: 2026-10-17
approved: 2026-10-17
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.19.6
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Clean up palettes left by failed e2e journeys

## Summary

Each journey in `tests/e2e/palettes.spec.ts` creates a palette on the shared E2E user and deletes it as its last step, so a journey that fails earlier leaves its palette behind. After a day of failing runs on 2026-10-17 the user hit the 50-palette cap and every palette journey failed at "Create" until the leftovers were deleted by hand. An `afterEach` hook now deletes the test's palette through the app if it's still there. Fixes GitHub issue #25.

## Context

Issue: #25. Found while working on #23 and #24 (`task-arrange-e2e-races`).

The shared E2E user is `grimify-e2e+clerk_test@example.com` (DECISIONS 032), created by `tests/e2e/global-setup.ts`. Palettes are capped at 50 per user (`convex/palettes.ts`, "You can have up to 50 palettes"). The five journeys name their palettes `E2E <kind> <project> <timestamp>` and end with Palette actions → Delete palette → confirm.

## Scope

**In scope**

- Deleting a failed journey's palette after the test, in `tests/e2e/palettes.spec.ts`.

**Out of scope**

- Runs killed outright (Ctrl-C, a crashed worker): no hook runs. A global sweep of old `E2E …` palettes would cover that; not needed so far.
- Other spec files: `collection.spec.ts` un-owns its paint per profile and has no cap.
- App code.

## Requirements

- **R1** — When a palette journey fails after creating its palette, its palette is deleted after the test.
- **R2** — When a journey passes (and so deleted its palette), the hook does nothing and doesn't slow it down beyond one list check.
- **R3** — The journeys' own steps and assertions are unchanged, including the first journey's delete check.
- **R4** — A cleanup that can't delete the palette fails loudly in the report, after the test's own error.

## Acceptance criteria

- **AC1** (R1) — Given a journey forced to fail right after creating its palette, when the test ends, then the E2E user's palette list doesn't contain that palette.
- **AC2** (R2, R3) — Given the palettes spec, when run on both projects, then all journeys pass as before.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R4 | Forced failure (manual, temporary) | `tests/e2e/palettes.spec.ts` | Temporarily add a failing `expect` after "Create" in one journey; run it; the run fails on that assertion only, and a follow-up listing of the user's palettes shows no palette with that name. Reverted after. |
| T2 | R2, R3 | (existing) all five palette journeys | `tests/e2e/palettes.spec.ts` | Pass on iPhone 15 and Pixel 7. |

**Not unit testable:** this is e2e infrastructure; T1 is its check.

## Implementation plan

1. [x] Add the cleanup: a per-test palette name each journey records when it builds its name, and a `test.afterEach` that, if a palette with that name is listed on `/palettes`, opens it and deletes it the way the journeys do — touches `tests/e2e/palettes.spec.ts` — tests T1, T2
2. [x] Docs: note the cleanup in TESTING's palettes line — touches `docs/TESTING.md` — tests none

**Must not change:** the journeys' steps and assertions; app code; other specs.

**High-risk steps:** None. (It deletes only palettes the current test named, on the shared test user.)

## Risks and open questions

- **A broken app breaks cleanup too.** If palettes can't be opened or deleted, the hook fails as well; Playwright reports it after the test's own error (R4).
- **Module state.** The name lives in a module variable; a Playwright worker runs one test at a time, so tests don't share it.

## Progress log

- 2026-10-17 — Planned.
- 2026-10-17 — Plan approved.
- 2026-10-17 — Started on branch task/palette-e2e-cleanup from origin/dev.
- 2026-10-17 — T1 passed: forced failure after Create, palette gone after the run; all 10 palette journeys pass
- 2026-10-17 — Review: hook returns on the signed-out screen; T1 re-run passes (no leftover)
- 2026-10-17 — Staged: verification passed; version 0.19.5 → 0.19.6; no changelog file.
