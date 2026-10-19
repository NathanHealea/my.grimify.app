# Security Guidelines

> Status: **Draft v0.2**

## 1. Authentication

Authentication Provider:
Clerk (free tier), integrated with Convex via `ConvexProviderWithClerk`. See DECISIONS 005.

Methods:
- **Email one-time code (primary).** This is the most reliable option inside an installed iOS PWA, because the user types the code into the app and never leaves it.
- OAuth (Google / Discord via Clerk): **not for MVP** (DECISIONS 027); revisit after the beta. If added, test it inside the installed iOS PWA, where redirects can open Safari and lose the session.
- Magic links: **not used** (they open in Safari, not the installed PWA, on iOS)
- Passwords: **not used**

Sessions:
- Managed by Clerk; Convex verifies the Clerk JWT on every call (`convex/auth.config.ts`)
- Private beta: sign-up is **open to anyone with the link** (no allowlist). Revisit if abuse appears.
- The catalog is public and needs no session

---

## 2. Authorization

Roles:
- **User:** any signed-in person
- No admin role in the app. Catalog changes are made through Git pull requests reviewed by the maintainer (Nathan).

Permissions:

### User
- Read the public catalog
- Read, create, update and delete **their own** `userPaints`
- Read, create, rename and delete **their own** `palettes`, and add paints to and remove paints from them. Another user's palette behaves exactly like a missing one: `palettes.get` returns `null`, mutations throw `NOT_FOUND` (DECISIONS 048)
- Read and delete **their own** `users` row
- See, import or discard the staged old Grimify data whose `emailHash` matches one of **their own verified** email addresses (`legacyClaim.*`, DECISIONS 059). The server reads the addresses from Clerk; the client sends only the choice. A claimed or discarded import is deleted and can't be claimed by any account again

### Anonymous
- Read the public catalog only

Authorization must be enforced server-side (in Convex functions):
- Every user-data function calls `requireUser(ctx)` (see `convex/lib/auth.ts`)
- `userId` always comes from `ctx.auth`, **never** from client arguments
- The device store (browser IndexedDB, DECISIONS 036) holds the Clerk user ID, the last collection (paint IDs and flags) and the outbox. No tokens, email or name. The user ID only decides which cached collection to show offline; it's never sent as an argument, and the server still derives the user from the auth token on every call
- A different user signing in on the device clears the store before anything shows; signing out clears it (after a warning if changes haven't synced)
- Queries always filter by the caller's `userId` using an index

---

## 3. Secrets

Rules:
- Never hard-code credentials
- Never commit production secrets (`.env.local` is gitignored; commit `.env.example` only)
- Never expose private secrets to the client. Only `VITE_*` variables reach the browser, and those must be safe to be public.
- Store Convex server-side secrets in the Convex dashboard (environment variables)
- Store CI/deploy secrets as Cloudflare Worker build secrets (type Secret, not Variable) and GitHub Actions secrets
- Rotate compromised credentials immediately

---

## 4. Environment Variables

See ENVIRONMENT.md for the full list.

Public (in the browser bundle):
- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`

Private:
- `CONVEX_DEPLOY_KEY` (CI only)
- `CLERK_JWT_ISSUER_DOMAIN` (Convex env)
- `CLERK_SECRET_KEY` (Convex env): Clerk Backend API key, used only by `convex/lib/clerk.ts` to read a user's verified addresses. It can read and change every Clerk user, so it's set only on the production deployment (never on develop or stage, whose key would be the production `sk_live_` key; ENVIRONMENT.md), with `npx convex env set`, and never logged; a failed lookup throws with the HTTP status only
- `LEGACY_IMPORT_HASH_KEY` (Convex env): HMAC key for old users' email hashes (DECISIONS 056)

---

## 5. API Security

Input validation:
Convex argument validators on every function plus format checks (e.g., `paintId` regex). Catalog data is validated at build time.

Rate limiting:
Not required for MVP. If abuse appears, add the `@convex-dev/rate-limiter` component to mutations. The auth provider rate-limits code emails.

CORS:
Not applicable. The Convex client handles its own origin; there are no custom HTTP endpoints. If Convex HTTP actions are added later, allow only the my.grimify.app, stage.my.grimify.app and dev.my.grimify.app origins (and grimify.app until the marketing cutover).

Authentication:
Required for all user-data functions.

Authorization:
Ownership is checked by deriving `userId` from the identity (see §2).

Outbound calls:
`legacyClaim.findMine` and `legacyClaim.resolveMine` call `https://api.clerk.com/v1/users/{subject}` with `CLERK_SECRET_KEY`, where `subject` comes from the verified session token, never from arguments. Only addresses with `verification.status` `verified` and `verification.strategy` `email_code`, `email_link` or `admin` count: the user proved the address by email (sign-in is email code only, DECISIONS 027), or the instance owner created it as verified; and an address an OAuth or SAML provider asserted isn't proof the user owns it. **Enabling another sign-in method means revisiting this check** in `convex/lib/clerk.ts`. The answer's addresses are hashed in memory and never stored, logged or returned. The app calls `findMine` once per signed-in session.

Headers (`public/_headers`, applied by the Cloudflare Worker to every static response, including the single-page-app fallback; `scripts/static-files.test.ts` pins them):
- `Content-Security-Policy`: `'self'` plus the build's own Convex deployment (`https` and `wss`; the build fills `{{CONVEX_HOST}}` from `VITE_CONVEX_URL` and fails on anything but `https://<name>.convex.cloud`, and the deploy checks it names that environment's deployment), Clerk's Frontend API (`clerk.grimify.app`) and the hosts in [Clerk's CSP list](https://clerk.com/docs/guides/secure/best-practices/csp-headers) (Turnstile, `*.protect.clerk.com`, `img.clerk.com`). No `'unsafe-eval'` or inline scripts; `style-src 'unsafe-inline'` because Clerk injects styles at runtime. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`. Allow `camera` when barcode scanning ships.

Environments: dev.my.grimify.app and stage.my.grimify.app use the production Clerk instance with their own Convex deployments, so they hold real account IDs (no student or personnel data) and get the same care as production. Deploy keys live only in git-ignored `.env.deploy.<env>.local` files; the deploy script never prints them.

Crawlers: `public/robots.txt` disallows everything during the private beta. It isn't access control; anyone with the link can open the app.

---

## 6. Data Protection

Sensitive data:
- Email address, display name (held only by the auth provider; never copied to Convex, DECISIONS 028)
- A user's collection and palettes (low sensitivity, but private by default)

Encryption:
In transit via HTTPS (Cloudflare and Convex); at rest by the providers.

Retention:
Kept until the user deletes their account. Dev and stage (dev.my.grimify.app, stage.my.grimify.app) sign in with the same production accounts but keep their own Convex data, so one person can have rows in up to three deployments.

Deletion:
"Delete account" in Settings (type DELETE to confirm) → `users.deleteAccount` removes all Convex data (collection, palettes, `users` row) → the device record is cleared → Clerk's `user.delete()` removes the auth account (DECISIONS 037). Collections over 500 rows finish deleting in scheduled batches seconds later. If the Clerk step fails, the account exists with no data and the user is told to retry; a retry completes it. Needs "Allow users to delete their accounts" on in the Clerk instance (ENVIRONMENT.md). **Gap:** deletion clears only the Convex deployment of the site it runs on. Deleting on my.grimify.app leaves any dev or stage rows; deleting on dev or stage deletes the production Clerk account and leaves the production rows with no way to sign in and clear them (DECISIONS 044; issue #20).

Signing out clears the device record only after Clerk's sign-out succeeds; while it runs, nothing is saved to the device or sent (DECISIONS 038).

Privacy:
- No tracking cookies. Analytics (if any) is cookieless (Cloudflare Web Analytics).
- Private beta: a short note in Settings → About is enough. A privacy page is required before any public launch.

---

## 7. Logging

Never log:
- Tokens, JWTs, one-time codes
- API keys
- Email addresses or names

Log (Convex logs / console in dev only):
- Function errors (with error code, without user data)
- Unexpected states (e.g., unknown `paintId`)

---

## 8. File Uploads

Not supported in MVP.
If photo color-picking ships later: process the image **client-side only** (canvas); don't upload it.

---

## 9. Content & Licensing

- Don't scrape or ship manufacturer product photos or marketing text
- Paint names and approximate hex colors only; cite data sources in `data/catalog/SOURCES.md`
- Brand names are trademarks of their owners; add a footer disclaimer ("Not affiliated with…")

---

## 10. Security Checklist

- [ ] Authentication implemented (email code works in the installed iOS PWA)
- [ ] Every user-data Convex function calls `requireUser`
- [ ] No function accepts `userId` from the client
- [ ] Server-side validation on all function args
- [ ] Secrets only in Convex, Cloudflare or GitHub secret stores
- [ ] `.env.local` gitignored
- [x] Security headers configured (`public/_headers`; verify on my.grimify.app after each change)
- [ ] Account deletion works end to end (built; manual check on the dev instance pending)
- [ ] Errors don't expose sensitive details
- [ ] `npm audit` reviewed; dependencies kept minimal
