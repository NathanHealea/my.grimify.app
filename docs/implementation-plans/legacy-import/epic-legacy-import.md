---
type: epic
slug: legacy-import
status: released     # planned | in-progress | released
created: 2026-10-17
approved: 2026-10-17
---

# Import old Grimify data

## Summary

People who used the old Grimify (the Supabase app in `../grimify.app`) can bring their owned paints and palettes into this app. An admin exports every old user's data once, maps it to this catalog and this app's palette model, and loads it into Convex keyed by a hash of the account email. When an old user signs in here with the same verified email, the app offers to import their data; nothing is copied into anyone's account until they accept. Without this, moving to the new app means rebuilding a collection and palettes by hand.

## Context

- **Source (old app, read from `../grimify.app/supabase/migrations`):** Supabase Postgres with Supabase Auth (Google, Discord, email and password). Relevant tables:
  - `profiles` (`id` = `auth.users.id`, `email` synced from `auth.users`).
  - `paints` (`id uuid`, `brand_paint_id` such as `cit-1` or `sdp-01`, `product_line_id`); `brands.slug`.
  - `user_paints` (`user_id`, `paint_id`, `added_at`, `notes`): owned paints. The old app had no wishlist or favorites.
  - `palettes` (`name` 1–80 chars, `description`, `is_public`, `army_id`), `palette_paints` (`id`, `position`, `paint_id`, `note`; the same paint may appear twice), `palette_groups` (`name` 1–100 chars, `position`), `palette_group_paints` (`group_id`, `palette_paint_id`, `position`).
  - Also present but not imported: `recipes*`, `armies`, roles, avatars.
- **Paint ID mapping is reproducible.** The old seed wrote each legacy JSON paint's `id` into `paints.brand_paint_id` (`grimify.app/scripts/generate-seed.ts`, and the Scale75 migration the same way), and this catalog was built from that same JSON by `convertBrand` (`scripts/catalog/import-legacy.ts`, DECISIONS 015, 018). Running the same conversion gives `brand_paint_id → catalog paint ID`. Paints in excluded lines, and any paint added through the old admin UI rather than the JSON, won't map.
- **Target (this app):** `userPaints` rows (`owned`, `wishlisted`, `favorite`, `updatedAt`, DECISIONS 010/011/033); one `palettes` document per palette with `paintIds` and `groups[{id, name, paintIds}]` (caps in `convex/palettes.ts`: 50 palettes, 200 paints, 30 groups, names 60 chars). `users` holds only `tokenIdentifier` (DECISIONS 028). Sign-in is email one-time code only (DECISIONS 027), so an email address is the only link between an old and a new account.
- **Verified email on the server.** Clerk's Convex integration configures token claims on the Clerk Dashboard Sessions page, where extra claims can be added with shortcodes (clerk.com/docs/integrations/databases/convex). Today's claims are not recorded in the repo; whether `email` and a verified flag reach `ctx.auth.getUserIdentity()` must be confirmed in child 3.

Decisions from the planning conversation (2026-10-17):

- **Every old user's data** is migrated, not only the owner's. (decided)
- **Claim on sign-in:** each person imports their own data after signing in with a verified email that matches their old account. No Clerk accounts are created in bulk. (decided)
- **Retention:** unclaimed imports are purged 180 days after each record is loaded, and claim records 180 days after the claim. (decided)
- **Real data only in production:** dev and stage get a made-up export hashed with their own key; only the prod Convex deployment holds the real key and real data (privacy review of `legacy-export`). Emails come from Supabase Auth, confirmed addresses only (security review: `profiles.email` is user-editable). (decided)
- **Delivery:** build every child autonomously and deploy to dev without a release approval gate; production stays a separate, explicit step. (decided)

## Scope

**In scope**

- A local, admin-run export script reading the old Supabase database read-only and writing a mapped, hashed export file outside the repo.
- Paint ID mapping from old `paints` rows to catalog IDs, with a report of every paint that didn't map.
- A Convex staging table for unclaimed imports and an admin loader per environment.
- A claim flow: after sign-in, a prompt showing what was found, with Import and Discard.
- Merging imported data into an account that already has data.
- Purging unclaimed staged data.
- Docs: PRD, UX_FLOWS, DATABASE, API, SECURITY, ENVIRONMENT, DECISIONS (email hash stored in Convex next to DECISIONS 028; Clerk token claims).

**Out of scope**

- Recipes, armies, profile fields (display name, bio, avatar), roles: no counterpart in this app.
- Palette descriptions, `is_public`, `army_id`, per-paint notes in palettes, notes on owned paints: no field to hold them. Dropped and counted in the report.
- Changes to the old app (banner, redirect, shutdown): separate repo.
- Matching on anything other than a verified email (for example a user whose new account uses a different address).
- Creating Clerk accounts for old users.

## Requirements

- **R1** — The export reads every old user's owned paints and palettes (with groups and order) and maps each paint to its catalog ID; every paint that doesn't map is listed in a report with its old ID, name and brand, and is left out of the import.
- **R2** — The export and everything stored in Convex contain no plain email address and no old Supabase user ID; users are identified by a keyed hash (HMAC) of the normalized email, with the key held only in environment variables.
- **R3** — Imported palettes fit this app's rules: names trimmed and cut to 60 characters, duplicate paints in a list collapsed to the first, at most 200 paints and 30 groups per palette; anything cut is counted in the import summary.
- **R4** — An admin can load the export into a chosen Convex deployment; loading twice doesn't duplicate staged imports.
- **R5** — A signed-in user whose verified email matches a staged import sees a prompt saying what was found (counts of owned paints and palettes) with Import and Discard; a user whose email isn't verified, or doesn't match, sees nothing.
- **R6** — Import adds the old owned paints to the user's collection (`owned: true`, leaving wishlist and favorite as they are) and adds the old palettes as new palettes up to the 50-palette cap; the user's existing data is never removed or overwritten.
- **R7** — A staged import can be claimed once. After Import or Discard it's deleted, and no other account can claim it.
- **R8** — Unclaimed staged imports are deleted after the retention period.
- **R9** — The claim prompt meets WCAG 2.1 AA: keyboard operable, focus managed, announced to screen readers, 4.5:1 text contrast, works at 320 px and 200% text.

## Acceptance criteria

- **AC1** (R1) — Given an old palette with Abaddon Black (`cit-1`), when the export runs, then the export holds `citadel-base-abaddon-black` and the report lists only paints with no catalog match.
- **AC2** (R2) — Given a finished export and a loaded deployment, when either is searched for any old user's email or Supabase UUID, then nothing is found.
- **AC3** (R3) — Given an old palette with an 80-character name, 250 paints and a paint listed twice, when it's imported, then the palette has a 60-character name, 200 unique paints, and the summary says 50 paints were left out.
- **AC4** (R4) — Given an export loaded into dev, when the loader runs again with the same file, then the number of staged imports is unchanged.
- **AC5** (R5) — Given an old account for `a@example.com` and a new user signed in with verified `a@example.com`, when the app loads, then the prompt shows the old paint and palette counts; signed in as `b@example.com`, no prompt.
- **AC6** (R6) — Given a user who already owns and wishlists Macragge Blue and has 48 palettes, when they import 5 old palettes that also own Macragge Blue, then Macragge Blue is owned and still wishlisted, they have 50 palettes, and the summary says 3 palettes didn't fit.
- **AC7** (R7) — Given a user who pressed Import, when they or anyone else signs in again, then no prompt appears and calling the claim function again fails.
- **AC8** (R8) — Given a staged import older than the retention period, when the purge runs, then it's gone.
- **AC9** (R9) — Given a keyboard-only user, when the prompt opens, then focus moves into it, Import and Discard are reachable with Tab, and Escape closes it without claiming.

## Child work items

Each child gets its own planning pass when it is picked up. `wi` updates the
Status column by matching the Slug column, so keep slugs exact.

| # | Type | Slug | Title | Covers | Depends on | Status |
|---|------|------|-------|--------|-----------|--------|
| 1 | task | legacy-export | Export and map old Supabase data to a hashed import file | R1, R2, R3 | — | released |
| 2 | task | legacy-staging | Stage the import in Convex with an admin loader | R2, R4 | 1 | released |
| 3 | story | legacy-claim | Claim old data on sign-in by verified email | R5, R6, R7, R9 | 2 | released |
| 4 | task | legacy-purge | Purge unclaimed imports after the retention period | R8 | 2 | released |

**Independently shippable:** 1 ships alone (a local script and its report; nothing deployed), and its report is the first real measure of how much data won't map. 2 deploys a table no user can see. 3 is the first user-visible change and needs 2 loaded in the environment. 4 needs only 2, but must ship before or with 3 reaching production so staged data has a limit. Riskiest: 3 (identity and a write into accounts), so its plan builds and tests the verified-email lookup before any UI. 1 is next: until it runs against the real database, the unmapped count is a guess.

## Risks and open questions

- **Retention period for unclaimed data (decided 2026-10-17).** 180 days after each record is loaded (claim records: after the claim), then purge.
- **Privacy notice (open).** Old users signed up to the old app. Does moving their data into a new system need notice to them (email, a banner on the old app) or a privacy-policy update here? Not a FERPA surface (hobby data, no student records), but it is personal data about people who haven't joined the new app.
- **Verified email claim (decided 2026-10-17).** The dev Clerk token Convex receives has no email claim (claims: `aud, exp, fva, iat, iss, nbf, sid, sts, sub, v`). The claim reads the user's addresses and `verification.status` from Clerk's Backend API in a Convex action with `CLERK_SECRET_KEY`, so no Clerk dashboard changes are needed; each deployment needs `CLERK_SECRET_KEY` and `LEGACY_IMPORT_HASH_KEY` set.
- **Old database access.** The export needs the old project's connection details (env vars, never committed). Free Supabase projects pause after about a week idle (DECISIONS 003, alternatives); it may need restoring first.
- **Unmapped paints.** Paints added in the old admin UI, or in lines `convertBrand` excluded, won't map. Count unknown until child 1 runs.
- **Merge rules (proposed).** Owned paints: union. Palettes: added as new, with names kept even if they match an existing palette; oldest first until the cap. `updatedAt` on written `userPaints` rows is the claim time, so a later change on any device wins (DECISIONS 010).
- **Export file sensitivity.** It holds hashed emails and people's data. It lives in a temp directory outside the repo, is never committed, and is deleted after the production load.
- **Hash key.** An HMAC key (proposed name `LEGACY_IMPORT_HASH_KEY`) must be the same in the export run and in each Convex deployment that claims. Plain SHA-256 of an email is guessable from a list of addresses, so a keyed hash is used. Losing the key means re-exporting.
- **One-way door.** After production users claim, imported rows are ordinary user data; undoing an import means each user deleting palettes by hand.
- **Old `palette_paints` duplicates and group references.** A group may reference a `palette_paint_id` whose paint was collapsed as a duplicate; the mapping points it at the kept copy.

## Progress log

- 2026-10-17 — Planned.
- 2026-10-17 — Epic approved.
- 2026-10-17 — Retention set to 180 days; owner asked for autonomous build and deploy to dev without a release gate
- 2026-10-17 — Children 2-4 planned; verified email comes from Clerk's Backend API (dev token has no email claim)
- 2026-10-17 — All four children released (v0.19.7-v0.20.1) and deployed to dev. Feature is off on dev/stage by design (keys only on production). Production rollout, the real export/load, and the privacy notice are owner steps.
