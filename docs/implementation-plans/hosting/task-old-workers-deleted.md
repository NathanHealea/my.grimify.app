---
type: task
slug: old-workers-deleted
status: released
branch: task/old-workers-deleted
worktree_path: /home/nathan/development/grimify/my.grimify.app-worktrees/task-old-workers-deleted
created: 2026-10-20
approved: 2026-10-20
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.21.3
review_approved: 2026-10-20
pr:                  # set by `wi pr`
tag: v0.21.3
---

# Record that the old dev and stage Workers are deleted

## Summary

On 2026-10-20 the owner had the old `v2-grimify-app-dev` and `v2-grimify-app-stage` Workers deleted. `dev.grimify.app`, `stage.grimify.app` and their `www.` names no longer respond. The docs still describe those Workers as running and to be deleted. This updates them to say it's done, and keeps `v2-grimify-app` described as the Worker serving `grimify.app` until the marketing cutover.

## Context

- **What was deleted:** `npx --no wrangler delete` ran for each Worker after `deployments list` confirmed both existed. Afterwards the four old names returned no response, while `dev.my.grimify.app`, `stage.my.grimify.app`, `my.grimify.app` and `grimify.app` returned 200. All checks were on 2026-10-20.
- **Stale text:**
  - `docs/ENVIRONMENT.md` § Cloudflare Workers, the "Retiring the old Workers" paragraph and its commands;
  - `docs/DEPLOYMENT.md` line 14 ("keep their domains until they're deleted");
  - DECISIONS 060, its third Decision bullet and the trade-off's last sentence.
- **Historical text stays:** DECISIONS 044 and the one-time setup steps describe the past.

## Scope

**In scope**

- The four places listed under stale text.

**Out of scope**

- **`v2-grimify-app`** and the marketing cutover.
- **The `www.grimify.app` redirect rule**, which the docs say exists but which returned 200 on 2026-10-20. Noted for the cutover item.

## Requirements

- **R1** — No current doc says the old dev or stage Workers are running, or tells the reader to delete them.
- **R2** — The docs say when they were deleted, and that `v2-grimify-app` is the only old Worker left, serving `grimify.app` until the cutover.

## Acceptance criteria

- **AC1** (R1, R2) — Given the topic docs, when I search for `v2-grimify-app-dev` and `v2-grimify-app-stage`, then every hit outside DECISIONS 044 says they were deleted on 2026-10-20.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R2 | grep check | — | `grep -rn "v2-grimify-app-dev\|v2-grimify-app-stage" docs` outside implementation-plans and DECISIONS 044 shows only "deleted 2026-10-20" wording |

**Not unit testable:** docs only. T1 is a manual grep, recorded in the progress log, plus `npm run check` and `npm run build` as usual.

## Implementation plan

1. [x] Say the old dev and stage Workers are deleted in ENVIRONMENT.md, DEPLOYMENT.md and DECISIONS 060 — touches `docs/ENVIRONMENT.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md` — tests T1

**Must not change:** code, config, DECISIONS 044.

**High-risk steps:** None.

## Risks and open questions

- None.

## Progress log

- 2026-10-20 — Planned.
- 2026-10-20 — Plan approved.
- 2026-10-20 — Started on branch task/old-workers-deleted from origin/dev.
- 2026-10-20 — T1 grep: only DECISIONS 044 (history) and the new deleted-on-2026-10-20 wording mention the old dev/stage Workers. Docs-only diff, self-reviewed.
- 2026-10-20 — Staged: verification passed; version 0.21.2 → 0.21.3; no changelog file.
- 2026-10-20 — Review approved.
- 2026-10-20 — Released 0.21.3 as v0.21.3.
