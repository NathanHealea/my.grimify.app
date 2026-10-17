---
type: task
epic: legacy-import    # removed by `wi new` when there is no parent epic
slug: legacy-staging
status: in-progress
branch: task/legacy-staging
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/task-legacy-staging
created: 2026-10-17
approved: 2026-10-17
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the merge commit
---

# Stage the import in Convex with an admin loader

## Summary

Adds the Convex side of the old-data import: a `legacyImports` table that holds each old user's mapped data under their email hash until they claim it, a `legacyImportClaims` table that remembers which hashes were already claimed or discarded, an internal mutation that writes the export in chunks, and an admin script, `npm run legacy:load <env> <export.json>`, that loads an export from `legacy:export` into a chosen deployment. Nothing user-visible changes; the claim flow is the next child.

## Context

- Epic: `docs/implementation-plans/legacy-import/epic-legacy-import.md` (R2, R4). Depends on `legacy-export`, whose `scripts/legacy/transform.ts` defines the export record: `emailHash` (64 lowercase hex), `ownedPaintIds`, `palettes[{ name, paintIds, groups[{ name, paintIds }] }]`, already cut to 60-character names, 200 paints and 30 groups.
- Convex: read `convex/_generated/ai/guidelines.md` first. Functions use argument validators and `withIndex`; internal functions for anything only admins run. `convex/palettes.ts` holds the caps (`MAX_PALETTES` 50, `MAX_NAME_LENGTH` 60, `MAX_PAINTS` 200, `MAX_GROUPS` 30) and `convex/userPaints.ts` the `PAINT_ID` pattern.
- Limits that shape the design: a document is at most 1 MiB and an array at most 8,192 items; `npx convex run` takes the arguments as one command-line argument, and Linux caps one argument at 128 KiB. A user can own every catalog paint (2,837 IDs, about 130 KB as JSON) and the old app had no palette cap, so one record can exceed one call.
- `npx convex run` has no `--env-file`; it targets the deployment named by `CONVEX_DEPLOY_KEY` in its environment, else `.env.local`'s dev deployment. `scripts/deploy.ts` already maps env names to `.env.deploy.<env>.local` (`environmentFor`, `settingsFile`), each holding `CONVEX_DEPLOY_KEY`.
- Tests: `convex-test` in `convex/*.test.ts` (see `convex/palettes.test.ts`), Vitest for scripts.

## Scope

**In scope**

- Schema: `legacyImports` (`emailHash`, `ownedPaintIds`, `palettes`, `palettesOmitted`, `complete`, `loadedAt`; index `by_emailHash`) and `legacyImportClaims` (`emailHash`, `claimedAt`; index `by_emailHash`).
- `legacyImports.stageChunk` internal mutation.
- `scripts/legacy-load.ts` and its chunking, plus the `legacy:load` npm script.
- Docs: DATABASE.md (tables), API.md (internal function), DECISIONS (staging by email hash in Convex, next to DECISIONS 028), `docs/features/legacy-import.md`, ENVIRONMENT.md (how to run the loader).

**Out of scope**

- Any public function, claim or UI (`legacy-claim`).
- Purging (`legacy-purge`).
- Loading real data: an owner-run step, and only into production. Dev and stage get a made-up export hashed with their own key.

## Requirements

- **R1** — `stageChunk` (internal) takes `emailHash`, `reset`, `done`, `ownedPaintIds` and `palettes`. With `reset`, it replaces any staged row for the hash with a new one holding this chunk, `complete: false` and `loadedAt` now; without `reset`, it appends to the existing row (and fails if there is none); with `done`, it sets `complete: true`.
- **R2** — `stageChunk` does nothing and returns `"claimed"` when the hash is in `legacyImportClaims`; otherwise it returns `"staged"`.
- **R3** — `stageChunk` validates input: `emailHash` is 64 lowercase hex characters; each paint ID matches `PAINT_ID`; names are 1–60 characters after trimming; a palette has at most 200 paints and 30 groups; owned paint IDs stay unique across chunks.
- **R4** — A staged row keeps at most 50 palettes (the per-user cap, so more could never be imported); extra palettes are counted in `palettesOmitted`, not stored.
- **R5** — `legacy:load <env> <file>` validates the export file, splits each record into chunks whose JSON stays under 100 KB, and calls `stageChunk` through `npx --no convex run` against that environment's deployment, passing the deploy key only through the child process environment; it prints per-record outcomes as counts (staged, already claimed, failed), never hashes or data.
- **R6** — Loading the same file twice leaves the same staged rows (one per hash, same contents), and never re-stages a claimed hash.

## Acceptance criteria

- **AC1** (R1, R6) — Given a record split into three chunks, when they are staged in order, then one complete row holds all owned paints and palettes; staging the record again replaces it with an identical row.
- **AC2** (R2) — Given a hash in `legacyImportClaims`, when a chunk for it is staged with `reset`, then the result is `"claimed"` and no row exists.
- **AC3** (R3) — Given an `emailHash` of `"abc"`, a paint ID `"Bad ID"`, or a 61-character name, when staged, then the call fails and nothing is written.
- **AC4** (R4) — Given 60 palettes for one hash, when fully staged, then 50 palettes are stored and `palettesOmitted` is 10.
- **AC5** (R5) — Given a record whose owned list alone is 130 KB of JSON, when chunked, then every chunk's JSON is under 100 KB and the chunks together hold every item in order.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `stageChunk builds a row across chunks and marks it complete` | `convex/legacyImports.test.ts` | reset + append + done → one row, owned and palettes concatenated in order, `complete` true, `loadedAt` set from the fake clock. Append with no row fails. |
| T2 | R1, R6 | `stageChunk with reset replaces an existing row` | `convex/legacyImports.test.ts` | Staging a record twice leaves one row with the second load's contents. |
| T3 | R2 | `stageChunk skips claimed hashes` | `convex/legacyImports.test.ts` | Hash in `legacyImportClaims` → returns `"claimed"`, no row written. |
| T4 | R3 | `stageChunk rejects invalid input` | `convex/legacyImports.test.ts` | Bad hash, bad paint ID, empty and 61-char names, 201 paints, 31 groups each throw; nothing written. Duplicate owned IDs across chunks are stored once. |
| T5 | R4 | `stageChunk keeps at most 50 palettes` | `convex/legacyImports.test.ts` | 60 palettes over two chunks → 50 stored, `palettesOmitted` 10. |
| T6 | R5 | `chunkRecord keeps every chunk under the size limit` | `scripts/legacy/load.test.ts` | A record with 2,837 owned IDs and 60 large palettes → chunks each serialize under 100 KB, first has `reset`, last has `done`, concatenation equals the input. A record with no data yields one chunk with `reset` and `done`. |
| T7 | R5 | `loadExport runs one convex call per chunk with the deploy key in the environment` | `scripts/legacy/load.test.ts` | With a stub runner: argv is `npx --no convex run legacyImports:stageChunk <json>`; env has `CONVEX_DEPLOY_KEY` and no `CONVEX_DEPLOYMENT`; counts staged/claimed/failed from the results; a failed chunk stops that record and is counted. |
| T8 | R5 | `readExport rejects a malformed export file` | `scripts/legacy/load.test.ts` | Missing `records`, a bad hash, or an unknown field fails with the record index. |

**Not unit testable:** None. A load into the dev deployment with a fixture export is the manual end-to-end check (Risks).

## Implementation plan

1. [ ] Add the `legacyImports` and `legacyImportClaims` tables and `stageChunk` — touches `convex/schema.ts`, `convex/legacyImports.ts`, `convex/legacyImports.test.ts` — tests T1, T2, T3, T4, T5
2. [ ] Add export reading, chunking and the loader runner — touches `scripts/legacy/load.ts`, `scripts/legacy/load.test.ts` — tests T6, T7, T8
3. [ ] Add the `legacy:load` CLI and npm script — touches `scripts/legacy-load.ts`, `package.json` — tests none (wiring only)
4. [ ] Document the staging tables and loader — touches `docs/DATABASE.md`, `docs/API.md`, `docs/DECISIONS.md`, `docs/ENVIRONMENT.md`, `docs/features/legacy-import.md` — tests none (docs only)

**Must not change:** existing tables, indexes and public functions; `scripts/deploy.ts` behavior (its helpers may be imported, not changed).

**High-risk steps:** Step 1 adds tables that will hold data about people (email hashes and their collections). Additive schema change only; no existing data touched.

## Risks and open questions

- **Deploy key with `convex run`.** The CLI is expected to honor `CONVEX_DEPLOY_KEY` from the environment for `run` as it does for `deploy`; confirm against the dev deployment with a fixture export before relying on it for production.
- **Call count.** One `convex run` per chunk takes about a second; a few hundred users is minutes. Acceptable for a one-off.
- **Half-loaded rows.** A load interrupted mid-record leaves `complete: false`; the claim flow must ignore incomplete rows, and a re-run replaces them.
- **Claim tombstones hold only the hash and a time.** They let a re-load skip claimed users; `legacy-purge` removes them with the staged rows at the retention limit.

## Progress log

- 2026-10-17 — Planned.
- 2026-10-17 — Plan approved.
- 2026-10-17 — Approved under the owner's autonomous-delivery instruction for the legacy-import epic (2026-10-17)
- 2026-10-17 — Started on branch task/legacy-staging from origin/dev.
