# Deployment

> Status: **Draft v0.2**

## Environments

| Environment | Branch | Site | Deploy |
|---|---|---|---|
| Local | any | `http://localhost:5173` + personal Convex dev deployment | `npm run dev` |
| Dev | `dev` | `https://dev.my.grimify.app` (Worker `v2-grimify-app-dev`) | `npm run deploy:dev` |
| Stage | `stage` | `https://stage.my.grimify.app` (Worker `v2-grimify-app-stage`) | `npm run deploy:stage` |
| Production | `main` | `https://my.grimify.app` (Worker `v2-grimify-app`; also `grimify.app` until the marketing cutover) | `npm run deploy:prod` |

Dev and stage each have their own Convex deployment and sign in with production Clerk accounts. ENVIRONMENT.md § Environments and § Deploying have the details and the one-time setup.

---

## Hosting Setup

Frontend: three assets-only Cloudflare Workers (no Worker code; DECISIONS 043), defined in `wrangler.json` and deployed from your machine by `npm run deploy:<env>` (DECISIONS 044). Workers Builds isn't used; the repo's Git connection is turned off during one-time setup (ENVIRONMENT.md § One-time setup). Until then, a push to `main` also deploys from Workers Builds.
- Each Worker serves `./dist` with `not_found_handling: "single-page-application"`, so unknown paths get `index.html` with 200. Confirm deep links like `/paints/<id>` load directly.
- Custom domains are declared in `wrangler.json` (`routes` with `custom_domain: true`); `wrangler deploy` creates their DNS records and certificates.
- Wrangler is a pinned dev dependency, so every deploy uses the lockfile's version.
- Security headers: `public/_headers` (see SECURITY.md §5). The build fills in the environment's Convex host; the CSP must allow Clerk's Frontend API and script domains (production instance), or sign-in is blocked.

Backend: Convex Cloud (free plan). One project with three production-type deployments: `nautical-toucan-398` (production) and the deployments referenced as `develop` and `stage`. `scripts/deploy.ts` records each by its deployment name (`<word>-<animal>-<number>`), not its reference.

CI: none. Checks run locally at `wi stage` (`npm run check`, `npm run build`), and deploys run from a clean, pushed branch.

---

## Branches

```
story/… bug/… task/…  →  dev  →  stage  →  main
                                  hotfix/…  →  main
```

- Work items (`wi start`) branch from `dev` and `wi release` merges them into `dev` (`base_branch: dev`). Deploy dev to try them.
- Promotions fast-forward (DECISIONS 055), so after promoting, the branches point at the same commit and add no merge commits.
- Promote dev to stage when it's ready for a final check:
  ```bash
  git fetch && git switch stage && git merge --ff-only origin/stage && git merge --ff-only origin/dev && git push && npm run deploy:stage
  ```
- Promote stage to production:
  ```bash
  git fetch && git switch main && git merge --ff-only origin/main && git merge --ff-only origin/stage && git push && npm run deploy:prod
  ```
- If a promotion stops with "Not possible to fast-forward", the target has a commit the source lacks:
  - Stage to production: a hotfix reached `main` after the last promotion. Do the back-merge below if it isn't done, then promote dev to stage before stage to production: `stage` only gets the hotfix from `dev`, so a batch already on stage can't go to production on its own.
  - Dev to stage: someone committed on `stage` directly. Merge `stage` into `dev` (the back-merge command below with `origin/stage` in place of `origin/main`), then promote again. Reverting it on `stage` doesn't help: the revert is one more commit `dev` lacks.
- Hotfix: `wi` supports one base branch, so a hotfix is done by hand. Branch from `main`, fix, run `npm run check` and `npm run build`, merge into `main`, push, `npm run deploy:prod`. Then merge `main` into `dev` only, so the fix isn't lost; `stage` and `main` get the back-merge on the next promotion:
  ```bash
  git fetch && git switch dev && git merge --ff-only origin/dev && git merge --no-edit origin/main && git push && npm run deploy:dev
  ```
- Undo a bad promotion without moving a branch back (that needs a force push): revert the change on `dev` and promote again, or, when production can't wait, ship the revert as a hotfix.
- Version tags come from `wi release`, which fast-forwards each work item into `dev` and tags the item's last commit. Promotions carry those commits up unchanged, so a tag names the same code on every branch.

---

## Deployment Process

1. `wi stage` runs lint, typecheck, tests, catalog validation and the build locally
2. `wi release --push` merges into `dev` and pushes
3. `npm run deploy:dev` (from `dev`): build → Convex function push → build check → `wrangler deploy --env dev`. If the Worker upload fails after the push, the new functions run with the old frontend until the next good deploy
4. Smoke test dev (TESTING.md § Deployed checks), then promote to stage and production as above, checking each
5. Installed PWAs pick up the update via the "Update available" prompt

---

## Rollback

- **Frontend:** `npx wrangler rollback [--env dev|stage]` (or Workers & Pages → the Worker → Deployments → Rollback)
- **Convex functions:** revert the commit on the branch and redeploy that environment. Convex schema changes must be backward-compatible (optional fields) so a frontend rollback doesn't break.
- **Catalog:** revert the data commit and redeploy. Paint IDs are never removed, so user data is unaffected.

---

## Production Checklist

- [ ] Build succeeds
- [ ] Environment variables configured (Cloudflare, Convex, auth provider in production mode)
- [ ] Convex schema deployed without validation errors
- [ ] Auth provider production instance allows the production domain
- [ ] `catalog.json` is served and cached; the app works offline after the first load
- [ ] Manifest and icons valid (Lighthouse PWA check). Icons pending (GitHub issue #3), so installability fails until then
- [ ] `/sw.js` served with `Cache-Control: no-cache` (add to `public/_headers`), so installed apps can't get stuck on an old service worker
- [ ] Smoke tests pass: search, detail, sign in, own/want, My Paints
- [ ] Tested as an installed PWA on iPhone and Android

---

## Free-Tier Watchlist

Check these monthly in the dashboards:
- Convex: function calls, database bandwidth, storage
- Auth provider: monthly active users
- **TBD:** confirm whether Convex free deployments are paused after inactivity and whether a keep-alive is needed (more likely now for `develop` and `stage`)
