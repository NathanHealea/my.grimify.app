---
type: task
epic: legacy-import    # removed by `wi new` when there is no parent epic
slug: legacy-purge
status: in-progress
branch: task/legacy-purge
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/task-legacy-purge
created: 2026-10-17
approved: 2026-10-17
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the merge commit
---

# Purge unclaimed imports after the retention period

## Summary

Adds a daily Convex cron that deletes staged old-Grimify imports and claim records older than 180 days, so data about people who never joined the new app doesn't stay in Convex indefinitely. Retention was set to 180 days on 2026-10-17.

## Context

- Epic: `docs/implementation-plans/legacy-import/epic-legacy-import.md` (R8). Depends on `legacy-staging`: `legacyImports.loadedAt` (set when a record is staged with `reset`) and `legacyImportClaims.claimedAt`.
- Convex crons: `convex/crons.ts` with `crons.interval` or `crons.cron` only (guidelines); deletions in batches with a scheduled continuation, as `users.deletePaints` does (`DELETE_BATCH` 500 in `convex/users.ts`).
- Queries can't read the clock, but mutations can (`Date.now()`); the purge is an internal mutation.

## Scope

**In scope**

- Indexes `by_loadedAt` on `legacyImports` and `by_claimedAt` on `legacyImportClaims`.
- `legacyImports.purgeExpired` internal mutation and a daily cron.
- Docs: DATABASE.md (retention), API.md, `docs/features/legacy-import.md`.

**Out of scope**

- Changing the retention period at runtime.
- Purging anything other than the two legacy tables.

## Requirements

- **R1** — `purgeExpired` deletes every `legacyImports` row whose `loadedAt` is more than 180 days before now, complete or not, and every `legacyImportClaims` row whose `claimedAt` is more than 180 days before now; newer rows are kept.
- **R2** — `purgeExpired` deletes at most 500 rows per transaction and schedules itself again while expired rows remain.
- **R3** — A cron runs `purgeExpired` once a day.

## Acceptance criteria

- **AC1** (R1) — Given a staged row loaded 181 days ago and one loaded 179 days ago, when the purge runs, then only the first is gone; the same for claim records.
- **AC2** (R2) — Given 1,200 expired rows, when the purge runs, then all are deleted across three transactions.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `purgeExpired deletes only rows past 180 days` | `convex/legacyImports.test.ts` | Fake clock; rows at 181 and 179 days in both tables → only the 181-day rows deleted; exactly 180 days kept. |
| T2 | R2 | `purgeExpired works in batches` | `convex/legacyImports.test.ts` | 1,200 expired rows → after `finishAllScheduledFunctions`, none left; first transaction deletes 500. |
| T3 | R3 | `crons register a daily purge` | `convex/crons.test.ts` | The default export has a job running `internal.legacyImports.purgeExpired` every 24 hours. |

**Not unit testable:** None.

## Implementation plan

1. [ ] Add retention indexes and `purgeExpired` — touches `convex/schema.ts`, `convex/legacyImports.ts`, `convex/legacyImports.test.ts` — tests T1, T2
2. [ ] Schedule the daily purge — touches `convex/crons.ts`, `convex/crons.test.ts` — tests T3
3. [ ] Document retention — touches `docs/DATABASE.md`, `docs/API.md`, `docs/features/legacy-import.md` — tests none (docs only)

**Must not change:** `stageChunk`, `claim` and the claim actions; other tables.

**High-risk steps:** Step 1 deletes data (only the two legacy tables, only rows past retention).

## Risks and open questions

- **Re-loading resets the clock.** Staging a record with `reset` sets a new `loadedAt`; a re-load after the production load extends that user's retention. The loader is run once per environment.
- **Claim records expire too.** After 180 days a claimed hash could be re-staged by a re-load of an old export file; the export file is deleted after the production load (epic Risks).

## Progress log

- 2026-10-17 — Planned.
- 2026-10-17 — Plan approved.
- 2026-10-17 — Approved under the owner's autonomous-delivery instruction for the legacy-import epic (2026-10-17)
- 2026-10-17 — Started on branch task/legacy-purge from origin/dev.
