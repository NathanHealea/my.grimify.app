---
type: task
slug: deploy-environments
status: released
branch: task/deploy-environments
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/task-deploy-environments
created: 2026-10-09
approved: 2026-10-09
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.12.3
review_approved: 2026-10-09
pr:                  # set by `wi pr`
tag: v0.12.3
---

# Dev and stage environments with command-line deploys

## Summary

Adds two long-lived environments next to production, dev.grimify.app (branch `dev`) and stage.grimify.app (branch `stage`). Each is its own Cloudflare Worker with its own Convex deployment, and each signs in with production Clerk accounts. Every environment is deployed by one command from the terminal (`npm run deploy:dev`, `deploy:stage`, `deploy:prod`), replacing the Git-connected Workers Builds. The command refuses to run from the wrong branch, from uncommitted or unpushed work, or with another environment's keys. Work now flows `feat/enh/bug → dev → stage → main`, with hotfixes going straight to `main`.

## Context

Today only `main` deploys. Workers Builds builds it on every push to `grimify.app` (DECISIONS 041, 043) and runs `npx convex deploy` with the production key. ENVIRONMENT.md warns against branch builds because a branch build would push that branch's Convex functions to production. There is nowhere to try a change against real hosting, real Clerk sign-in and a real (non-production) database before it reaches users.

The owner decided (2026-10-09):
- **Branches:** `main ← stage ← dev ← (feat, enh, bug)` and `main ← hotfix`.
- **Deployments:** `dev` and `stage` both deploy, to their own subdomains.
- **Data:** each non-production environment gets its own Convex deployment, so dev and stage never touch production collections and a dev deploy can't overwrite stage's functions. The paint catalog is JSON in the build, so every environment shows the live catalog.
- **Clerk:** all environments use the production instance (real accounts). Clerk supports this when the other environment shares the root domain and keys ([Clerk: preview environments](https://clerk.com/docs/deployments/set-up-preview-environment)).
- **Deploys:** "simple command for each deployment so I don't have to do anything in the web UIs." Not Cloudflare preview URLs. Those live on `*.workers.dev`, where production Clerk keys don't work.

Where it lives:
- **Worker config:** `wrangler.json`, pinned by `scripts/static-files.test.ts`.
- **CSP:** `public/_headers`. Its Content-Security-Policy hard-codes production Convex (`nautical-toucan-398`), so a dev or stage build would have its Convex calls blocked.
- **Build:** `vite.config.ts`.
- **Commands:** `package.json` scripts.
- **Docs:** ENVIRONMENT.md and DEPLOYMENT.md.
- **Work-item base branch:** `base_branch` in the repo's CLAUDE.md.

Cloudflare facts this plan relies on (checked 2026-10-09):
- **Environments:** a Wrangler environment `dev` deploys a separate Worker named `<name>-dev`, and each environment needs its own `routes` ([Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)).
- **Custom domains:** `routes: [{ "pattern": "dev.grimify.app", "custom_domain": true }]` makes `wrangler deploy` create the DNS record and certificate ([Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).
- **`assets` key:** the docs don't say whether environments inherit it, so this plan sets it in each environment.

## Scope

**In scope**

- `wrangler.json` environments `dev` and `stage`, plus custom-domain routes for all three environments.
- A Content-Security-Policy that names the Convex deployment the build was made for.
- `scripts/deploy.ts` and the `deploy:dev`, `deploy:stage` and `deploy:prod` npm scripts, with their safety checks.
- Per-environment deploy settings in git-ignored `.env.deploy.<env>.local` files, documented in ENVIRONMENT.md.
- `base_branch: dev` in CLAUDE.md's Work Item Workflow.
- Docs:
  - ENVIRONMENT.md, DEPLOYMENT.md and TESTING.md (production checks for each environment);
  - SECURITY.md §5 (where the CSP comes from);
  - DECISIONS 044, amending 041 and 043;
  - CLAUDE.md and AGENTS.md wherever they say Workers Builds;
  - the branch model and how to promote and hotfix.

**Out of scope**

- **Promotion commands:** merging `dev → stage → main` uses plain `git` commands documented in DEPLOYMENT.md, not new scripts.
- **CI:** no GitHub Actions; deploys still run from the owner's machine.
- **Hotfix base branch in `wi`:** `wi` supports one `base_branch`. Hotfix items follow a documented manual flow. Changing the `wi` tool itself happens outside this repo.
- **Seeding dev or stage data:** each starts empty, and collections come from signing in and using it.
- **Hiding Delete account outside production:** see Risks; a follow-up issue if wanted.
- **One-time account setup:** creating the Convex deployments and keys, `wrangler login`, and disconnecting Git from the Worker are the owner's steps (listed in DEPLOYMENT.md as commands). The code doesn't run them.

## Requirements

- **R1:** `npm run deploy:dev`, `npm run deploy:stage` and `npm run deploy:prod` each build the frontend, push Convex functions, and deploy the Worker for that one environment, with no dashboard step:

  | Environment | Branch | Worker | Domain | Convex |
  |---|---|---|---|---|
  | dev | `dev` | `v2-grimify-app-dev` | `dev.grimify.app` | its own deployment |
  | stage | `stage` | `v2-grimify-app-stage` | `stage.grimify.app` | its own deployment |
  | prod | `main` | `v2-grimify-app` | `grimify.app` | `nautical-toucan-398` |

- **R2:** A deploy refuses to start, with a message naming the problem, before building or contacting any service, when:
  - the environment name is unknown;
  - the current branch isn't the environment's branch;
  - the working tree has uncommitted changes;
  - `HEAD` differs from `origin/<branch>` after a fetch.
- **R3:** A deploy refuses to start, with a message naming the problem, when its settings are wrong:
  - `.env.deploy.<env>.local` is missing, or lacks `CONVEX_DEPLOY_KEY` or `VITE_CLERK_PUBLISHABLE_KEY`;
  - the publishable key isn't a `pk_live_` key;
  - the deploy key isn't a production key for the Convex deployment recorded for that environment. This stops a production key from deploying dev's functions.
  - Error messages never print a key's value.
- **R4:** A failed step stops the deploy, and the command exits non-zero; Wrangler doesn't run after a failed Convex deploy.
- **R5:** Each environment's site sends a Content-Security-Policy whose Convex `connect-src` entries name only the deployment the build used (https and wss). All other directives stay identical to production's today.
- **R6:** The build fails when the Convex URL is missing or isn't an `https://<name>.convex.cloud` URL, rather than shipping a CSP that blocks Convex.
- **R7:** `wrangler.json` deploys each environment as an assets-only Worker with the single-page-app fallback, on the domain in R1. The production Worker keeps the name `v2-grimify-app`.
- **R8:** Work items branch from and merge into `dev` (`wi config` prints `base_branch: dev`).

## Acceptance criteria

- **AC1** (R1): Given the one-time setup is done and `dev` is checked out, clean and pushed, when the owner runs `npm run deploy:dev`, then `https://dev.grimify.app/paints` loads, sign-in with a production account works, and owning a paint writes to the dev Convex deployment, not production.
- **AC2** (R1): Given the same for `stage`, when the owner runs `npm run deploy:stage`, then `https://stage.grimify.app` behaves as in AC1 against the stage deployment, and dev's data isn't visible there.
- **AC3** (R1, R7): Given `main` is clean and pushed, when the owner runs `npm run deploy:prod`, then `https://grimify.app` serves the new build, and deep links like `/paints/<id>` still return 200.
- **AC4** (R2): Given `dev` is checked out, when the owner runs `npm run deploy:prod`, then it exits non-zero with "deploy:prod runs from main; you are on dev", and nothing is built or uploaded.
- **AC5** (R2): Given an unpushed commit on `dev`, when the owner runs `npm run deploy:dev`, then it refuses and says to push first.
- **AC6** (R3): Given `.env.deploy.dev.local` holds the production deploy key, when the owner runs `npm run deploy:dev`, then it refuses, names the expected deployment, and doesn't print the key.
- **AC7** (R5): Given a deploy to dev, when the browser loads dev.grimify.app, then the console shows no CSP violations, and the CSP names the dev Convex host and not `nautical-toucan-398`.
- **AC8** (R8): Given the item is released, when the owner runs `wi config`, then it prints `base_branch: dev`.

## Test plan

Vitest, `// @vitest-environment node`, files beside the code they test, following `scripts/static-files.test.ts`. The deploy script's checks are pure functions over a git-state and env-file object, so the tests need no git repo, network or keys. Test fixtures use made-up keys shaped like real ones.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `maps each environment to its branch, Worker, domain and wrangler env` | `scripts/deploy.test.ts` | dev→`dev`/`v2-grimify-app-dev`/`--env dev`; stage→`stage`/…; prod→`main`/`v2-grimify-app`/`--env ""` (top-level Worker) |
| T2 | R1, R4 | `plans convex deploy, then wrangler deploy, in that order` | `scripts/deploy.test.ts` | planned steps for dev are exactly `npx --no convex deploy --env-file .env.deploy.dev.local --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL`, the build check, then `npx --no wrangler deploy --env dev` (prod: `--env ""`); the env passed to them carries the publishable key and `GRIMIFY_DEPLOY`, not the deploy key (Convex reads it from `--env-file`) |
| T3 | R2 | `refuses an unknown environment` | `scripts/deploy.test.ts` | `deploy:qa` throws naming the valid three |
| T4 | R2 | `refuses the wrong branch` | `scripts/deploy.test.ts` | prod from `dev` throws "runs from main; you are on dev"; dev from `main` throws |
| T5 | R2 | `refuses a dirty tree or a HEAD that differs from origin` | `scripts/deploy.test.ts` | dirty → throws; ahead → throws "push first"; behind → throws "pull first" |
| T6 | R3 | `refuses missing settings` | `scripts/deploy.test.ts` | missing file, missing `CONVEX_DEPLOY_KEY`, missing publishable key each throw naming the variable |
| T7 | R3 | `refuses a test Clerk key` | `scripts/deploy.test.ts` | `pk_test_…` throws |
| T8 | R3 | `refuses another environment's Convex key without printing it` | `scripts/deploy.test.ts` | prod key for dev throws naming the expected deployment; the message doesn't contain the key; a `preview:`/`dev:` key throws |
| T9 | R4 | `stops at the first failed command` | `scripts/deploy.test.ts` | with a runner stub where step 1 exits 1, step 2 never runs and the result is non-zero |
| T15 | R3, R4 | `refuses to upload a build made for another Convex deployment` | `scripts/deploy.test.ts` | the plan checks `dist/_headers` between `convex deploy` and `wrangler deploy`; a CSP naming any other deployment throws and wrangler never runs |
| T16 | R1 | `deploy builds don't load .env files` | `scripts/static-files.test.ts` | `vite.config.ts` sets `envDir` to false when `GRIMIFY_DEPLOY` is set, so `.env.local` values never ship (review finding) |
| T10 | R5 | `writes the build's Convex host into the CSP` | `scripts/csp-headers.test.ts` | for `https://happy-otter-123.convex.cloud`, connect-src contains exactly that host over https and wss, and every other directive equals production's set |
| T11 | R6 | `rejects a missing or non-Convex URL` | `scripts/csp-headers.test.ts` | undefined, `http://…convex.cloud`, `https://evil.example`, `https://a.convex.cloud.evil.example` all throw |
| T12 | R5 | existing CSP tests, updated | `scripts/static-files.test.ts` | the template in `public/_headers` holds the placeholder and production's other directives; never eval, inline scripts, wildcards or framing; no dev Clerk host |
| T13 | R7 | `wrangler.json deploys three assets-only Workers on their domains` | `scripts/static-files.test.ts` | top-level name `v2-grimify-app` + route `grimify.app`; `env.dev`/`env.stage` have the SPA assets block and their custom-domain route; no `main` anywhere; no other keys |
| T14 | R8 | `work items use dev as their base` | `scripts/static-files.test.ts` | CLAUDE.md's Work Item Workflow section has `base_branch: dev` |

**Not unit testable:** AC1–AC3 and AC7, which need real deploys. The owner verifies them after release, using the TESTING.md checks for each environment. Running a real deploy is the owner's step; the build phase only proves the plan with stubs.

## Implementation plan

1. [x] Make the CSP name the build's Convex deployment. `public/_headers` gets a `{{CONVEX_HOST}}` placeholder. A small Vite plugin (`scripts/csp-headers.ts`, used from `vite.config.ts`) checks `VITE_CONVEX_URL` and writes the host into `dist/_headers` after the build; a bad URL fails the build. The static-file tests are updated. Touches `public/_headers`, `scripts/csp-headers.ts`, `scripts/csp-headers.test.ts`, `vite.config.ts`, `scripts/static-files.test.ts`. Tests T10, T11, T12.
2. [x] Add Wrangler environments `dev` and `stage`, and custom-domain routes for all three, in `wrangler.json`. Touches `wrangler.json`, `scripts/static-files.test.ts`. Tests T13.
3. [x] Add `scripts/deploy.ts`:
   - an environment table, including each one's expected Convex deployment name;
   - pure checks over git state and the parsed `.env.deploy.<env>.local`;
   - a plan of two commands, run in order with an injected runner;
   - the `deploy:dev`, `deploy:stage` and `deploy:prod` npm scripts;
   - `wrangler` as an exact-pinned dev dependency (owner-approved).

   The dev and stage deployment names stay as clearly marked placeholders until the owner creates them; the script refuses to deploy while a name is a placeholder. Touches `scripts/deploy.ts`, `scripts/deploy.test.ts`, `package.json`, `package-lock.json`. Tests T1–T9, T15.
4. [x] Set `base_branch: dev` in CLAUDE.md's Work Item Workflow, and change "Workers Builds" to the deploy commands in CLAUDE.md and AGENTS.md. Touches `CLAUDE.md`, `docs/AGENTS.md`, `scripts/static-files.test.ts`. Tests T14.
5. [x] Docs:
   - ENVIRONMENT.md: the environments table, the `.env.deploy.<env>.local` variables, and one-time setup;
   - DEPLOYMENT.md: deploy commands, branch model, promoting `dev → stage → main`, hotfix flow, rollback for each environment;
   - TESTING.md: post-deploy checks for each environment;
   - SECURITY.md §5: where the CSP host comes from;
   - DECISIONS 044, amending 041 and 043.

   Touches `docs/ENVIRONMENT.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`. Tests none (docs).

**After release:** owner steps, documented in DEPLOYMENT.md, not part of the build.
- **Create the branches:** make `dev` and `stage` from `main` and push them. This publishes them, so do it only on the owner's say-so.
- **Disconnect Git:** in Workers Builds, turn off the Git connection on `v2-grimify-app`, or every push to `main` deploys a second time.
- **Convex:** in the existing project, `npx convex deployment create develop --type prod` and `npx convex deployment create stage --type prod`; mint keys with `npx convex deployment token create <name> --deployment <ref> --save-env .env.deploy.<env>.local`; set `CLERK_JWT_ISSUER_DOMAIN` on each. Then fill in the deployment names in a small follow-up commit on `dev`. (The reference is `develop`, not `dev`, because `dev` already means a personal dev deployment to the Convex CLI.)
- **Local settings:** write the three `.env.deploy.<env>.local` files, and run `npx wrangler login` once.

**Must not change:**
- the production Worker name `v2-grimify-app`;
- the `grimify.app` domain and `www` redirect;
- production Convex `nautical-toucan-398` and its data;
- the CSP's directives other than the Convex host;
- the Convex schema and functions;
- the paint catalog.

**High-risk steps:**
- **Step 3:** it handles deploy secrets and can deploy production. Its checks are the guard, so build should stop for sign-off on the key-handling code before the first real run.
- **After release:** creating the Convex projects, disconnecting Git and pushing new branches are outward-facing and stay with the owner.

## Risks and open questions

- **`.env.local` could redirect a deploy (found in build, 2026-10-09).** `.env.local` sets `CONVEX_DEPLOYMENT`, and `npx convex deploy --help` says that variable targets the project's production deployment; it doesn't say which wins when a deploy key is also set. The script passes the environment's settings file with `--env-file` (which overrides `.env.local`), removes `CONVEX_DEPLOYMENT` from the child environment, and checks the built CSP names the expected deployment before Wrangler runs (T15). The first real deploy should be `deploy:dev`, watching which deployment Convex reports.

- **Wrangler pinning (decided 2026-10-09).** The owner approved adding `wrangler` as an exact-pinned dev dependency in step 3, so deploys use the lockfile's version rather than whatever `npx` downloads.
- **Delete account clears only one deployment (issue #20).** Deleting on dev or stage deletes the production Clerk account and orphans the production rows; deleting on grimify.app leaves dev and stage rows. SECURITY.md and DECISIONS 044 record the gap; this item doesn't change deletion.
- **Shared sign-in across subdomains.** Clerk's production session cookie covers `*.grimify.app`, so being signed in on one environment signs you in on all three. That's expected, but a dev bug that corrupts session state affects production sign-in in that browser.
- **Dev and stage data hold real account IDs.** Rows in the dev and stage Convex deployments are keyed by production Clerk user IDs. The data is hobby paint collections only, so there are no student or personnel records and FERPA doesn't apply. But the deployments do hold personal account identifiers, so they get the same access controls as production.
- **Convex free plan.** Two more production-type deployments in the project must fit the free plan's limits, and free deployments may pause when idle; the latter is already a TBD in DEPLOYMENT.md. `deployment create` will refuse if the plan doesn't allow it.
- **Convex deploy key format (checked 2026-10-09).** Production keys are `prod:<deployment-name>|<secret>` ([Convex: deploy key types](https://docs.convex.dev/cli/deploy-key-types)); R3's check reads the name before the `|`.
- **Assets inheritance.** It's unclear whether Wrangler environments inherit `assets`, so each environment sets it explicitly, and T13 pins that.
- **Moving the domain into `wrangler.json`.** `grimify.app` was attached in the dashboard. Declaring it in `wrangler.json` should match, but the first `deploy:prod` may report or replace the dashboard entry. The owner runs it watching the output, with the dashboard Rollback ready.
- **Hotfixes.** `wi` has one base branch, so a hotfix item would branch from `dev`. The documented flow is: branch from `main` by hand, merge into `main`, deploy prod, then merge `main` into `stage` and `dev`.
- **Tags land on `dev`.** `wi release` tags the merge into `dev`. Promotion merges carry those commits up, so a tag marks code that reached production later, not at tag time. Recorded in DECISIONS 044; no change to tagging.

## Progress log

- 2026-10-09 — Planned.
- 2026-10-09 — Owner approved; pin wrangler as a dev dependency (step 3).
- 2026-10-09 — Plan approved.
- 2026-10-09 — Started on branch task/deploy-environments from origin/main.
- 2026-10-09 — Convex 1.46's CLI creates named prod-type deployments in the same project (deployment create) and mints keys (deployment token create), so dev and stage use deployments 'develop' and 'stage' in the existing project instead of new projects; setup needs no dashboard. Requirements unchanged.
- 2026-10-09 — Added T15: a check between convex deploy and wrangler deploy that the built CSP names the environment's Convex deployment, because .env.local's CONVEX_DEPLOYMENT could otherwise redirect convex deploy.
- 2026-10-09 — Build done: steps 1-5 committed, 54 script tests pass, wi verify green. No real deploy run; one-time setup and first deploys are the owner's.
- 2026-10-09 — Review cycle 1: fixed MED .env.local leaking into deploy builds (T16 added), security LOWs (deploy key out of child env, npx --no, revoke old key step), code LOWs (fetch after branch/dirty checks, --env "" for prod, doc accuracy, promotion from origin). Deletion gap filed as #20 and documented.
- 2026-10-09 — Review cycle 2: fixed MED revoke command targeting the dev deployment (--prod), setup ordering, T1 row. Left for reviewer: Wrangler loads .env.local (documented), a shell-exported CONVEX_DEPLOY_KEY still reaches child processes (LOW).
- 2026-10-09 — Test audit: 46 mutants, 14 survived; added tests for all, spot-checked 7 survivors now killed. 65 script tests.
- 2026-10-09 — Staged: verification passed; version 0.12.2 → 0.12.3; no changelog file.
- 2026-10-09 — Review approved.
- 2026-10-09 — Released 0.12.3 as v0.12.3.
