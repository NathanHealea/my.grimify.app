---
type: task
slug: paints-cap-test-timeout
status: in-progress
branch: task/paints-cap-test-timeout
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/task-paints-cap-test-timeout
created: 2026-10-18
approved: 2026-10-18
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the merge commit
---

# Give the select-mode cap test an explicit timeout

## Summary

"select mode caps the selection at 200" renders 201 rows and ticks 200 of them. After #28 it takes 1.6–3 s alone but 10–17 s in the full parallel suite on the development machine, over Vitest's 5 s default, so verification fails intermittently and blocks staging. Give that one test an explicit 15 s timeout with a comment saying why, as a stopgap until #29 removes the remaining per-tick screen re-render.

## Context

- Measured 2026-10-18 on the fix branch for `legacy-claim-admin-email`: full suite 10–17 s for this test (default and 4 workers), alone 1.6–3.2 s.
- Root-cause follow-up: GitHub issue #29. Owner approved the stopgap in conversation (option 2).

## Scope

**In scope**

- `{ timeout: 15_000 }` and a one-line why on "select mode caps the selection at 200".

**Out of scope**

- Other tests ("renders 60 rows…" also timed out once; tracked in #29).
- App code.

## Requirements

- **R1** — The cap test has a 15 s timeout and a comment naming why and #29; its assertions are unchanged.

## Acceptance criteria

- **AC1** (R1) — Given the full suite on the development machine, when it runs, then the cap test doesn't fail on the 5 s default.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `select mode caps the selection at 200` | `src/features/catalog/paints-screen.test.tsx` | Unchanged assertions; passes in two consecutive full `npx vitest run` runs. |

**Not unit testable:** None.

## Implementation plan

1. [ ] Add the explicit timeout and its reason — touches `src/features/catalog/paints-screen.test.tsx` — tests T1

**Must not change:** the test's assertions; app code.

**High-risk steps:** None.

## Risks and open questions

- A timeout is a stopgap: it hides further slowdowns up to 15 s. #29 tracks removing it.

## Progress log

- 2026-10-18 — Planned.
- 2026-10-18 — Plan approved.
- 2026-10-18 — Approved by the owner in conversation (option 2, 2026-10-18)
- 2026-10-18 — Started on branch task/paints-cap-test-timeout from origin/dev.
