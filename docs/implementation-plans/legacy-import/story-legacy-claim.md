---
type: story
epic: legacy-import    # removed by `wi new` when there is no parent epic
slug: legacy-claim
status: released
branch: story/legacy-claim
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/story-legacy-claim
created: 2026-10-17
approved: 2026-10-17
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.20.0
review_approved: 2026-10-17
pr:                  # set by `wi pr`
tag: v0.20.0
---

# Claim old data on sign-in by verified email

## Summary

After signing in, a person who used the old Grimify is offered their old owned paints and palettes. The server looks up the signed-in user's verified email addresses in Clerk, hashes them with the import key, and checks for a staged import. If one is found, a bottom sheet says how many paints and palettes were found and offers Import, Not now, and Discard. Import adds the paints to the collection and the palettes as new palettes without touching anything already there; both Import and Discard delete the staged data so it can't be claimed again.

## Context

- Epic: `docs/implementation-plans/legacy-import/epic-legacy-import.md` (R5, R6, R7, R9). Depends on `legacy-staging` (`legacyImports`, `legacyImportClaims`, `complete` flag) and `legacy-export` (`scripts/legacy/hash.ts`: lowercase hex HMAC-SHA256 of the trimmed, lowercased email).
- **Verified email (decided while planning, 2026-10-17):** on the dev Clerk instance the token Convex receives carries only `aud, exp, fva, iat, iss, nbf, sid, sts, sub, v`, so `ctx.auth.getUserIdentity()` has no email. Rather than editing session claims in three Clerk dashboards, a Convex action reads the user's email addresses and their `verification.status` from Clerk's Backend API (`GET https://api.clerk.com/v1/users/{user_id}`, bearer `CLERK_SECRET_KEY`). `identity.subject` is the Clerk user ID, and Convex accepts only tokens from the configured issuer (`convex/auth.config.ts`).
- Convex rules: read `convex/_generated/ai/guidelines.md`; actions have no `ctx.db` and call internal queries and mutations; never take a user identifier from the client (SECURITY §2) — the action derives `tokenIdentifier` from `ctx.auth` and passes it to an internal mutation. `fetch` and Web Crypto (`crypto.subtle`) are available in the default runtime; no `"use node"`.
- Existing data rules: `userPaints` rows (`owned`, `wishlisted`, `favorite`, `updatedAt`; index `by_userId_and_paintId`), last-write-wins on `updatedAt` (DECISIONS 010). Palettes: caps and group ID generation in `convex/palettes.ts`.
- Frontend: `src/app-providers.tsx` mounts `SignInProvider` and `StoreUser`; `users.me` becomes non-null once the user row exists. Bottom sheets use `src/components/ui/sheet.tsx` (Radix Dialog: focus trap, Escape closes); toasts are a polite live region (`src/features/feedback`). Styling rules: CODE_STYLE §5a (sibling `.css`, tokens only, no inline styles).

## Scope

**In scope**

- `convex/lib/emailHash.ts` (Web Crypto HMAC) and `convex/lib/clerk.ts` (verified emails for a Clerk user).
- `legacyImports.summaryForHashes` internal query and `legacyImports.claim` internal mutation.
- `legacyClaim.findMine` and `legacyClaim.resolveMine` public actions.
- `src/features/legacy-import/` prompt sheet, mounted once in `AppProviders`.
- Convex env vars `CLERK_SECRET_KEY` and `LEGACY_IMPORT_HASH_KEY`: documented as production-only; develop and stage leave them unset.
- Docs: PRD, UX_FLOWS (new flow), API, SECURITY (outbound call to Clerk with a secret), ENVIRONMENT, DECISIONS (verified email from Clerk's Backend API), `docs/features/legacy-import.md`.

**Out of scope**

- Matching anything but a verified email address.
- Undoing an import.
- Showing the prompt to signed-out users or offering import from Settings later (Not now asks again next session).

## Requirements

- **R1** — `findMine` returns `null` when the caller is signed out, has no `users` row, has no verified email, no complete staged import matches, or the deployment lacks `LEGACY_IMPORT_HASH_KEY`; otherwise it returns `{ ownedCount, paletteCount }` for the match. Unverified addresses are never hashed or matched.
- **R2** — `resolveMine({ choice: "import" })` adds every staged owned paint to the caller's collection as `owned: true` (an existing row keeps `wishlisted` and `favorite`), with `updatedAt` set to the claim time, or kept when the existing row's is later (never moved backwards).
- **R3** — Import adds the staged palettes, oldest first, as new palettes with new group IDs, up to the caller's 50-palette cap, and never changes or removes existing palettes or paints. It returns `{ paintsAdded, palettesAdded, palettesSkipped }`, where skipped counts palettes past the cap plus the staged `palettesOmitted`.
- **R4** — `resolveMine({ choice: "discard" })` writes nothing to the caller's data.
- **R5** — After import or discard, the staged row is deleted and its hash is recorded in `legacyImportClaims`; a second call fails with `LEGACY_IMPORT_NOT_FOUND`, and no other account can claim it.
- **R6** — Once per signed-in session after `users.me` is non-null, the app calls `findMine`; on a result, a bottom sheet titled "Bring over your old Grimify data?" states the counts and offers **Import**, **Not now** and **Discard**. Discard asks to confirm before it runs. Not now closes it until the next session. After Import or Discard the sheet shows a result step with the outcome ("Added 120 paints and 4 palettes.") in a `role="status"` region that's always mounted in the sheet, and a **Done** button that gets focus and closes it. A failure shows the error in that same region, keeps the buttons and leaves the data staged. No toasts: Radix Dialog hides the page's toast region from assistive tech while the sheet is open.
- **R7** — The sheet meets WCAG 2.1 AA: focus moves into it on open and returns on close, every control is reachable and operable by keyboard, Escape acts as Not now, buttons have visible names, text meets 4.5:1 contrast, and it fits 320 px wide and 200% text without horizontal scrolling.

## Acceptance criteria

- **AC1** (R1) — Given a staged import for `a@example.com` and a Clerk user whose `a@example.com` is verified, when `findMine` runs, then it returns the counts; with the address unverified, it returns null.
- **AC2** (R2, R3) — Given a user owning nothing who has wishlisted Macragge Blue and has 48 palettes, when they import 120 paints including Macragge Blue and 5 palettes, then 120 paints are owned, Macragge Blue is still wishlisted, they have 50 palettes, and `palettesSkipped` is 3.
- **AC3** (R5) — Given a completed import, when `resolveMine` runs again from that or any other account with the same verified email, then it fails with `LEGACY_IMPORT_NOT_FOUND` and nothing changes.
- **AC4** (R6) — Given a signed-in old user, when the app loads, then the sheet shows "120 owned paints and 5 palettes"; pressing Not now closes it, and it isn't shown again until the next sign-in or reload.
- **AC5** (R6, R7) — Given the sheet open, when a keyboard user presses Tab, then focus cycles through Import, Not now, Discard and Close; Discard then asks "Discard your old data for good?" with **Discard for good** and **Cancel**, and focus moves to Cancel.
- **AC6** (R6, R7) — Given the sheet open, when Import succeeds, then the sheet stays open and its status region reads "Added 120 paints and 5 palettes.", with focus on the only action, **Done**, which closes it; when Import fails, the status region reads "Couldn't import your old data. Try again." and the buttons stay.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `hashEmail matches the export script` | `convex/lib/emailHash.test.ts` | Web Crypto HMAC of `' A@Example.com '` equals `scripts/legacy/hash.ts` output for the same key, and the known vector. |
| T2 | R1 | `verifiedEmails keeps only verified addresses` | `convex/lib/clerk.test.ts` | Stub `fetch`: request is `GET /v1/users/<subject>` with bearer key; returns only `verification.status === "verified"` addresses whose `verification.strategy` is `email_code` or `email_link` (an OAuth- or SAML-verified address is dropped); non-2xx throws with the status. |
| T3 | R1 | `findMine returns counts for a complete staged match and null otherwise` | `convex/legacyClaim.test.ts` | convex-test with stubbed `fetch` and env: verified match → counts; unverified, incomplete row, no row, signed out, missing hash key → null. |
| T4 | R2, R3 | `resolveMine import merges paints and adds palettes up to the cap` | `convex/legacyClaim.test.ts` | Existing wishlisted paint keeps `wishlisted` and becomes owned; new rows owned; 48 existing palettes + 5 staged → 50, `palettesSkipped` 3 (+`palettesOmitted`); existing palettes unchanged; group IDs unique. |
| T5 | R4, R5 | `resolveMine discard deletes the staged row and changes nothing else` | `convex/legacyClaim.test.ts` | No `userPaints` or `palettes` writes; staged row gone; claim recorded. |
| T6 | R5 | `resolveMine fails on a second claim` | `convex/legacyClaim.test.ts` | Second call (same user, and a second user with the same verified email) throws `LEGACY_IMPORT_NOT_FOUND`; data unchanged. |
| T7 | R6 | `prompt appears once per session with the found counts` | `src/features/legacy-import/legacy-import-prompt.test.tsx` | Mocked `findMine` → sheet title and "120 owned paints and 5 palettes"; not called while `users.me` is null; called once across re-renders; Not now closes without calling `resolveMine`. |
| T8 | R6 | `import and discard resolve and show the outcome in the sheet` | `src/features/legacy-import/legacy-import-prompt.test.tsx` | Import → `resolveMine({choice:"import"})`, the sheet's always-mounted status shows "Added 120 paints and 5 palettes.", Done is the only action, has focus and closes the sheet; no toast; Discard → confirm step with focus on Cancel → Discard for good → `resolveMine({choice:"discard"})` → result step; rejection → error in the sheet's status, buttons stay; `LEGACY_IMPORT_NOT_FOUND` → result step with "Your old data was already brought over or discarded." |
| T9 | R7 | `prompt is keyboard operable and labelled` | `src/features/legacy-import/legacy-import-prompt.test.tsx` | Focus moves into the dialog; dialog has an accessible name; Escape closes as Not now; buttons have names; tab order Import, Not now, Discard, Close. |

**Not unit testable:** R7 contrast, 320 px and 200% text: checked by hand in the browser at 320 px with 200% text, and tokens are the existing sheet and button tokens whose contrast DESIGN_SYSTEM already records.

## Implementation plan

1. [x] Add the Web Crypto email hash and the Clerk verified-email lookup — touches `convex/lib/emailHash.ts`, `convex/lib/emailHash.test.ts`, `convex/lib/clerk.ts`, `convex/lib/clerk.test.ts` — tests T1, T2
2. [x] Add `summaryForHashes`, `claim`, and the `findMine` / `resolveMine` actions — touches `convex/legacyImports.ts`, `convex/legacyClaim.ts`, `convex/legacyClaim.test.ts` — tests T3, T4, T5, T6
3. [x] Add the claim prompt sheet and mount it — touches `src/features/legacy-import/legacy-import-prompt.tsx`, `src/features/legacy-import/legacy-import-prompt.css`, `src/features/legacy-import/legacy-import-prompt.test.tsx`, `src/app-providers.tsx` — tests T7, T8, T9
4. [x] Document the claim flow — touches `docs/PRD.md`, `docs/UX_FLOWS.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/ENVIRONMENT.md`, `docs/DECISIONS.md`, `docs/features/legacy-import.md` — tests none (docs only)
5. [x] Not set on develop or stage: `CLERK_SECRET_KEY` and `LEGACY_IMPORT_HASH_KEY` go only on the production Convex deployment (ENVIRONMENT.md), because develop and stage sign in with the production Clerk instance and its `sk_live_` key can read and change every production user. The feature is off on develop and stage (`findMine` returns null); end-to-end testing uses a personal `npx convex dev` deployment with the Clerk dev instance and a made-up export — touches no files — tests none (configuration)

**Must not change:** existing public function contracts (`users.*`, `userPaints.*`, `palettes.*`); the `users` table (still only `tokenIdentifier`, DECISIONS 028); the sign-in flow.

**High-risk steps:** Step 2 (authorization: links an account to data by verified email and writes into user data), Step 5 (secrets on a deployment). Signed off by the owner's autonomous-delivery instruction for this epic (2026-10-17).

## Risks and open questions

- **Clerk API from Convex.** Adds an outbound call with a secret on each new session for signed-in users. One call per session; failures return an error the client logs, and the app works as before.
- **Email change between apps.** A user whose new account uses a different address can't claim. Out of scope; they can add and verify the old address in Clerk's account settings if that's ever exposed.
- **Mutation size.** A claim writes up to 2,837 `userPaints` rows and 50 palettes in one transaction: about 2,890 writes (paints, palettes, the staged row's delete and the claim record), inferred to be within Convex's per-transaction limits; not run against a deployment. T4 claims 120 paints.
- **Only prod gets the env vars.** Develop and stage stay off. Without `LEGACY_IMPORT_HASH_KEY`, `findMine` returns null and the feature is off, so deploying the code ahead of the data is safe.

## Progress log

- 2026-10-17 — Planned.
- 2026-10-17 — Plan approved.
- 2026-10-17 — Approved under the owner's autonomous-delivery instruction for the legacy-import epic (2026-10-17)
- 2026-10-17 — Started on branch story/legacy-claim from origin/dev.
- 2026-10-17 — Steps 1-2 done: hash, Clerk lookup, claim functions. Step 2 also touched convex/palettes.ts (newGroupId exported, takes the group list) and convex/_generated/api.d.ts (hand-added module lines; codegen needs network).
- 2026-10-17 — Steps 1-4 done. Step 3 also touched src/test/setup.ts (global convex/react mock gains useAction since AppProviders mounts the prompt). Step 5 (Convex env vars on develop) left for the orchestrator; develop signs in with the production Clerk instance, so its CLERK_SECRET_KEY is the sk_live key.
- 2026-10-17 — Step 5 deferred to the owner: dev uses the production Clerk instance, so it would need the sk_live_ secret on the develop deployment
- 2026-10-17 — Review fix: outcomes and errors now show in the sheet (result step with Done, always-mounted role=status) instead of toasts, because Radix Dialog hides the toast region from assistive tech while the sheet is open (WCAG 4.1.3). R6, AC6 and T8 updated.
- 2026-10-17 — Review fixes: Discard confirm starts on Cancel and is named Discard for good (WCAG 3.3.4); LEGACY_IMPORT_NOT_FOUND shows the result step; only email_code/email_link-verified addresses count; claim never moves updatedAt backwards; CLERK_SECRET_KEY and LEGACY_IMPORT_HASH_KEY documented as production-only; Flow 11 loading state and the mutation-size risk corrected.
- 2026-10-17 — Review cycle 2: Done button described by the outcome (VoiceOver drops the live region on focus move); security fixes confirmed
- 2026-10-17 — Test audit: 6 tests added; 8 surviving mutants killed (incl. user scoping of the userPaints scan)
- 2026-10-17 — Staged: verification passed; version 0.19.8 → 0.20.0; no changelog file.
- 2026-10-17 — Review approved.
- 2026-10-17 — Released 0.20.0 as v0.20.0.
