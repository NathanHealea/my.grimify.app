---
type: task
slug: ff-promotions
status: in-progress
branch: task/ff-promotions
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/task-ff-promotions
created: 2026-10-11
approved: 2026-10-13
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Fast-forward environment promotions

## Summary

Promotes `dev` to `stage` and `stage` to `main` with fast-forward-only merges instead of `--no-ff` merge commits, and back-merges hotfixes into `dev` only. After a promotion all three branches point at the same commit, so a version tag names exactly what is live and the branches stop collecting merge commits that exist on one branch only. Amends DECISIONS 044.

## Context

DECISIONS 044 made promotions `git merge --no-ff` (`docs/DEPLOYMENT.md` § Branches, lines 40–47). Each promotion and each hotfix back-merge adds a merge commit that lives only on the receiving branch and above, so the branches never share a tip even when their files are identical: on 2026-10-11, after the www-routes hotfix, `main`, `stage` and `dev` had no file differences but `dev` held two commits `main` lacked. The owner asked for a strategy where the branches match, and chose fast-forward-only promotions (option 2) over keeping `--no-ff` (option 1) or deploying tags from one branch (option 3).

`wi` never promotes; promotions and hotfixes are manual commands in `docs/DEPLOYMENT.md`. On 2026-10-11 the owner separately switched `wi release` to fast-forward work items into `dev` (`--ff-only`) and tag the item's last commit, so no merge commits reach `dev` from releases either. DEPLOYMENT.md line 49 still says tags sit on merges into `dev` and must be corrected. `scripts/deploy.ts` checks only the branch, a clean tree and `HEAD` matching `origin/<branch>`, so it needs no change.

Fast-forward works from today's state: `origin/stage` is an ancestor of `origin/dev`, and `origin/main` of `origin/stage` (checked 2026-10-11).

## Scope

**In scope**

- `docs/DEPLOYMENT.md` § Branches: promotion commands use `git merge --ff-only`; the hotfix rule back-merges `main` into `dev` only; a short note on undoing a promotion
- `docs/DECISIONS.md`: Decision 055 amending 044's promotion line; 044's status line notes the amendment
- `CLAUDE.md` Work Item Workflow "Branches" line: hotfix back-merge into `dev` only

**Out of scope**

- `wi` and its skills (they don't promote)
- `scripts/deploy.ts` (no check depends on the merge style)
- A promote script or a deploy-time ancestry guard (possible follow-up, see Risks)
- Rewriting existing history: past `--no-ff` promotion commits stay

## Requirements

- **R1** — The documented dev→stage and stage→main promotion commands fast-forward the target branch to the source and refuse (exit non-zero, branch unchanged) when the target has commits the source lacks.
- **R2** — After both documented promotions run in order, `dev`, `stage` and `main` point at the same commit.
- **R3** — The documented hotfix procedure lands the fix on `main`, then merges `main` into `dev` only; the next documented promotions fast-forward `stage` and `main` without refusing, and all three branches end on the same commit.
- **R4** — `docs/DEPLOYMENT.md` says how to undo a bad promotion without a force push (revert on `dev` and promote, or a hotfix revert on `main`).
- **R5** — DECISIONS has an entry recording the change, its alternatives and trade-offs, and 044's status says it is amended; `CLAUDE.md` describes the same hotfix back-merge as `docs/DEPLOYMENT.md`.

## Acceptance criteria

- **AC1** (R1, R2) — Given `dev` ahead of `stage` and `stage` level with `main`, when I run the two promotion commands from DEPLOYMENT.md, then `git rev-parse dev stage main` prints one commit three times.
- **AC2** (R1) — Given `stage` has a commit that isn't in `dev`, when I run the dev→stage promotion, then it stops with git's "Not possible to fast-forward" and `stage` is unchanged.
- **AC3** (R3) — Given a hotfix merged into `main` and back-merged into `dev`, when I promote dev→stage then stage→main, then neither command refuses and all three branches point at one commit.
- **AC4** (R4) — Given a promotion that shipped a bad change, when I read DEPLOYMENT.md § Branches, then it tells me how to undo it without a force push.
- **AC5** (R5) — Given DECISIONS.md, when I read 044, then its status points to the new entry.

## Test plan

This task changes documented commands only; the project's test suites (Vitest, Playwright) don't exercise git workflow, so the commands are verified by running them in a throwaway repository, not by a committed test. The script lives in the scratchpad and is not committed.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R2 | `promote fast-forwards all three branches` | scratchpad `ff-promotions-check.sh` (throwaway repo with a bare `origin`) | Commits on `dev`, run the two promotion commands verbatim from DEPLOYMENT.md (with `npm run deploy:*` stubbed): exit 0, `dev`, `stage`, `main` resolve to the same SHA, `git log --merges origin/main` gains no new merge commit |
| T2 | R1 | `promote refuses a diverged target` | same | Commit directly on `stage`, run dev→stage promotion: non-zero exit, output contains "Not possible to fast-forward", `stage` SHA unchanged, nothing pushed |
| T3 | R3 | `hotfix then promote stays fast-forward` | same | Follow the hotfix steps verbatim (branch from `main`, merge into `main`, merge `main` into `dev`), then both promotions: every command exits 0 and the three branches end on one SHA containing the hotfix commit |
| T4 | R1 | `today's branches fast-forward` | run against the real repo, read-only | `git merge-base --is-ancestor origin/stage origin/dev` and `git merge-base --is-ancestor origin/main origin/stage` both exit 0 |
| T5 | R4, R5 | doc review | `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`, `CLAUDE.md` | Undo note present and uses no `--force`; Decision 055 has Context/Decision/Alternatives/Consequences; 044 status amended; `CLAUDE.md` and DEPLOYMENT.md hotfix wording agree; `grep -n "no-ff" docs/DEPLOYMENT.md` shows only the `wi release` mention, if any |

**Not unit testable:** R1–R3 are git procedures; T1–T3 run them in a throwaway repo instead. R4–R5 are checked by reading (T5).

## Implementation plan

1. [x] Promotion and hotfix commands: write and run the throwaway-repo check against the proposed commands, then change DEPLOYMENT.md § Branches to `--ff-only` promotions, `main`→`dev`-only hotfix back-merge, the undo note, and line 49's tag placement (tags now sit on each item's last commit) — touches `docs/DEPLOYMENT.md` — tests T1, T2, T3, T4
2. [x] Record the decision: Decision 055 (promotions fast-forward; alternatives `--no-ff` and tag deploys from one branch), 044's status line, and the `CLAUDE.md` Branches line — touches `docs/DECISIONS.md`, `CLAUDE.md` — tests T5

**Must not change:** `scripts/deploy.ts`; `wi` configuration (`base_branch: dev`); tags already pushed; existing history.

**High-risk steps:** None. Both steps are documentation; nothing is pushed or deployed by the work item itself.

## Risks and open questions

- **A forgotten back-merge blocks promotion.** If a hotfix lands on `main` and isn't merged into `dev`, the stage→main fast-forward refuses. That's the safe failure, but fixing it means doing the back-merge and promoting again. A deploy-time check (`scripts/deploy.ts` refusing when `origin/main` isn't an ancestor of the branch) or `npm run promote:<env>` scripts would catch it earlier; proposed as a follow-up issue, not built here.
- **No promotion record in git.** Merge commits no longer mark when a batch reached stage or production. The deploy output (Cloudflare version IDs) and tags are the record; there's no deploy log file today.
- **Production isn't always on a tag.** A promotion can carry commits after the last `wi release` (for example a hotfix back-merge on `dev`), so `main` may sit just past the latest tag. "Tags mark what is live" holds only when promoting right after a release.
- **Undo is no longer one revert.** Reverting a whole promotion means reverting each change on `dev` and promoting, or a hotfix revert on `main`. Moving the branch back would need a force push, which the workflow forbids.
- **Hotfix merges into `main` still make a merge commit** (the hotfix branch into `main`). That's fine: it reaches `dev` through the back-merge and `stage` on the next fast-forward.

## Progress log

- 2026-10-11 — Planned.
- 2026-10-13 — Plan approved.
- 2026-10-13 — Started on branch task/ff-promotions from origin/dev.
- 2026-10-13 — Decision numbered 055, not 047: 047 was used by palettes after this plan was written. T1-T3 pass on the new commands and fail on the old --no-ff ones; T4 passes. T5 doc review done.
