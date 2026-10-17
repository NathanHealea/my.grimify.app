# Environment Configuration

> Status: **Draft v0.2**. Auth = Clerk.
> Vite only exposes variables prefixed `VITE_` to the browser. **Everything with `VITE_` is public.**

## Public Variables (browser bundle, `.env.local` / deploy settings)

```bash
VITE_CONVEX_URL=              # https://<deployment>.convex.cloud (set automatically by `npx convex dev` / `convex deploy`); the build writes its host into the CSP
VITE_CLERK_PUBLISHABLE_KEY=   # pk_test_… (dev) / pk_live_… (prod)
VITE_APP_URL=                 # e.g. http://localhost:5173 / https://grimify.app
```

---

## Private Variables

### Convex deployment environment (set in the Convex dashboard or `npx convex env set`)
```bash
CLERK_JWT_ISSUER_DOMAIN=      # Clerk Frontend API URL, shown when you activate Clerk dashboard → Integrations → Convex
                              # (e.g. https://<name>.clerk.accounts.dev). Read by convex/auth.config.ts.
                              # Keep a copy in .env.local for reference; Convex reads only the deployment's value.
                              # Symptom if the Convex integration isn't active: Clerk signs in, but
                              # .../tokens/convex returns 404 and Convex treats everyone as signed out.
CLERK_SECRET_KEY=             # Set ONLY on the production Convex deployment (sk_live_…, production Clerk instance), and on
                              # a personal `npx convex dev` deployment (sk_test_…, Clerk dev instance) for testing.
                              # Leave it unset on develop and stage: they sign in with the production Clerk instance, so
                              # their key would be the sk_live_ key, which can read and change every production user.
                              # Read by convex/legacyClaim.ts to look up a user's verified email addresses
                              # (DECISIONS 059). Set it only with `npx convex env set`, never in a committed file or a
                              # VITE_ variable.
LEGACY_IMPORT_HASH_KEY=       # The key the legacy export for this deployment was hashed with (features/legacy-import.md).
                              # Set ONLY on production (the real key) and on a personal dev deployment (its own key, for
                              # a made-up export). Unset on develop and stage, so the old-data prompt is off there.
                              # Unset → the prompt is off. Set without CLERK_SECRET_KEY → the claim throws.
```

### Deploy settings (local only, one file per environment)
`npm run deploy:<env>` reads `.env.deploy.<env>.local` (`dev`, `stage` or `prod`). The files are git-ignored (`.env.*`); never commit them.
```bash
CONVEX_DEPLOY_KEY=            # production-type deploy key for that environment's Convex deployment: prod:<deployment>|…
                              # (npx convex deployment token create <name> --deployment <ref> --save-env .env.deploy.<env>.local)
VITE_CLERK_PUBLISHABLE_KEY=   # pk_live_… from the Clerk production instance; the same in all three files
```
The deploy refuses a missing file or variable, a `pk_test_` key, or a deploy key for any deployment other than the one `scripts/deploy.ts` records for that environment.

### Legacy export (local only, one-time)
`npm run legacy:export` reads `.env.legacy.local` when it exists (git-ignored by `.env.*`), otherwise the shell environment. See [features/legacy-import.md](features/legacy-import.md).
```bash
LEGACY_SUPABASE_URL=          # the old hosted project's URL, https://<ref>.supabase.co (not the local one in ../grimify.app/.env)
LEGACY_SUPABASE_SECRET_KEY=   # the old project's secret (service-role) key; it bypasses row-level security, so never commit or share it
LEGACY_IMPORT_HASH_KEY=       # at least 32 characters, e.g. `openssl rand -hex 32`; the production key goes only on the prod Convex deployment; a made-up export gets its own key
                              # needs the same value, and losing it means exporting again
```
The command refuses a missing variable or a shorter hash key.

### Legacy load (local only, one-time per environment)
`npm run legacy:load -- <dev|stage|prod> <export.json>` reads `CONVEX_DEPLOY_KEY` from that environment's deploy settings file (`.env.deploy.<env>.local`, above) and needs no other variable. It refuses a missing file or key, or a key for any deployment other than the one `scripts/deploy.ts` records for that environment. See [features/legacy-import.md](features/legacy-import.md).

### Local only, and CI secrets
```bash
CLERK_SECRET_KEY=             # sk_test_… from the Clerk dev instance; Playwright's signed-in E2E only.
                              # Never VITE_-prefixed (that would ship it to the browser). In CI: a GitHub Actions secret.
```

### Local only
`CONVEX_DEPLOYMENT` is written to `.env.local` by `npx convex dev`. Don't commit it.

---

## Environments

| Environment | Branch | Site | Cloudflare Worker | Convex deployment | Clerk |
|---|---|---|---|---|---|
| Local | any | `npm run dev` (localhost:5173) | none | personal dev deployment (`npx convex dev`) | dev instance |
| Dev | `dev` | `https://dev.grimify.app` | `v2-grimify-app-dev` | `develop` (name recorded in `scripts/deploy.ts`) | production instance |
| Stage | `stage` | `https://stage.grimify.app` | `v2-grimify-app-stage` | `stage` (name recorded in `scripts/deploy.ts`) | production instance |
| Production | `main` | `https://grimify.app` | `v2-grimify-app` | `nautical-toucan-398` | production instance |

Each site also answers on its `www.` name (`www.grimify.app`, `www.dev.grimify.app`, `www.stage.grimify.app`). Declare every domain in `wrangler.json`'s `routes`: the first scripted production deploy dropped `www.grimify.app`, which had been attached only in the Cloudflare dashboard. Each custom domain gets its own certificate, so the two-level `www.` names are covered.

Dev and stage sign in with real production accounts (Clerk allows this on subdomains of the production domain), but keep their own collections: nothing they write reaches production data. Every environment shows the live catalog, because the catalog is built into the app. Signing in on one `*.grimify.app` site signs you in on all of them. **Delete account on dev or stage deletes the real account.**

---

## Deploying

Each environment deploys with one command, run from its branch with everything committed and pushed (DECISIONS 044):

```bash
npm run deploy:dev     # from dev
npm run deploy:stage   # from stage
npm run deploy:prod    # from main
```

`scripts/deploy.ts` checks the branch, a clean tree, `HEAD` matching `origin/<branch>`, and the settings file, then:
1. `npx --no convex deploy --env-file .env.deploy.<env>.local --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL`: builds the frontend against that environment's Convex URL, then pushes the functions. If either fails, it stops.
2. Checks `dist/_headers` names that environment's Convex deployment. A mismatch stops before anything reaches Cloudflare.
3. `npx --no wrangler deploy --env <dev|stage|"">` (an empty `--env` is production): uploads `dist/` to the Worker. The functions are already live by then, so they briefly serve the old frontend; if this step fails, they keep serving it until the next good deploy.

What the deploy keeps out:
- `.env.local`: the deploy sets `GRIMIFY_DEPLOY`, and the build then loads no `.env` files, so your personal dev values never ship.
- `CONVEX_DEPLOYMENT`: Convex's help says it sends `convex deploy` to the project's production deployment. The settings file is passed with `--env-file` (which replaces `.env.local` for choosing the target) and the variable is removed from the deploy's environment. The build check in step 2 guards only the Cloudflare upload; by then the functions are already pushed.
- The Convex deploy key: Convex reads it from the settings file, so the build and Wrangler never see it.
- Unpinned tools: `npx --no` fails if `node_modules` is missing (run `npm ci`) instead of downloading the latest Convex or Wrangler.

### One-time setup

Run once, in this order. Everything is a command except step 2 and part of step 8, which are in the Cloudflare dashboard.

1. Log Wrangler in to the Cloudflare account that owns `grimify.app`: `npx wrangler login`.
2. Turn off the Worker's Git connection: Workers & Pages → `v2-grimify-app` → Settings → Build → disconnect the repository. Otherwise every push to `main` deploys a second time, from Workers Builds.
3. Production settings: `npx convex deployment token create deploy-prod --prod --save-env .env.deploy.prod.local`, then add `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…` to the file.
4. Dev and stage Convex deployments, in the existing project. The reference is `develop`, not `dev`, because `dev` means your personal dev deployment to the Convex CLI:
   ```bash
   npx convex deployment create develop --type prod
   npx convex deployment create stage --type prod
   npx convex deployment token create deploy-dev --deployment develop --save-env .env.deploy.dev.local
   npx convex deployment token create deploy-stage --deployment stage --save-env .env.deploy.stage.local
   ```
   Add `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…` to both files.
5. Point each at production Clerk (the CLI prompts for the value, `https://clerk.grimify.app`):
   ```bash
   npx convex env set --deployment develop CLERK_JWT_ISSUER_DOMAIN
   npx convex env set --deployment stage CLERK_JWT_ISSUER_DOMAIN
   ```
6. Create the long-lived branches from `main` and push them: `git branch dev main && git branch stage main && git push -u origin dev stage`.
7. On `dev`, record the two deployment names (the part between `prod:` and `|` in each key) as `convexDeployment` for `dev` and `stage` in `scripts/deploy.ts`, commit and push. Until then their deploys refuse with "isn't set up yet". Promote it to `stage` (DEPLOYMENT.md § Branches) before the first `deploy:stage`.
8. Deploy each environment once. The first `deploy:dev` and `deploy:stage` create their Workers, DNS records and certificates (`routes` in `wrangler.json`). Run the first `deploy:prod` watching its output: `grimify.app` was attached in the dashboard and is now declared in `wrangler.json`. Once it works, retire the old production key: delete the `CONVEX_DEPLOY_KEY` secret from the Worker's build variables (Settings → Build → Variables and secrets), and revoke the key itself with `npx convex deployment token delete '<the old key>' --prod` (single quotes, because the key contains `|`; without `--prod` it targets your personal dev deployment).

Never put `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` in `.env.local`: Wrangler loads `.env.local` on every run, and those would override `wrangler login`.

### Cloudflare Workers

`wrangler.json` defines all three. Production is the top level; `env.dev` and `env.stage` become the Workers `v2-grimify-app-dev` and `v2-grimify-app-stage`. Each serves `./dist` with the single-page-app fallback and declares its domain as a custom domain. The top-level `name` must stay `v2-grimify-app`; another name makes `wrangler deploy` create a new Worker without the domain. `www.grimify.app` redirects to the apex with a Cloudflare redirect rule rather than serving the app, so there's one origin for sign-in, storage and the installed app.

### Convex

Check an environment's Convex settings by deployment reference (`develop`, `stage`, or `--prod`):

```bash
npx convex env list --deployment stage
npx convex function-spec --prod                     # production, after a deploy
```

### Clerk production instance

Same settings as dev (see Rules), plus:
- Domain `grimify.app`, with the DNS records from Clerk dashboard → Domains. The Frontend API host (`clerk.grimify.app`) is in `public/_headers`; if it differs, change the CSP there.
- Integrations → Convex activated, or `.../tokens/convex` returns 404 and everyone looks signed out.
- Dev and stage need no Clerk change: they're subdomains of `grimify.app` using the same keys.

### Content-Security-Policy

`public/_headers` is a template: the build fills `{{CONVEX_HOST}}` from `VITE_CONVEX_URL` (`scripts/csp-headers.ts`), so each environment's CSP names only its own Convex deployment. The build fails on a missing or non-Convex URL. Moving Clerk domains means editing `_headers` and `scripts/static-files.test.ts`. `vite dev` and `vite preview` don't apply it, so check the console on the deployed site after changing it, in a private window or with the service worker unregistered. The service worker serves `index.html` from its cache with the headers it was cached with, so an installed app keeps the old policy until a release changes `index.html` and the user taps Reload.

---

## Rules

- Never commit real secrets. `.env.example` lists every variable with empty values; copy it to `.env.local`.
- The app refuses to start without `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL`, and shows the missing name.
- Clerk dashboard (dev and prod instances): enable Email address with Email verification code; turn off password, email links and social connections (DECISIONS 027).
- Clerk dashboard (dev and prod instances): allow users to delete their own accounts (User & authentication settings). Delete account calls `user.delete()` from the browser (DECISIONS 037); when it's off, Settings shows "Account deletion isn't available right now."
- `.env.local` and `.env*.local` are in `.gitignore`
- Never put a secret in a `VITE_` variable
- Keep local and production configuration separate (different Convex deployments, Clerk dev vs. prod instances)
- Document every new variable here in the same pull request that introduces it
