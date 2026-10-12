---
type: story
slug: clerk-auth
status: released
branch: story/clerk-auth
worktree_path: ../grimify-v2-worktrees/story-clerk-auth
created: 2026-10-07
approved: 2026-10-07
version: 0.6.0
tag: v0.6.0
merge_commit: eafec5e (squash of story/clerk-auth)
---

# Clerk auth (email code) and Convex users

## Summary

Let people sign in with an emailed one-time code (Clerk, DECISIONS 005) and give each signed-in person a Convex `users` row, so the collection items that follow (Own/Want, My Paints, outbox) have an authenticated user to write for. This item wires Clerk and Convex together, adds the Convex schema, `requireUser` and the first functions, and puts sign-in and sign-out in Settings. Browsing the catalog stays anonymous.

## Context

ROADMAP NOW: "Clerk auth (email code) + Convex `users`".

Decided in conversation on 2026-10-07:

- **Email code only for MVP.** The OAuth TBD (PRD §6, SECURITY §1) is resolved as no OAuth for now; revisit after the beta. It works inside an installed iOS PWA without leaving the app.
- **Convex stores only the Clerk identity.** `users` holds `tokenIdentifier`, with no copied email or name. The UI reads them from Clerk on the device. DATABASE §4's optional `name` and `email` fields are dropped.

Already in place:

- **Convex dev deployment:** linked (`CONVEX_DEPLOYMENT` in `.env.local`), with `convex` 1.46.0 installed. There's no `convex/schema.ts` or functions yet, only `_generated`.
- **`.env.local`:** already has `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_JWT_ISSUER_DOMAIN`.
- **Dev deployment env:** `CLERK_JWT_ISSUER_DOMAIN` is set on the Convex dev deployment (`npx convex env list`, names only).

Checked against current docs:

- **Convex + Clerk** ([docs.convex.dev/auth/clerk](https://docs.convex.dev/auth/clerk)):
  - Install `@clerk/react`, since `@clerk/clerk-react` is deprecated.
  - Activate the **Convex integration** in Clerk's dashboard. The issuer is the Frontend API URL.
  - `convex/auth.config.ts` reads `process.env.CLERK_JWT_ISSUER_DOMAIN` with `applicationID: "convex"`.
  - Nest `ConvexProviderWithClerk` inside `ClerkProvider`.
- **Compatibility:**
  - Convex 1.46 declares `@clerk/react ^6.4.3`.
  - `@clerk/react` 6.17.6 supports React 19.3.
- **Clerk theming** ([Clerk changelog, 2025-07-15](https://clerk.com/changelog/2025-07-15-clerk-css-variables-support)): `--clerk-*` CSS variables can be defined in a stylesheet. The sign-in form follows our tokens from a `.css` file, with no CSS-in-JS (CODE_STYLE §5a).
- **`convex/_generated/ai/guidelines.md`** (read for this plan):
  - Index names include every field, so `by_tokenIdentifier`, not DATABASE's `by_token`.
  - Use `tokenIdentifier`, never `subject`.
  - Never take a user ID as an argument.
  - Every function has validators.
  - Tests use `convex-test` with the `edge-runtime` environment.

## Prerequisites (you, in the Clerk dashboard; no code)

1. Under User & authentication → Email, enable **Email address** with **Email verification code**. Turn off password, magic link and every social provider.
2. Under Integrations → **Convex**: activate it (if not already), and check that its Frontend API URL matches the `CLERK_JWT_ISSUER_DOMAIN` already set on the dev deployment.

I can't see the dashboard, so I'll confirm both by signing in with a real email code during verification.

## Dependencies (need your approval)

Versions checked against the npm registry on 2026-10-07.

| Package | Version | Kind | Why |
|---|---|---|---|
| @clerk/react | 6.17.6 | runtime | `ClerkProvider`, `SignIn`, `useAuth`, `useUser`, `useClerk` (DECISIONS 005); the replacement for the deprecated `@clerk/clerk-react` |
| convex-test | 0.0.60 | dev | Convex function tests (TESTING §2, Convex guidelines) |
| @edge-runtime/vm | 5.0.0 | dev | The edge-runtime Vitest environment `convex-test` needs |

## Behavior

**Providers:** `main.tsx` wraps the router in `ClerkProvider` and `ConvexProviderWithClerk`.

- If `VITE_CLERK_PUBLISHABLE_KEY` or `VITE_CONVEX_URL` is missing, the app throws at startup with the variable's name, so a misconfigured build fails loudly. E2E builds read the same `.env.local`.

**Settings, signed out:**

- An "Account" section: "Sign in to save the paints you own and want." with a **Sign in** button.
- The button opens the bottom sheet with Clerk's `<SignIn routing="virtual" />`: email field, then the 6-digit code, never leaving the app (UX_FLOWS Flow 4).

**After sign-in:**

- The sheet closes.
- A `useStoreUser` hook calls `users.store` once per signed-in session (idempotent).

**Settings, signed in:**

- "Signed in as {primary email}", read from Clerk's `useUser`, never from Convex.
- A **Sign out** button.

**Offline:**

- Clerk's script loads from Clerk's servers, so sign-in can't work offline.
- While offline and signed out, Settings says "Signing in needs an internet connection" and disables Sign in.
- Browsing and search are unaffected (the PWA item's offline E2E must still pass).

**Convex:**

- `schema.ts` defines `users { tokenIdentifier }` with index `by_tokenIdentifier`.
- `auth.config.ts` as in the docs above.
- `lib/auth.ts` has:
  - `requireIdentity(ctx)`: throws `ConvexError("UNAUTHENTICATED")` without an identity.
  - `requireUser(ctx)`: looks the row up via the index and throws `UNAUTHENTICATED` if it's missing.
- `users.ts`:
  - `store` (mutation, no args): returns the existing or new `Id<"users">`.
  - `me` (query, no args): returns `{ _id } | null`, and `null` when signed out or not yet stored.

## Scope

**In scope**

- Dependencies above; `.env.example` with every variable name and empty values (ENVIRONMENT rules)
- `convex/tsconfig.json`, `schema.ts`, `auth.config.ts`, `lib/auth.ts`, `users.ts`, Convex tests and a Vitest project for them
- Pushing the functions to the **dev** deployment (`npx convex dev --once`); no production deployment
- Providers, `useStoreUser`, the Settings Account section, the sign-in sheet, the Clerk theme stylesheet
- Docs: DECISIONS 027 and 028, DATABASE §4 and §7, API, SECURITY §1 and §8, ENVIRONMENT, TESTING, PRD §6, DEPLOYMENT (CSP note)

**Out of scope**

- `userPaints`, Own/Want toggles, My Paints, the outbox and the pending-action handoff in Flow 4 step 4 (collection items)
- `users.deleteAccount` and the rest of Settings (Settings item)
- OAuth providers
- Signed-in E2E with Clerk testing tokens (`@clerk/testing`), which needs a separate dependency; deferred to the collection item, where TESTING's "sign in → mark owned" journey lives. Real sign-in is a manual check here.
- Production Clerk instance and Convex production deploy (deploy item)
- `_headers` and Content-Security-Policy, which must allow Clerk's domains (deploy item; noted in DEPLOYMENT)

## Requirements

- **R1** — The app starts only when `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL` are set, and otherwise throws an error naming the missing variable. Anonymous browsing, search, detail and offline use work as before.
- **R2** — Signed out, Settings explains why to sign in and offers Sign in, which opens a sheet with Clerk's sign-in limited to email code. Completing it closes the sheet and shows the signed-in state.
- **R3** — Signed in, Settings shows "Signed in as {email}" from Clerk and a Sign out button that signs out and returns to the signed-out state.
- **R4** — The first time a signed-in session is ready, `users.store` creates exactly one `users` row for that `tokenIdentifier`. Later calls return the same ID and never create a second row.
- **R5** — `users.store` and `requireUser` reject calls without an identity with `UNAUTHENTICATED`. `users.me` returns `null` when signed out and `{ _id }` for the caller only. No function accepts a user identifier as an argument.
- **R6** — `users` stores only `tokenIdentifier`: no email, name or other profile data.
- **R7** — Offline and signed out, Settings says sign-in needs a connection and disables the button.
- **R8** — Accessibility (WCAG 2.1 AA):
  - The sign-in sheet is a labelled dialog ("Sign in") with focus management from the Sheet.
  - Clerk's form uses our tokens, including the 3:1 input border and 16px input text.
  - Buttons are at least 44px.

## Acceptance criteria

- **AC1** (R2, R4) — Given Settings signed out, when I tap Sign in, enter my email and the 6-digit code, then the sheet closes, Settings shows "Signed in as me@example.com", and the Convex dashboard shows one `users` row with only `tokenIdentifier`.
- **AC2** (R4) — Given I sign out and back in, then there's still one `users` row for me.
- **AC3** (R3) — Given I'm signed in, when I tap Sign out, then Settings returns to "Sign in to save…".
- **AC4** (R1) — Given `VITE_CLERK_PUBLISHABLE_KEY` is removed from `.env.local`, when I run the dev server, then the page shows an error naming the variable.
- **AC5** (R7) — Given DevTools offline and signed out, then Settings says "Signing in needs an internet connection" and Sign in is disabled. Paints search still works.
- **AC6** (R8) — Given the sign-in sheet in light and dark mode, then the email field has a visible 3:1 border, 16px text and our focus ring, and no part of the form is cut off on a 375px-wide screen.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R4, R6 | `stores one user per identity` | `convex/users.test.ts` | `t.withIdentity({ tokenIdentifier: "a" })` calling `store` twice returns the same ID; the table has one row whose only non-system field is `tokenIdentifier` |
| T2 | R4 | `keeps identities apart` | `convex/users.test.ts` | Identities "a" and "b" get different IDs |
| T3 | R5 | `rejects unauthenticated calls` | `convex/users.test.ts` | `store` without an identity throws `UNAUTHENTICATED` |
| T4 | R5 | `returns only the caller from me` | `convex/users.test.ts` | Signed out → `null`; identity "a" after store → `{ _id }` of a's row; identity "b" before store → `null` |
| T5 | R4 | `stores the user once per signed-in session` | `src/features/auth/use-store-user.test.tsx` | Mocked `useConvexAuth` authenticated → `store` mutation called once across re-renders; unauthenticated → not called |
| T6 | R2, R3, R7 | `shows the account state in Settings` | `src/features/auth/account-section.test.tsx` | Mocked Clerk hooks: signed out → explanation + Sign in; Sign in opens a dialog named "Sign in" containing the (mocked) Clerk `SignIn`; signed in → "Signed in as …" + Sign out calls `signOut`; offline + signed out → message and disabled button |
| T7 | R1 | `requires the Clerk and Convex variables` | `src/features/auth/env.test.ts` | `readAuthEnv({})` throws naming `VITE_CLERK_PUBLISHABLE_KEY`; with both set returns them |
| E1 | R1 | existing suites | `tests/e2e/*.spec.ts` | All catalog, filter, detail and offline journeys still pass with Clerk and Convex providers mounted |

**Not unit testable:**

- Real email-code sign-in, Clerk's dashboard configuration and Convex verifying a real Clerk JWT are checked by hand (AC1–AC3, AC6), on localhost.
- A signed-in E2E is deferred, as above.

## Implementation plan

1. [x] Install `@clerk/react@6.17.6`, and `convex-test@0.0.60` and `@edge-runtime/vm@5.0.0` (dev), exact. Add `.env.example`. Touches `package.json`, `package-lock.json`, `.env.example`.
2. [x] Convex TypeScript and test setup. Touches `convex/tsconfig.json`, `tsconfig.json`, `vite.config.ts`.
    - `convex/tsconfig.json` (Convex's recommended settings), referenced from the root `tsconfig.json` so `tsc -b` covers it.
    - A Vitest `projects` split: the existing jsdom/node project, plus a `convex` project with `environment: "edge-runtime"` for `convex/**/*.test.ts`.
3. [x] Schema, auth config and helpers, with T1–T4. Touches `convex/schema.ts`, `convex/auth.config.ts`, `convex/lib/auth.ts`, `convex/users.ts`, `convex/users.test.ts`.
    - Push to the dev deployment with `npx convex dev --once`, which also regenerates `convex/_generated`, never edited by hand.
    - Announce the target deployment before running it.
4. [x] Providers: `readAuthEnv` (T7) and `main.tsx` nesting `ClerkProvider` → `ConvexProviderWithClerk` → `RouterProvider`. Touches `src/features/auth/env.ts`, `env.test.ts`, `src/main.tsx`.
5. [x] `useStoreUser` (T5), mounted once at the app root. Touches `src/features/auth/use-store-user.ts`, its test, `src/main.tsx` or `src/routes/__root.tsx`.
6. [x] Account section and sign-in sheet (T6), plus the Clerk theme. Touches `src/features/auth/account-section.tsx`, `.css`, `.test.tsx`, `sign-in-sheet.tsx`, `clerk-theme.css`, `src/routes/settings.tsx`.
    - `clerk-theme.css` maps `--clerk-color-primary`, `-background`, `-foreground`, `-muted-foreground`, `-input`, `-border`, `-ring`, font family and radius to our tokens, under the same light and dark rules.
7. [x] Docs. Touches the files listed.
    - **DECISIONS 027:** email code only for MVP.
    - **DECISIONS 028:** no profile data copied to Convex.
    - **DATABASE §4 and §7:** `users` fields, index `by_tokenIdentifier`.
    - **API:** `users.me` shape; `deleteAccount` marked for the Settings item.
    - **SECURITY §1 and §8.**
    - **ENVIRONMENT:** the Convex integration instead of a JWT template; `.env.example`.
    - **TESTING:** the Convex test project.
    - **PRD §6:** OAuth TBD resolved.
    - **DEPLOYMENT:** CSP must allow Clerk.
8. [x] Verify: `npm run check`, `npm run build`, `npm run test:e2e`, `prettier --check .`. Then a manual sign-in on localhost (dev server only for this check, which you start or approve), and screenshots of the sheet in light and dark. Touches nothing.

**Must not change:** anonymous catalog behavior; the PWA's offline behavior; catalog data.

## Risks and open questions

- **Decision needed: the three dependencies.**
- **Clerk's script comes from Clerk's servers at runtime.** It isn't in our bundle or the service worker's precache, so sign-in is online only (R7). Browsing still works offline. The deploy item's Content-Security-Policy must allow Clerk's domains.
- **Third-party UI inside our sheet.** Clerk's form has its own markup. Theming covers colors, radius and font, but its internal spacing and labels are Clerk's. If its contrast or target sizes fall short of AA anywhere, I'll file an issue rather than fight the component.
- **A signed-in E2E is deferred.** Until the collection item adds Clerk testing tokens, sign-in is verified by hand.
- **Vitest projects split:** moving to `projects` changes how `npm test` discovers files. I'll confirm the test count only grows, and that nothing silently drops.
- **Running `npx convex dev --once` changes the dev deployment** (pushes the schema and functions). It's dev only, never production. Production is the deploy item.
- **Estimate:** 1.5–2 sessions, plus your time for the dashboard prerequisites.

## Progress log

- 2026-10-07 — Planned. Decided in conversation: email code only; Convex stores only `tokenIdentifier`.
- 2026-10-07 — Approved as written, including the three dependencies and pushing to the Convex dev deployment. The Clerk instance, publishable key and issuer domain were confirmed to match (`actual-squirrel-9784.clerk.accounts.dev`). The dashboard sign-in method and Convex integration settings are still to be confirmed at the manual sign-in check.
- 2026-10-07 — Implementation started in worktree `../grimify-v2-worktrees/story-clerk-auth` on `story/clerk-auth`; `.env.local` copied into the worktree (gitignored).
- 2026-10-07 — Steps 1–8 done, except the manual sign-in, which needs your email code. `npm run check` (130 tests in 29 files across the `app` and `convex` Vitest projects; catalog valid), `npm run build`, `npm run test:e2e` (9 passed, offline included, with the Clerk and Convex providers mounted) and `prettier --check .` exit 0. Functions pushed to `dev:proper-bloodhound-699` only (`users.store`, `users.me`). Drift:
  - Steps 2 and 3 share a commit: `convex/tsconfig.json` can't type-check until Convex sources exist. It needed `types: ["node"]` for `process.env` in `auth.config.ts`.
  - `@clerk/react` 6 no longer accepts `routing="virtual"` on `SignIn`, so the sheet uses `routing="hash"`; Clerk's steps live in `/settings#…`. `withSignUp` lets new emails sign up in the same flow. `ClerkProvider` gets the router's `navigate` for its redirects, so finishing sign-in doesn't reload the page.
  - A missing env variable is written into `#root` before the error is rethrown, so AC4's "page shows the variable name" holds instead of a blank page.
  - `@clerk/react` is mocked globally in `src/test/setup.ts` as signed out; account tests override it. The route tests render `/settings`, which now needs Clerk.
  - Self-review fix (`fix(auth)` commit): Clerk's email field edge was a translucent shadow below 3:1. The theme now targets Clerk's stable `cl-formFieldInput` class by attribute (it isn't kebab-case) to apply `--color-input-border`. Measured: `#8A8A8A` light, `#666666` dark, 16px text.
  - Screenshots showed "Continue with Google" in the sheet: Google is still enabled in the Clerk development instance (prerequisite 1 not done yet). That's a dashboard change, not code.
  - The main JS bundle grew from 90 to about 144 KB gzipped, because Clerk's React SDK loads with the app. Lazy-loading Clerk until Settings or sign-in is a possible follow-up.
  - `userPaints` index names in DATABASE (`by_user`, `by_user_paint`) also break the guideline's naming rule; they'll be renamed when the collection item builds them.
- 2026-10-07 — Staged. Version 0.6.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/clerk-auth`. Still open: the manual sign-in (AC1–AC3, AC6) after turning Google off and confirming email code plus the Convex integration in the Clerk dashboard.
- 2026-10-07 — Released. Owner approved the review; the manual sign-in result (AC1–AC3, AC6) wasn't reported in the approval. Squash-merged 10 commits from `story/clerk-auth` into `main` as 0.6.0 (eafec5e), tagged `v0.6.0`. Worktree and branch removed.
