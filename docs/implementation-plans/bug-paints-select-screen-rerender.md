---
type: bug
slug: paints-select-screen-rerender
status: released
branch: bug/paints-select-screen-rerender
worktree_path: /home/nathan/development/grimify/my.grimify.app-worktrees/bug-paints-select-screen-rerender
created: 2026-10-19
approved: 2026-10-19
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.21.1
review_approved: 2026-10-20
pr:                  # set by `wi pr`
tag: v0.21.1
---

# Ticking in Select mode re-renders the whole Paints screen

## Summary

In Select mode, each tick still re-renders the whole Paints screen: the search form, the Filters sheet, the chips, the selection bar, and all 201 row elements, which are rebuilt and memo-compared. A tick costs about 8–10 ms in jsdom (the simulated browser the tests run in), against a floor of 0.35 ms for a click that changes no state. That makes "select mode caps the selection at 200" take 10–17 s under full-suite load. It and "renders 60 rows, then more, and an empty state" now time out and block releases, even with a 15 s stopgap. The same work happens on a phone, on every tick.

This change moves the ticked IDs into a small store that each row subscribes to for its own paint. A tick then re-renders only the ticked row and the selection bar. Both explicit timeouts come off. Fixes GitHub issue #29.

## Context

- **Issue:** #29, open, a follow-up from #28 / `bug-paints-select-rerender` (v0.20.2). That bug made a tick re-render only the ticked row's `<PaintRow>`. The screen above the rows still re-renders.
- **What blocked:** on 2026-10-19 the full `npm run check` failed on these two tests in 4 of about 8 runs. That blocked releasing `app-subdomain`. The cap test, which already had 15 s, took 17.4 s.
- **Where the selection lives:** `src/features/catalog/paints-screen.tsx` holds `selected: string[] | null` in `PaintsSearch` (line 77). It derives:
  - `selecting` and `selectedIds` (a `Set`);
  - `atCap`;
  - `toggle`.

  Every tick sets that state, so `PaintsSearch` re-renders. That rebuilds `filterChips` and runs `suggest(draft)`, and re-renders `<PaintsFilters>`, `<SelectionBar>`, `<HueDots>` and the input. It also maps `results.slice(0, limit)` into new `<ResultRow>` elements, memo-compared one by one, and passes `<LoadMore>` a new `onVisible`, which re-subscribes its IntersectionObserver.
- **Profile (2026-10-19)**, a temporary test of 100 ticks over 201 rows, since deleted:

  | Variant | ms/tick |
  |---|---|
  | as shipped | 8.2–10.5 |
  | `<PaintsFilters>` mocked out | 7.7 |
  | `<SelectionBar>` mocked out | 8.2 |
  | `<PaintToggles>` mocked out | 8.1 |
  | trivial row, no Filters, no bar | 6.4–6.6 |
  | trivial row, click with no state change (floor) | 0.35 |

  Only the ticked row's `<PaintRow>` re-rendered (100 renders for 100 ticks), so #28's fix holds. About 6 ms of each tick is `PaintsSearch` re-rendering and rebuilding the list. Moving the state out of `PaintsSearch` removes that.
- **Existing pattern:** `useOnlineStatus` (`src/features/pwa/use-online-status.ts`) uses `useSyncExternalStore`, React's hook for reading an outside store. The new store follows it; no new dependency.
- **Cap behaviour:** `MAX_SELECTED` is 200 (`selection-bar.tsx`). Reaching or leaving the cap disables or enables every unticked row, so those two transitions re-render every row once. That's legitimate.
- **Who uses the screen:** `PaintsScreen` serves both Paints and My Paints (docs/features/palettes.md).

## Scope

**In scope**

- `src/features/catalog/selection-store.ts`: a per-screen store of ticked IDs in tick order. It offers `toggle`, `clear`, `subscribe`, and snapshots for "is this ID ticked", "count" and "the ordered IDs", with hooks built on `useSyncExternalStore`.
- **`PaintsSearch`** keeps only "selecting or not" in state. Rows read their own ticked and disabled state from the store; `<SelectionBar>` reads the IDs and count.
- **`<LoadMore>`** gets a stable `onVisible`.
- **Both explicit timeouts and their comments come off.** Both tests must fit Vitest's 5 s default.
- **Docs:** features/catalog/search-and-filters.md § Select mode, for where the ticked IDs live.

**Out of scope**

- **Visible behaviour:** tick order, the cap, focus moves, the bar's text, and "search and filter changes keep the selection; leaving the screen drops it" stay exactly as they are.
- **Virtualising the list.**
- **`<PaintsFilters>` performance** outside Select mode.
- **The staged timeout work item** (`task-paints-paging-test-timeout`). This fix makes it moot, so it's dropped; see Risks.

## Requirements

- **R1** — Ticking or unticking a paint re-renders only that paint's row and the selection bar. It doesn't re-render the search form, the Filters sheet or any other row. Reaching or leaving the 200 cap may re-render every row once.
- **R2** — Select mode behaves exactly as before:
  - tick order is kept;
  - unticked boxes are disabled at 200;
  - the bar shows "n selected" and the cap note;
  - search and filter changes keep the ticks;
  - Done and a successful add end the mode and clear the ticks;
  - focus moves as documented;
  - leaving the screen drops the ticks.
- **R3** — "select mode caps the selection at 200" and "renders 60 rows, then more, and an empty state" pass with no explicit timeout, under Vitest's 5 s default, in the full parallel suite.
- **R4** — The store keeps IDs in tick order and ignores a toggle that would pass the cap. A tick re-renders only the hooks whose answer changed; a row for an untouched ID doesn't re-render. (Every listener is called; React skips the re-render because the snapshot is unchanged.)

## Acceptance criteria

- **AC1** (R1) — Given Select mode with 4 rows, when I tick one, then `<PaintsFilters>` doesn't re-render, and only the ticked row's `<PaintRow>` does.
- **AC2** (R2) — Given every existing Select mode test in `paints-screen.test.tsx`, when the suite runs, then each passes unchanged apart from removing the timeouts.
- **AC3** (R3) — Given three consecutive full `npm run check` runs, when they finish, then both tests pass each time with no explicit timeout.
- **AC4** (R4) — Given a store with a, b and c ticked, when I untick b, then the IDs are [a, c] (T5). Given an empty store, when I tick b, then a `useTicked(b)` hook re-renders and a `useTicked(a)` hook doesn't; `useAtCap` re-renders only on reaching or leaving the cap (T7).

## Test plan

Vitest in jsdom, beside the code, following `paints-screen.test.tsx`. Render counts use the file's existing `vi.mock` wrapper pattern, which counts renders without test hooks in app code.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `ticking a paint doesn't re-render the filters` | `src/features/catalog/paints-screen.test.tsx` | with `<PaintsFilters>` wrapped in a render counter (like `PaintRow`), ticking one row adds 0 `PaintsFilters` renders. Fails on current code |
| T2 | R1 | existing `ticking a paint re-renders only that row` | `src/features/catalog/paints-screen.test.tsx` | unchanged; still passes |
| T3 | R2 | every existing Select mode test | `src/features/catalog/paints-screen.test.tsx` | unchanged assertions pass |
| T4 | R3 | `select mode caps the selection at 200`, `renders 60 rows, then more, and an empty state` | `src/features/catalog/paints-screen.test.tsx` | assertions unchanged; cheaper queries; `{ timeout: 15_000 }` and both comments removed; pass under the 5 s default in three consecutive full runs |
| T5 | R4 | `keeps ticks in order and toggles off` | `src/features/catalog/selection-store.test.ts` | toggle a, b, c, then b: `ids()` is [a, c]; `count()` is 2 |
| T6 | R4 | `ignores a tick past the cap` | `src/features/catalog/selection-store.test.ts` | with max 2, ticking a third ID leaves [a, b]; unticking still works |
| T7 | R4 | `re-renders only the hooks whose answer changed` | `src/features/catalog/selection-store.test.ts` | via `renderHook`, toggling b re-renders the `useTicked(b)` hook and not `useTicked(a)`; `useAtCap` changes only on reaching or leaving the cap |
| T8 | R2 | `clear empties the selection` | `src/features/catalog/selection-store.test.ts` | after `clear()`, `ids()` is [] and every ticked hook reads false |

**Not unit testable:** the phone-side gain. After the dev deploy, check on a phone that 50 or more quick ticks in Select mode stay responsive. AC3's three-run check is recorded in the progress log.

## Implementation plan

1. [x] Add the selection store and its hooks (`useTicked(id)`, `useSelectedIds()`, `useAtCap()`) with unit tests — touches `src/features/catalog/selection-store.ts`, `src/features/catalog/selection-store.test.ts` — tests T5, T6, T7, T8
2. [x] Wire `PaintsSearch`, `ResultRow` and `<SelectionBar>` to the store. Keep only `selecting` in screen state, give `<LoadMore>` a stable `onVisible`, and add the Filters render-count test — touches `src/features/catalog/paints-screen.tsx`, `src/features/catalog/selection-bar.tsx`, `src/features/catalog/paints-screen.test.tsx` — tests T1, T2, T3
3. [x] In the two slow tests, swap testing-library role queries that run its accessibility check over the whole page for equivalents that check the same thing (`getAllByLabelText` for the checkboxes, `hidden: true` where another test already covers visibility), then remove both explicit timeouts and their comments — touches `src/features/catalog/paints-screen.test.tsx` — tests T4
4. [x] Update Select mode's docs on where the ticked IDs live — touches `docs/features/catalog/search-and-filters.md`, `docs/features/palettes.md` — tests none (docs only)

**Must not change:**
- `<PaintRow>`'s props and default rendering (paint detail uses it).
- `<SelectionBar>`'s visible output, and `<AddToPaletteSheet>`'s contract.
- Routes and search params.
- `MAX_SELECTED`.

**High-risk steps:** None. No auth, data, schema or deletion; `git revert` undoes it.

## Risks and open questions

- **Revised 2026-10-19 (owner-approved):** step 2's profile showed the two tests' time is mostly testing-library role queries, not ticks. `getByRole` for a button took 661 ms against 56 ms with `hidden: true`, and `getAllByRole` for the checkboxes took 350 ms against 49 ms for `getAllByLabelText`. The paging test never enters Select mode. Step 3 now swaps those queries in the two tests. The global `defaultHidden` setting was rejected because it weakens accessibility checks suite-wide.
- **Decided: drop `task-paints-paging-test-timeout`.** It's staged and accepted but unreleased, and its one change (a 15 s timeout) is what step 3 removes. Dropping it deletes its local branch and worktree, which were never pushed. I'll confirm before deleting.
- **Risk: the gain may fall short of 5 s under load.** The floor is 0.35 ms per click, plus one row and the bar. If the cap test still runs long, profile again before adding any timeout back.
- **Risk: one store per screen instance.** The store must be created per `PaintsSearch` mount (`useState(() => createSelection())`), not at module level, so Paints and My Paints never share ticks and leaving the screen drops them (R2).
- **Risk: rows must subscribe narrowly.** `useSyncExternalStore` re-renders whenever the snapshot changes. `useTicked(id)` must return a boolean so unrelated ticks don't change it. Selecting the whole ID list in a row would bring back the per-tick re-render.

## Progress log

- 2026-10-19 — Planned.
- 2026-10-19 — Plan approved.
- 2026-10-19 — Started on branch bug/paints-select-screen-rerender from origin/dev.
- 2026-10-19 — Step 1: the store was written alongside its tests rather than after them, so red wasn't shown directly; the test-engineer showed the tests fail on a missing module and on five broken stores (no cap, no untick, wide useTicked, count-based useAtCap, no-op clear).
- 2026-10-19 — Step 2 implemented (uncommitted). Ticks now ~4.4 ms (was 8-10). Phase profile of the cap test: getByRole button 661 ms vs 56 ms with hidden:true; getAllByRole checkboxes 350 ms vs getAllByLabelText 49 ms. Test time is dominated by testing-library role-query accessibility checks over large DOMs, not ticks; the paging test never enters select mode. R3 can't be met by the store alone. Stopped to ask.
- 2026-10-19 — Plan revised (owner-approved): step 3 swaps the slow role queries in the two tests before removing the timeouts.
- 2026-10-19 — Step 3: three consecutive full npm run check runs passed (546/546). In full-suite vitest runs the paging test took ~1.9 s and the cap test 2.7-3.0 s against the 5 s default. Also replaced step 2's two-component row with one memoized row: switching component types remounted every row on entering Select mode.
- 2026-10-19 — Review cycle 1: restored the shared rows()/selectionBar() helpers (long-list tests get their own hidden:true variants), renamed T1 to match what it checks, listed selection-store.test.ts in the feature doc, reworded R4/AC4 to re-render rather than notify. Security: none. A11y: no product regression.
- 2026-10-19 — Review cycle 2: four later Select mode tests had picked up the hidden bar query by mistake; restored. T7 renamed; AC4 reworded to match T5/T7. Two review cycles done.
- 2026-10-19 — Test audit: 14/20 mutants killed. Added tests for leaving the screen dropping ticks and for unsubscribe (both shown to catch their mutants). Left as notes: redundant clears in start/stop, LoadMore onVisible stability and ResultRow memo untested (performance only).
- 2026-10-19 — Staged: verification passed; version 0.21.0 → 0.21.1; no changelog file.
- 2026-10-20 — Review approved.
- 2026-10-20 — Released 0.21.1 as v0.21.1.
