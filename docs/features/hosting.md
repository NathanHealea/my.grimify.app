# Hosting and Deploys

> Covers the Cloudflare Workers, the security headers, and `scripts/deploy.ts`.
> Process and rollback: [DEPLOYMENT.md](../DEPLOYMENT.md). Env vars and setup: [ENVIRONMENT.md](../ENVIRONMENT.md). Headers policy: [SECURITY.md §5](../SECURITY.md). Rationale: [DECISIONS 043, 044](../DECISIONS.md).

## TL;DR

- The frontend is **three assets-only Cloudflare Workers**, with **no Worker code**. Each serves `./dist` with **`not_found_handling: "single-page-application"`**.
- **One command per environment**: `npm run deploy:dev`, `deploy:stage`, `deploy:prod`. Each runs **only from its own branch**: `dev`, `stage`, `main`.
- A deploy **pushes Convex first**, then **checks that the built CSP names the right Convex host**, then uploads to Cloudflare.
- `public/_headers` holds the **CSP** and security headers. The build fills in **`{{CONVEX_HOST}}`** per environment.
- Every site is also served on its **`www.` name**.

## Where the code lives

| Path | Role |
|---|---|
| `wrangler.json` | Workers, assets directory, custom-domain routes per environment |
| `scripts/deploy.ts` | `ENVIRONMENTS`, `planDeploy`, `checkBuiltHeaders`, `runPlan` |
| `scripts/csp-headers.ts` | Vite plugin `cspHeaders()`: validates `VITE_CONVEX_URL` and fills `dist/_headers` |
| `public/_headers` | Header template: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| `.env.deploy.<env>.local` | Per-environment deploy settings (not committed) |

## Environments

| Env | Branch | Worker | Domains | Convex deployment |
|---|---|---|---|---|
| `dev` | `dev` | `v2-grimify-app-dev` | `dev.grimify.app`, `www.dev.grimify.app` | `sensible-buffalo-782` |
| `stage` | `stage` | `v2-grimify-app-stage` | `stage.grimify.app`, `www.stage.grimify.app` | `notable-ferret-719` |
| `prod` | `main` | `v2-grimify-app` | `grimify.app`, `www.grimify.app` | `nautical-toucan-398` |

## What a deploy checks first

`planDeploy()` **refuses** to deploy when any of these hold:

- You're not on the environment's branch.
- There are **uncommitted changes**.
- The branch is **ahead of or behind `origin`**.
- `.env.deploy.<env>.local` is missing, or it lacks `CONVEX_DEPLOY_KEY` or `VITE_CLERK_PUBLISHABLE_KEY`.
- The Clerk key doesn't start with **`pk_live_`**.
- The Convex key isn't a **production key for that deployment** (`prod:<deployment>|…`).

## Deploy steps

1. **Convex push and build**:

   ```bash
   npx --no convex deploy --env-file .env.deploy.<env>.local --cmd "npm run build" --cmd-url-env-var-name VITE_CONVEX_URL
   ```

2. **Build check**: `dist/_headers` `connect-src` must contain exactly `https://<deployment>.convex.cloud` and `wss://<deployment>.convex.cloud`. If not, **nothing is uploaded** to Cloudflare.
3. **Upload**:

   ```bash
   npx --no wrangler deploy --env <dev|stage|"">
   ```

`GRIMIFY_DEPLOY` is set during the build, which makes `vite.config.ts` **ignore `.env.local`**, so dev values never ship. **The deploy key is never echoed.** It reaches only Convex, through `--env-file`.

If the Worker upload fails after the Convex push, the **new functions run with the old frontend** until the next good deploy (DEPLOYMENT.md).

## CSP build step

`cspHeaders()` runs on `vite build` only:

1. At `buildStart`, it **fails the build** unless `VITE_CONVEX_URL` is exactly `https://<name>.convex.cloud` (no port, path, query or credentials).
2. At `writeBundle`, it replaces every `{{CONVEX_HOST}}` in `dist/_headers`.

The CSP also allows Clerk's script, connect and frame origins. **If those are wrong, sign-in is blocked.**

## Relations to other features

- **Catalog** ([data-pipeline.md](catalog/data-pipeline.md)): `npm run build` runs `catalog:build` first.
- **Auth** ([auth-account.md](auth-account.md)): CSP origins for Clerk; the production `pk_live_` key.
- **PWA** ([pwa.md](pwa.md)): SPA fallback, so deep links like `/paints/<id>` load directly.
