---
type: task
slug: app-subdomain
status: released
branch: task/app-subdomain
worktree_path: /home/nathan/development/grimify/my.grimify.app-worktrees/task-app-subdomain
created: 2026-10-19
approved: 2026-10-19
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.21.2
review_approved: 2026-10-20
pr:                  # set by `wi pr`
tag: v0.21.2
---

# Serve the app from my.grimify.app

## Summary

Moves the app to my.grimify.app, with dev and stage at dev.my.grimify.app and stage.my.grimify.app, so the apex grimify.app can become a marketing site. The production Worker keeps answering on grimify.app and www.grimify.app for now, so nobody's installed app or bookmark breaks before the marketing site exists to redirect them. Also records the GitHub rename from `NathanHealea/v2.grimify.app` to `NathanHealea/my.grimify.app`.

## Context

Today production serves grimify.app and www.grimify.app, dev serves dev.grimify.app and www.dev.grimify.app, and stage serves stage.grimify.app and www.stage.grimify.app (DECISIONS 044). The owner decided on 2026-10-19:
- the app moves to `my.grimify.app`;
- dev and stage move to `dev.my.grimify.app` and `stage.my.grimify.app`;
- grimify.app becomes the marketing site, built outside this repo.

The GitHub repository was renamed to `NathanHealea/my.grimify.app`. The local `origin` already points at it. Both URLs listed the same refs on 2026-10-19, and GitHub forwards the old URL for now.

Where the domains live:
- **Routes:** `wrangler.json` `routes`, pinned by `scripts/static-files.test.ts` (`wrangler.json deploys three assets-only Workers on their domains`).
- **Deploy log line:** `scripts/deploy.ts` `ENVIRONMENTS[*].domain`, used only in that line, pinned by `scripts/deploy.test.ts` (`maps each environment to its branch, Worker, domain and wrangler env`).
- **Docs:** ENVIRONMENT.md, DEPLOYMENT.md, features/hosting.md, SECURITY.md (§ CORS, § Environments, § Retention, checklist), TESTING.md (production checks), SYSTEM_MAP.md, ROADMAP.md.
- **Repo name:** CLAUDE.md (`bug_tracking`) and DECISIONS 026's text.
- **Old app's folder:** the old Supabase app's checkout moved from `../grimify.app` to `../old.grimify.app` (repo `NathanHealea/old.grimify.app`). `../grimify.app` is now the marketing site's repo. ENVIRONMENT.md (`LEGACY_SUPABASE_URL` comment) and features/legacy-import.md still give the old path, so `npm run legacy:export` as documented would read the wrong folder.
- **Code:** no URL in `src/` or `convex/` names grimify.app (checked 2026-10-19). The only other hostname is `clerk.grimify.app`, in the CSP (`public/_headers`).

Facts this plan relies on:
- **Removed routes detach domains (verified in-repo):** `wrangler deploy` removes custom domains that aren't in `routes`. ENVIRONMENT.md records that the first scripted production deploy dropped www.grimify.app, which had been attached only in the dashboard.
- **Two-level names get certificates (verified in-repo):** each custom domain gets its own certificate, and the existing `www.dev.grimify.app` works. So `dev.my.grimify.app` should be covered.
- **Clerk accepts the new names (inferred):** production Clerk works on subdomains of grimify.app with the same keys (ENVIRONMENT.md § Clerk; dev and stage already do this). `my.`, `dev.my.` and `stage.my.` are subdomains of grimify.app, so `clerk.grimify.app` and the CSP stay as they are. Not yet tested for the two-level names; the first dev deploy proves it.

## Scope

**In scope**

- New `routes` in `wrangler.json`:
  - production: `my.grimify.app`, kept alongside `grimify.app` and `www.grimify.app`;
  - dev: `dev.my.grimify.app`;
  - stage: `stage.my.grimify.app`.
- `ENVIRONMENTS[*].domain` in `scripts/deploy.ts`, and both tests.
- Docs listed in Context, plus DECISIONS 060. 060 amends 044's domains and records the repo rename, and its Status line goes on 044. DECISIONS 026 gets the new repo name.
- CLAUDE.md `bug_tracking` gets the new repo name.
- The old app's folder becomes `../old.grimify.app` in ENVIRONMENT.md and features/legacy-import.md.

**Out of scope**

- **The marketing site and cutover:** taking grimify.app off this Worker, and redirecting app paths (`/paints`, `/palettes/*`, the installed app's `start_url`) to my.grimify.app.
- **Retiring the old service worker on grimify.app:** the marketing site must serve a self-unregistering `sw.js`. Any visitor's cached app at grimify.app otherwise keeps loading from its service worker, because a 404 on the update check leaves the old worker in place.
- **Renaming the Workers** (`v2-grimify-app*`). A new top-level name makes `wrangler deploy` create a second Worker (ENVIRONMENT.md § Cloudflare Workers).
- **Old work item documents:** their `worktree_path` and history mention `v2.grimify.app`. They're records and stay as written.
- **Files outside this repo:** the VS Code workspace file `../grimify.code-workspace` still lists `v2.grimify.app`.

## Requirements

- **R1** — Production serves the app on `my.grimify.app` from the Worker `my-grimify-app`. ~~It also keeps `grimify.app` and `www.grimify.app`~~ (owner change, 2026-10-20: those stay on the old `v2-grimify-app` Worker, frozen, until the marketing cutover).
- **R2** — Dev serves the app on `dev.my.grimify.app` only, from `my-grimify-app-dev`. Stage serves it on `stage.my.grimify.app` only, from `my-grimify-app-stage`. The old names stay on the old Workers until those are deleted.
- **R3** — `npm run deploy:<env>` prints the environment's app domain: `dev.my.grimify.app`, `stage.my.grimify.app`, `my.grimify.app`.
- **R4** — Sign-in still works on all three new domains, with the production Clerk instance and an unchanged CSP.
- **R5** — The docs name the new domains wherever they name an environment's site. The repo name `NathanHealea/my.grimify.app` replaces `NathanHealea/v2.grimify.app` in CLAUDE.md and DECISIONS 026. The old app's folder is given as `../old.grimify.app` wherever the docs give it. DECISIONS 060 records the move.

## Acceptance criteria

- **AC1** (R1) — Given the production deploy, when I open https://my.grimify.app/paints and https://grimify.app/paints, then both load the app.
- **AC2** (R2) — Given the dev and stage deploys, when I open https://dev.my.grimify.app/paints and https://stage.my.grimify.app/paints, then each loads its environment. dev.grimify.app and stage.grimify.app no longer resolve.
- **AC3** (R3) — Given `npm run deploy:dev`, when it starts, then it prints `Worker v2-grimify-app-dev (dev.my.grimify.app)`.
- **AC4** (R4) — Given a production account, when I sign in on each new domain, then I'm signed in, and the browser console shows no CSP violations.
- **AC5** (R5) — Given the repo, when I search the topic docs and CLAUDE.md for the old site names and `v2.grimify.app`, then nothing names an old site as current. Historical DECISIONS text and old work items are the only exceptions.

## Test plan

Vitest, following the existing `scripts/static-files.test.ts` and `scripts/deploy.test.ts`. Both are existing tests whose pinned values change, so each fails on current code once updated.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R2 | `wrangler.json deploys three assets-only Workers on their domains` (updated) | `scripts/static-files.test.ts` | top-level `name` is `my-grimify-app`; top-level `routes` equal exactly `my.grimify.app` (`custom_domain: true`). `env.dev.routes` equals exactly `[dev.my.grimify.app]`, and `env.stage.routes` equals exactly `[stage.my.grimify.app]`. Names, assets and no-`main` checks unchanged |
| T2 | R3 | `maps each environment to its branch, Worker, domain and wrangler env` (updated) | `scripts/deploy.test.ts` | `domain` is `dev.my.grimify.app`, `stage.my.grimify.app`, `my.grimify.app`; Workers are `my-grimify-app-dev`, `my-grimify-app-stage`, `my-grimify-app`; Convex deployments unchanged |
| T3 | R4 | existing CSP tests, unchanged | `scripts/static-files.test.ts`, `scripts/csp-headers.test.ts` | still pass with no edit, proving the Clerk origins didn't move |

**Not unit testable:**
- **R1, R2, R4:** verified by deploying dev, then stage, then prod, and running TESTING.md's production checks with `<site>` set to each new domain: headers via `curl -sI`, a deep link, sign-in, and no console CSP errors. AC2's "no longer resolve" is checked with `curl -sI https://dev.grimify.app`.
- **R5:** checked by the grep in AC5 during review.

## Implementation plan

1. [x] Move dev and stage to `dev.my.grimify.app` and `stage.my.grimify.app`, add `my.grimify.app` to production, and update the deploy log domains — touches `wrangler.json`, `scripts/deploy.ts`, `scripts/static-files.test.ts`, `scripts/deploy.test.ts` — tests T1, T2, T3
2. [x] Record the repo rename. Change `bug_tracking` in CLAUDE.md, and DECISIONS 026's repo name, to `NathanHealea/my.grimify.app` — touches `CLAUDE.md`, `docs/DECISIONS.md` — tests none (docs only)
3. [x] Add DECISIONS 060 (app on my.grimify.app; dev and stage on `*.my.grimify.app` with no `www.`; production keeps grimify.app until the marketing cutover; Worker names unchanged; the repo rename), and amend 044's Status — touches `docs/DECISIONS.md` — tests none (docs only)
4. [x] Update the environment tables and site names in the deploy docs: the `www.` paragraph, the Clerk note and the Cloudflare Workers section — touches `docs/ENVIRONMENT.md`, `docs/DEPLOYMENT.md`, `docs/features/hosting.md` — tests none (docs only)
5. [x] Update the remaining site names — touches `docs/SECURITY.md`, `docs/TESTING.md`, `docs/SYSTEM_MAP.md`, `docs/ROADMAP.md` — tests none (docs only)
6. [x] Point the legacy-import docs at `../old.grimify.app` — touches `docs/ENVIRONMENT.md`, `docs/features/legacy-import.md` — tests none (docs only)
7. [x] Owner change: rename the Workers to `my-grimify-app`, `my-grimify-app-dev` and `my-grimify-app-stage`, and serve production on `my.grimify.app` only. The old `v2-grimify-app` Worker keeps serving `grimify.app`, frozen at its last deploy, until the marketing cutover — touches `wrangler.json`, `scripts/deploy.ts`, `scripts/static-files.test.ts`, `scripts/deploy.test.ts` — tests T1, T2
8. [x] Docs for the rename: the environment tables, the Workers section, DECISIONS 060, and the steps to retire the old Workers — touches `docs/ENVIRONMENT.md`, `docs/DEPLOYMENT.md`, `docs/features/hosting.md`, `docs/SYSTEM_MAP.md`, `docs/DECISIONS.md` — tests none (docs only)

**Must not change:**
- ~~**Worker names**~~ (owner change, 2026-10-20: renamed in step 7).
- **Convex deployments** and their names.
- **Clerk origins:** `clerk.grimify.app` in `public/_headers`.
- **The PWA manifest:** `start_url`, `scope`.
- **Deploy checks** in `scripts/deploy.ts`.
- **The service worker's behavior.**

**High-risk steps:** Deploying step 7. The first deploy of each environment creates a new Worker and attaches its `my.` domain; the old Workers and their domains are left alone, so nothing is lost by deploying. Deleting the old Workers (`npx --no wrangler delete v2-grimify-app-dev`, then `v2-grimify-app-stage`) is irreversible: it removes `dev.grimify.app`, `stage.grimify.app` and their `www.` names. Do it only after the new sites are checked, and leave `v2-grimify-app` until the marketing cutover.

## Risks and open questions

- **Proposed: `www.` names.** There's no `www.my.grimify.app`, `www.dev.my.grimify.app` or `www.stage.my.grimify.app`; nobody types them. This drops the "every site answers on `www.`" rule from 044. The existing Cloudflare redirect rule for www.grimify.app stays. Say if you want the `www.` names kept.
- **Proposed: production keeps grimify.app in this item.** Removing it here would leave grimify.app serving nothing until the marketing site exists, and would break installed apps (`start_url` is `/paints` on grimify.app). The marketing cutover removes those routes. While both are live, my.grimify.app and grimify.app are separate origins: local state, the service worker and installs don't carry between them. Signed-in data lives in Convex, so collections and palettes are the same on both.
- **Open: Clerk dashboard settings.** Settings with absolute URLs (Paths: home, after sign-out, allowed redirect origins) may name `https://grimify.app`. I can't see the dashboard. Check Clerk dashboard → Paths and Domains before the first dev deploy. The app code passes no absolute URL to Clerk.
- **Open: OAuth providers.** If Google or another social sign-in is on with custom credentials, its allowed origins may also need the new domains. Clerk's shared dev credentials aren't used in production.
- **Risk: two-level subdomain sign-in.** Clerk's session cookie is set for the grimify.app site, so it should cover `dev.my.grimify.app`. That's inferred, not tested. The first dev deploy is the test, and it's cheap to roll back.
- **Risk: the cutover depends on this item.** The marketing site can't take grimify.app until production is deployed with `my.grimify.app` and verified. It then needs, in order: the self-unregistering `sw.js`, redirects for app paths, then removing grimify.app from this Worker's `routes`.

## Progress log

- 2026-10-19 — Planned.
- 2026-10-19 — Added step 6: the old app's checkout moved to ../old.grimify.app and ../grimify.app is now the marketing repo, so the legacy-import docs' path is wrong.
- 2026-10-19 — Plan approved.
- 2026-10-19 — Started on branch task/app-subdomain from origin/dev.
- 2026-10-19 — All six steps done. ROADMAP's completed deploy item left as a historical record, so step 5 didn't touch ROADMAP.md.
- 2026-10-19 — Verification flaked twice in full-suite runs: paints-screen 'renders 60 rows, then more, and an empty state' timed out at 5 s (same cause as #29; the sibling cap test got a 15 s stopgap in task-paints-cap-test-timeout). Passes alone and in quiet full runs. Not changed here; propose an issue.
- 2026-10-19 — Review: fixed Prettier shape, www.grimify.app wording, old-name deploy warning, two-origin device-record gap, sign-out qualifier, cutover storage-clear wording, and dev/stage Convex pins in T2. Left: deploy log line untested (pre-existing), no cross-check between ENVIRONMENTS domains and wrangler routes, marketing site inside the Clerk same-site boundary (for the cutover item).
- 2026-10-19 — Staged: verification passed; version 0.21.0 → 0.21.1; no changelog file.
- 2026-10-19 — Review approved.
- 2026-10-20 — Changes requested: Re-stage on top of v0.21.1 (paints-select-screen-rerender), which took the 0.21.1 version; no code changes requested.
- 2026-10-20 — Resumed to address requested changes.
- 2026-10-20 — Staged: verification passed; version 0.21.1 → 0.21.2; no changelog file.
- 2026-10-20 — Changes requested: Owner renamed the Workers to my-grimify-app (-dev, -stage) and dropped grimify.app/www.grimify.app from the new production Worker; the old v2-grimify-app Worker keeps serving grimify.app until the marketing cutover.
- 2026-10-20 — Resumed to address requested changes.
- 2026-10-20 — Plan revised (owner change, 2026-10-20): Workers renamed to my-grimify-app(-dev, -stage); the new production Worker serves my.grimify.app only, and grimify.app stays on the old v2-grimify-app Worker until the cutover. Steps 7 and 8 added.
- 2026-10-20 — Steps 7-8 done; rebased onto the owner's wrangler.json commit 71a6d26 (same content, Prettier wrapping kept). Self-reviewed: config/tests/doc changes only; the earlier review cycles covered the rest.
- 2026-10-20 — Staged: verification passed; version 0.21.1 → 0.21.2; no changelog file.
- 2026-10-20 — Review approved.
- 2026-10-20 — Released 0.21.2 as v0.21.2.
