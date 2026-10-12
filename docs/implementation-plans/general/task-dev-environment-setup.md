---
type: task
slug: dev-environment-setup
status: released
branch: task/dev-environment-setup
worktree_path: ../grimify-v2-worktrees/task-dev-environment-setup
created: 2026-10-06
approved: 2026-10-06
version: 0.0.2
tag: v0.0.2
merge_commit: 480a08c (squash of task/dev-environment-setup)
---

# Dev environment setup

## Summary

Prepares the repository for agents to build the MVP: work item plans get their own folder, Convex is installed and linked to a cloud dev deployment, and the Convex AI guidance is installed with only the skills that fit this project's decisions.

## Context

Written after the work, at the owner's request, so two chore branches (`chore/implementation-plans-folder` and `chore/add-convex`) could go through Stage and Release as one item. Both branched from `0aba58c` and each appended a section to `CLAUDE.md`; the overlap is resolved here by keeping both sections.

Outside the repository and not part of this diff: the cloud project `grimify` (dev deployment `proper-bloodhound-699`) was linked with `npx convex dev --configure existing`, and `CLERK_JWT_ISSUER_DOMAIN` was set on that deployment to the Clerk instance's issuer URL.

## Scope

**In scope**

- Move work item documents to `docs/implementation-plans/` and set `work_items_root` in `CLAUDE.md`
- Add `convex` 1.46.0 (pinned) and commit `convex/_generated/`
- Ignore `.convex/` (anonymous local-backend data)
- Exclude `convex/_generated` from ESLint and Prettier, as `src/routeTree.gen.ts` already is
- Install `convex/_generated/ai/guidelines.md` and the `CLAUDE.md` pointer to it
- Keep 7 of the 33 Convex skills in `.claude/skills/`: `convex-expert`, `convex-docs`, `convex-deploy-guard`, `convex-env`, `convex-reviewer`, `convex-test`, `convex-verify`; trim `skills-lock.json` to match
- Point `docs/AGENTS.md` at the guidelines file
- Enable the agent-skills plugin in the shared `.claude/settings.json`

**Out of scope**

- `convex/schema.ts`, `auth.config.ts`, `requireUser` and any Convex function (Clerk auth + Convex `users` item)
- Clerk packages and `ConvexProviderWithClerk` wiring
- `.env.example` and ENVIRONMENT.md updates for `VITE_CONVEX_SITE_URL` (auth item)

## Requirements

- **R1** — Work item documents live under `docs/implementation-plans/`, and the work item skills read that location from `CLAUDE.md`.
- **R2** — `convex` is a pinned runtime dependency, and `npx convex dev` runs against the linked cloud dev deployment.
- **R3** — `.convex/` is never committed.
- **R4** — Generated Convex code is committed and does not fail lint or format checks.
- **R5** — Agents read the Convex guidelines before writing Convex code, and only skills consistent with Decisions 001, 004 and 005 and the owner's no-third-party-sharing rule are installed.
- **R6** — `npm run check` and `npm run build` pass.

## Acceptance criteria

- **AC1** (R1) — `docs/implementation-plans/general/task-project-scaffold.md` exists and `CLAUDE.md` has a `## Work Item Workflow` section with `work_items_root: docs/implementation-plans`.
- **AC2** (R2) — `package.json` lists `"convex": "1.46.0"`, and `npx convex dev` reports `Convex functions ready!` against `proper-bloodhound-699`.
- **AC3** (R3) — `git check-ignore .convex` matches.
- **AC4** (R4, R6) — On a clean install, `npm run check`, `npm run build` and `npx prettier --check .` exit 0.
- **AC5** (R5) — `.claude/skills/` holds exactly the 7 kept skills, there is no `.agents/` folder or root `AGENTS.md`, and `CLAUDE.md` and `docs/AGENTS.md` point at `convex/_generated/ai/guidelines.md`.

## Test plan

No unit tests: the change is configuration, dependencies and docs. Verification is AC1–AC5, checked during Stage.

## Implementation plan

1. [x] Move `task-project-scaffold.md` into `docs/implementation-plans/`; add `work_items_root` to `CLAUDE.md`.
2. [x] Install `convex@1.46.0` with `--save-exact`; link the cloud dev deployment.
3. [x] Ignore `.convex/`; exclude `convex/_generated` from ESLint and Prettier; commit the generated code.
4. [x] Run `npx convex ai-files install`; delete 26 skills, `.agents/` and root `AGENTS.md`; trim `skills-lock.json`; drop the `ai-files install` sentence from `CLAUDE.md`; update `docs/AGENTS.md`.
5. [x] Enable the agent-skills plugin in `.claude/settings.json`.
6. [x] Combine both branches on `task/dev-environment-setup` as a linear series of commits, keeping both new `CLAUDE.md` sections.

## Risks and open questions

- **Re-running `npx convex ai-files install`** may reinstall all 33 skills; `convex/_generated/ai/ai-files.state.json` tracks hashes. Untested. Check `git status` after any re-run.
- **esbuild install script** is not approved in `allowScripts`. The Convex CLI bundled functions without it on macOS arm64; other platforms are untested.
- **`npm audit`** still reports the Stylelint `braces` advisory (dev-only, no fixed version).

## Progress log

- 2026-10-06 — Work done on two chore branches; owner chose to stage and release them as one work item. Branches combined on `task/dev-environment-setup`.
- 2026-10-06 — Staged. `npm ci`, then `lint`, `typecheck`, `test` (26 tests in 5 files), `build` and `prettier --check` all exit 0; AC1–AC5 checked (AC2 deployment half from the earlier `convex dev` run). Version 0.0.2; no changelog. No remote; review is the local branch.
- 2026-10-06 — Branch rebuilt as a linear series (merge commit dropped, agent-skills plugin commit added). Re-ran `npm ci`, `check` (26 tests in 5 files), `build` and `prettier --check`; all exit 0.
- 2026-10-06 — Released. Squash-merged to `main` as `480a08c`, tagged `v0.0.2` and pushed to origin. Worktree and branch removed.
