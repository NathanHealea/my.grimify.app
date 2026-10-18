---
type: bug
slug: paints-select-rerender
status: in-progress
branch: bug/paints-select-rerender
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/bug-paints-select-rerender
created: 2026-10-18
approved: 2026-10-18
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the merge commit
---

# Ticking a paint in Select mode re-renders every row

## Summary

In Select mode on the Paints screen, ticking one paint re-renders every visible row and checks each row against the selection with a linear scan, so a tick costs rows × selected. With 201 rows and 200 ticks the "select mode" test takes about 8 s alone and over 30 s when the full suite runs in parallel, so it times out on `dev` and blocks staging. A tick now re-renders only the row it changed (plus every row once when the 200 cap is reached or left), and the test is split into its search and cap scenarios. Fixes GitHub issue #28.

## Context

- Issue: #28. Found while staging `legacy-claim-admin-email` (2026-10-18); the timeout reproduces on `dev`.
- `src/features/catalog/paints-screen.tsx:282-305` maps `results` to `<PaintRow>`: `selected` is a `string[]`, each row computes `selected.includes(paint.id)`, and builds a new `selection` object, a new `onToggle` closure and a new `actions` element (`<PaintToggles>`) every render. `PaintRow` (`src/components/paint-row.tsx`) isn't memoized, so every row re-renders on every tick.
- `PaintRow` is also used by `src/features/catalog/paint-detail.tsx`; its props and behavior must not change.
- Profiling the test (temporary copy with per-step timers): the 200-tick loop over 201 rows took 4.0 s of 8 s (about 20 ms per tick).
- `MAX_SELECTED` (200) disables unticked rows at the cap, so reaching or leaving the cap legitimately re-renders every row once.

## Scope

**In scope**

- A memoized row component inside the Paints screen that receives primitive props and a stable toggle handler, so unchanged rows skip re-rendering.
- Selection held as a `Set` (or equivalent constant-time lookup) while keeping selection order for the selection bar.
- Splitting the test and removing its custom 30 s timeout.
- A test that counts row renders.

**Out of scope**

- Changing `PaintRow`'s props or `paint-detail.tsx`.
- Performance of My Paints or other screens.
- Issue #27 (a different teardown flake).

## Requirements

- **R1** — Ticking or unticking a paint in Select mode re-renders only that paint's row, except when the tick reaches or leaves the 200-paint cap, when every row re-renders once to update `disabled`.
- **R2** — Select mode behaves as before: ticks persist across searches, the bar shows the count and order of selection, the 201st paint is disabled at the cap and re-enabled when one is unticked, and Own/Want/Favorite toggles return when Select mode ends.
- **R3** — The search and cap scenarios are separate tests, each within Vitest's default timeout when run alone, with no custom timeout.

## Acceptance criteria

- **AC1** (R1) — Given Select mode with 4 rows, when one paint is ticked, then only that row's render count increases.
- **AC2** (R2) — Given 201 rows, when 200 are ticked, then the 201st checkbox is disabled; unticking one enables it.
- **AC3** (R3) — Given the full suite, when run, then "select mode ticks paints and keeps them across searches" and "select mode caps the selection at 200" pass without a timeout override.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `select mode re-renders only the ticked row` | `src/features/catalog/paints-screen.test.tsx` | With a render counter on rows (e.g. spying on the memoized row via a test hook or React Profiler `onRender` per row id), ticking one of 4 paints increases only that row's count; fails on current code. |
| T2 | R2 | existing first half, renamed `select mode ticks paints and keeps them across searches` | `src/features/catalog/paints-screen.test.tsx` | Unchanged assertions for ticking, persistence across searches and the bar, without the 201-row part and without `{ timeout: 30_000 }`. |
| T3 | R2, R3 | `select mode caps the selection at 200` | `src/features/catalog/paints-screen.test.tsx` | The 201-row cap assertions moved from the old test; no timeout override. |
| T4 | R2 | existing select-mode, selection-bar and paint-detail tests | `src/features/catalog/*.test.tsx`, `src/components/paint-row.test.tsx` | Still pass unchanged. |

**Not unit testable:** None. Feel on a phone (ticking many paints) is a manual nice-to-check, not a requirement.

## Implementation plan

1. [ ] Split the select-mode test into its search and cap scenarios and drop the custom timeout — touches `src/features/catalog/paints-screen.test.tsx` — tests T2, T3
2. [ ] Re-render only the ticked row: memoized row component, stable toggle by paint ID, constant-time selection lookup — touches `src/features/catalog/paints-screen.tsx`, `src/features/catalog/paints-screen.test.tsx` — tests T1, T4

**Must not change:** `PaintRow` props and behavior; `paint-detail.tsx`; selection bar behavior and the 200 cap; CSS.

**High-risk steps:** None.

## Risks and open questions

- If T3 still exceeds the default timeout after step 2 on this machine, the cap test needs fewer DOM queries (e.g. query checkboxes once), not a timeout bump.
- Memoization only works if every prop passed to the row is stable across ticks (strings, the paint object from `results`, the match label, the stable handler); the `PaintToggles` element must be created inside the memoized row.

## Progress log

- 2026-10-18 — Planned.
- 2026-10-18 — Plan approved.
- 2026-10-18 — Approved by the owner in conversation (2026-10-18); fixes #28
- 2026-10-18 — Started on branch bug/paints-select-rerender from origin/dev.
