---
type: task
slug: production-deploy
status: released
branch: task/production-deploy
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/task-production-deploy
created: 2026-10-08
approved: 2026-10-08
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.12.1
review_approved: 2026-10-08
pr:                  # set by `wi pr`
tag: v0.12.1
---

# Deploy to Cloudflare Pages and Convex production

## Summary

Puts Grimify on `https://grimify.app` for the private beta. Cloudflare Pages builds `main` from GitHub with `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL`, so each pushed release builds the frontend against Convex production and then pushes the functions; if either fails, nothing is published. The site ships security headers (a Content-Security-Policy that allows only the app, Convex production and Clerk's production hosts) and a `robots.txt` that keeps search engines out until the app goes public. ENVIRONMENT.md gains every production setting, so the deployment can be rebuilt from the docs.

## Context

- **Already in place (owner, 2026-10-08):** the Clerk production instance on `grimify.app`, and the Convex production deployment `nautical-toucan-398`. Checked from the terminal: that deployment has no functions and no environment variables yet (`npx convex function-spec --prod`, `npx convex env list --prod`).
- **Decisions made in planning (2026-10-08):**
  - Pages' own GitHub build, production branch `main`, preview builds off. No GitHub Actions or Wrangler (no new dependency).
  - The app lives at the apex `grimify.app`.
  - Security headers per SECURITY §5 ship in this item, plus `robots.txt`.
- **Verified facts the plan relies on:**
  - `convex deploy` with `CONVEX_DEPLOY_KEY` targets that key's deployment; `--cmd` runs the build with the URL in the variable named by `--cmd-url-env-var-name` (`npx convex deploy --help`, convex 1.46.0).
  - Pages treats a project with no top-level `404.html` as a single-page app and serves `/` for unmatched paths ([Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)). Grimify has none, so deep links like `/paints/<id>` work.
  - `_headers` goes in the static asset folder (`public/`); at most 100 rules, 2,000 characters a line ([Headers](https://developers.cloudflare.com/pages/configuration/headers/)).
  - An apex custom domain must be a zone on the same Cloudflare account, nameservers pointing at Cloudflare ([Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)).
  - The v3 build image defaults to Node 22.16.0 and ignores `engines`, but reads `.nvmrc` ([Build image](https://developers.cloudflare.com/pages/configuration/build-image/)). `.nvmrc` already says `24`, which `node scripts/build-catalog.ts` needs.
  - Clerk's CSP needs: `script-src` FAPI host, `https://challenges.cloudflare.com`, `https://*.protect.clerk.com`; `connect-src` FAPI host, `https://*.protect.clerk.com:*`; `img-src https://img.clerk.com`; `worker-src 'self' blob:`; `style-src 'unsafe-inline'`; `frame-src https://challenges.cloudflare.com https://*.protect.clerk.com`; `form-action 'self'` ([Clerk CSP](https://clerk.com/docs/guides/secure/best-practices/csp-headers)).
- `vite dev` and `vite preview` don't apply `_headers`, so the policy is only exercised on Pages.

## Scope

**In scope**

- `public/_headers` and `public/robots.txt`, with a unit test over both.
- ENVIRONMENT.md: the production table, the Pages project settings, and the dashboard checklist (Clerk, Convex, Cloudflare). SECURITY.md, DECISIONS (041), ROADMAP, TESTING.
- Live checks on `grimify.app` after the first deploy (owner, with the checklist below).

**Out of scope**

- Preview deployments (stays TBD in ENVIRONMENT.md; preview builds are off).
- Cloudflare Web Analytics (TBD in ARCHITECTURE.md).
- Long-cache rules for hashed assets; Pages' defaults stand.
- HSTS (a Cloudflare zone setting, not a file in the repo).
- Removing whatever `grimify.app` serves today; the owner does that in the Cloudflare dashboard.
- The PaintPad permission and opening to the public (separate ROADMAP items).

## Requirements

- **R1** — Every response from the site carries a `Content-Security-Policy` that allows scripts, connections, frames and images only from the site itself, the Convex production deployment (`https` and `wss`), Clerk's production Frontend API (`https://clerk.grimify.app`) and the other Clerk and Turnstile hosts Clerk documents. It doesn't allow `'unsafe-eval'` or inline scripts, and it forbids framing the site (`frame-ancestors 'none'`).
- **R2** — Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a `Permissions-Policy` that denies camera, microphone, geolocation and payment.
- **R3** — `https://grimify.app/robots.txt` tells every crawler not to crawl any path.
- **R4** — Pushing `main` deploys the Convex functions to `nautical-toucan-398` and then publishes the frontend built against that deployment at `https://grimify.app`; a failed Convex deploy publishes nothing.
- **R5** — On the live site, under the policy, a painter can sign in with an email code, mark a paint owned, see it in My Paints, and sign out, in Safari on iPhone (browser and installed) and in a desktop browser, with no CSP violations in the console.
- **R6** — Opening a deep link such as `https://grimify.app/paints/<id>` directly loads that screen.
- **R8** — The app never probes for `eval`, so the CSP reports no violation of its own on any screen (zod runs `jitless`).
- **R7** — ENVIRONMENT.md lists every production setting (Pages build command, output directory, variables and which are secret, Convex and Clerk dashboard steps) so someone can rebuild the deployment from it alone.

## Acceptance criteria

- **AC1** (R1) — Given the deployed site, when I load any page, then the response has the CSP and the browser console shows no CSP violation during sign-in, sync and sign-out.
- **AC2** (R2) — Given the deployed site, when I run `curl -sI https://grimify.app/paints`, then the three headers are present with those values.
- **AC3** (R3) — Given the deployed site, when I open `/robots.txt`, then it reads `User-agent: *` / `Disallow: /`.
- **AC4** (R4) — Given a release pushed to `main`, when the Pages build finishes, then `npx convex function-spec --prod` lists the app's functions and grimify.app shows the new version in Settings › About.
- **AC5** (R5) — Given a fresh iPhone, when I sign in on grimify.app, add the app to the Home Screen, sign in there, and own a paint, then the paint shows in My Paints on desktop after signing in with the same email.
- **AC6** (R6) — Given the deployed site, when I paste a paint's URL into a new tab, then the paint detail loads, not a 404.
- **AC8** (R8) — Given the deployed site in a private window, when I open Paints, a paint, and My Paints, then the console shows no `unsafe-eval` violation.
- **AC7** (R7) — Given only ENVIRONMENT.md, when I read the Production section, then every Pages, Convex and Clerk setting the deploy uses is listed, with no secret value in it.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `the CSP allows only the app, Convex production and Clerk hosts` | `scripts/static-files.test.ts` | Parses `public/_headers`; the `/*` block's CSP has exactly the expected sources per directive (`default-src 'self'`; `connect-src` includes `https://nautical-toucan-398.convex.cloud`, `wss://nautical-toucan-398.convex.cloud`, `https://clerk.grimify.app`, `https://*.protect.clerk.com:*`; `script-src`, `img-src`, `worker-src`, `style-src`, `frame-src`, `form-action` per Clerk's list) |
| T2 | R1 | `the CSP never allows eval, inline scripts, wildcards or framing` | `scripts/static-files.test.ts` | No `'unsafe-eval'`; `script-src` has no `'unsafe-inline'`, `*`, `http:` or `data:`; `frame-ancestors 'none'`; no dev hosts (`*.clerk.accounts.dev`, the dev Convex name) |
| T3 | R2 | `the site sends nosniff, a referrer policy and a deny-all permissions policy` | `scripts/static-files.test.ts` | The three headers exist in the `/*` block with those exact values; `Permissions-Policy` has `camera=()`, `microphone=()`, `geolocation=()`, `payment=()` |
| T4 | R1, R2 | `_headers stays within Cloudflare's limits` | `scripts/static-files.test.ts` | Every line ≤ 2,000 characters; ≤ 100 header rules |
| T6 | R8 | `zod runs jitless before any schema is built` | `src/zod-config.test.ts` | After importing `@/zod-config`, `z.config().jitless` is `true`; `src/main.tsx` imports `@/zod-config` before any import that binds names; `vite.config.ts` sets `strictExecutionOrder: true` |
| T7 | R1, R2 | `has a single rule, so no path can detach the headers` | `scripts/static-files.test.ts` | `_headers` has exactly one rule, `/*` (added at stage from the test audit) |
| T5 | R3 | `robots.txt disallows every crawler` | `scripts/static-files.test.ts` | `User-agent: *` followed by `Disallow: /` |

**Not unit testable:** Vite copies `public/` into `dist/` as-is, so the build output isn't tested separately; AC2 and AC3 check it live. R4, R5, R6 and the live half of R1–R3 depend on Cloudflare, Convex production and Clerk production. The owner verifies them on grimify.app after the first deploy with AC1–AC6 (TESTING.md gets the checklist). R7 is a doc review at stage.

## Implementation plan

1. [x] Add `public/_headers` (CSP, nosniff, Referrer-Policy, Permissions-Policy on `/*`) and `public/robots.txt` (disallow all), with their tests — touches `public/_headers`, `public/robots.txt`, `scripts/static-files.test.ts` — tests T1, T2, T3, T4, T5
2. [x] Document production: ENVIRONMENT.md Production section (Pages settings, variables, dashboard checklist, the Convex terminal commands), SECURITY.md headers and checklist, DECISIONS 041, TESTING.md live checklist, ROADMAP — touches `docs/ENVIRONMENT.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`, `docs/TESTING.md`, `docs/ROADMAP.md` — tests none (docs)
3. [x] Turn off zod's eval probe: `src/zod-config.ts` sets `z.config({ jitless: true })`, `src/main.tsx` imports it first, and Rolldown's `strictExecutionOrder` keeps that order in the bundle — touches `src/zod-config.ts`, `src/zod-config.test.ts`, `src/main.tsx`, `vite.config.ts`, `docs/DECISIONS.md` — tests T6

After release (owner, not a commit): create the Pages project and set the variables per ENVIRONMENT.md, then push the release; run AC1–AC6 on the live site and file any failure as an issue.

**Must not change:** application code and `vite.config.ts` other than step 3, the Convex schema and functions, `convex/auth.config.ts`, `package.json` scripts and dependencies.

**High-risk steps:** None in the branch: it adds two static files and docs, and `git revert` undoes them. The first push after release is outward-facing: it publishes the app at grimify.app and pushes the schema to Convex production. That happens only when the owner pushes, after the Pages project and secrets are set. I never handle the deploy key or `pk_live` key.

## Risks and open questions

- **Clerk's Frontend API host is assumed to be `clerk.grimify.app`** (Clerk's default for a production domain). Confirm on Clerk dashboard → Domains before build; a wrong host breaks sign-in under the CSP.
- **A too-strict CSP breaks sign-in only in production**, since dev and preview don't apply `_headers`. Mitigation: T1 pins Clerk's documented list, and AC1/AC5 are checked before the beta link goes out. If Clerk's list changes, sign-in fails with console violations naming the blocked host.
- **The Convex host is hard-coded** in `_headers`. Moving to a new production deployment means editing the file; T1 fails until the test agrees. A build-time generated file would avoid that but adds a script for a value that rarely changes.
- **`style-src 'unsafe-inline'`** is required by Clerk's runtime styles. It weakens the policy against injected styles, not scripts.
- **Creating the Pages project deploys `main` at once,** so Clerk and the Convex issuer must be set first (ENVIRONMENT.md lists the order). Afterwards every `wi release --push` is a production deploy. Checks still run only locally (`wi stage`); a later item could add CI.
- **Clerk production settings must mirror dev:** email code on, passwords and social off (DECISIONS 027), self-deletion allowed (DECISIONS 037), and the Convex integration activated, or `.../tokens/convex` returns 404 and everyone looks signed out.
- **`robots.txt` doesn't hide the site.** Anyone with the link can open it, and it doesn't stop pages being indexed if linked elsewhere. Fine for a private beta; it's not access control.
- **DNS:** the apex needs its nameservers on Cloudflare. If `grimify.app` serves something today, attaching it to Pages replaces it.

## Progress log

- 2026-10-08 — Planned.
- 2026-10-08 — Plan approved.
- 2026-10-08 — Started on branch task/production-deploy from origin/main.
- 2026-10-08 — Step 1: CSP also sets img-src data:, base-uri 'self', object-src 'none', manifest-src 'self' (hardening beyond Clerk's list; T1 pins them). Build command names --cmd-url-env-var-name VITE_CONVEX_URL explicitly rather than relying on detection.
- 2026-10-08 — Stage review: zod 4's eval probe (new Function) logs a CSP violation on every load, so AC1 could never pass. Owner approved adding z.config({ jitless: true }) at startup: R8, AC8, T6, step 3 added; Must not change relaxed for step 3.
- 2026-10-08 — Step 3 approach changed: z.config in a module imported first by main.tsx ran too late (Rolldown evaluates the shared chunk holding zod and the schemas before index; a browser check under the CSP still showed 3 eval violations). Now a src/lib/zod.ts wrapper sets jitless and re-exports z, and ESLint forbids importing zod directly.
- 2026-10-08 — Step 3 done with owner approval of strictExecutionOrder: served under the CSP, eval violations went from 3 to 0; bundle +32 KB raw / +11.5 KB gzip. DECISIONS 042.
- 2026-10-08 — The src/lib/zod.ts wrapper was abandoned before commit: src/features/catalog/schema.ts also runs under plain Node and may only import packages. Re-review LOWs fixed in docs: Must-not-change wording, deploy atomicity wording, CSS order trade-off in DECISIONS 042.
- 2026-10-08 — Test audit: 18/25 mutants killed; tightened T3, T5, T6 and added T7, all 7 survivors now killed (M9 by the parser and T7).
- 2026-10-08 — Staged: verification passed; version 0.12.0 → 0.12.1; no changelog file.
- 2026-10-08 — Review approved.
- 2026-10-08 — Released 0.12.1 as v0.12.1.
