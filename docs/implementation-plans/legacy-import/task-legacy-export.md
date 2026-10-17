---
type: task
epic: legacy-import    # removed by `wi new` when there is no parent epic
slug: legacy-export
status: in-progress
branch: task/legacy-export
worktree_path: /home/nathan/development/grimify/v2.grimify.app-worktrees/task-legacy-export
created: 2026-10-17
approved: 2026-10-17
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the merge commit
---

# Export and map old Supabase data to a hashed import file

## Summary

Adds an admin-run script, `npm run legacy:export`, that reads every old Grimify user's owned paints and palettes from the old Supabase project, maps each old paint to its catalog ID, reshapes palettes to this app's model and limits, and writes an import file keyed by an HMAC of each user's email, plus a report of paints that didn't map. It is the first step of the `legacy-import` epic: nothing is deployed, and the output file is what later children load into Convex.

## Context

- Epic: `docs/implementation-plans/legacy-import/epic-legacy-import.md` (R1, R2, R3).
- Old schema: `../grimify.app/supabase/migrations` (see the epic's Context). The export reads `profiles(id, email)`, `paints(id, brand_paint_id, name, product_line_id)`, `product_lines(id, brand_id)`, `brands(id, slug, name)`, `user_paints(user_id, paint_id)`, `palettes(id, user_id, name, created_at)`, `palette_paints(id, palette_id, position, paint_id)`, `palette_groups(id, palette_id, name, position)`, `palette_group_paints(group_id, palette_paint_id, position)`.
- Old brand slugs equal this catalog's brand IDs (`citadel`, `army-painter`, `vallejo`, `ak-interactive`, `scale75`, `green-stuff-world`). Each old `paints.brand_paint_id` is the legacy JSON `id` (`grimify.app/scripts/generate-seed.ts`, and the Scale75 migration).
- `convertBrand` in `scripts/catalog/import-legacy.ts` derives each catalog ID from the legacy paint's line and name, skips excluded lines, and merges same-ID paints; the ID derivation is inline and not exported today.
- Paint IDs may have changed since the import only by aliasing (DATABASE §8), so a derived ID is accepted only if it exists in the current catalog (`data/catalog/*.json`).
- Access: the old project is read through Supabase's REST API (PostgREST) with `fetch`; no Supabase client package is added. The old `../grimify.app/.env` points at a local Supabase, not the hosted project, so the real run needs the hosted URL and secret key (Risks).
- Scripts run with `node scripts/<name>.ts`; tests are Vitest files next to the code (`scripts/catalog/*.test.ts`).

## Scope

**In scope**

- Exporting the legacy ID derivation from `scripts/catalog/import-legacy.ts` and a paint map built from it.
- Pure transform from old rows to export records, with caps and a report.
- Email normalization and HMAC hashing.
- A CLI that pages through the old tables, refuses to write inside the repo, and writes `export.json` and `report.json`.
- Docs: ENVIRONMENT.md (env vars), `docs/features/legacy-import.md` (new), DECISIONS (keyed email hash, export outside the repo), features overview link.

**Out of scope**

- Loading into Convex (child `legacy-staging`) and claiming (child `legacy-claim`).
- Running the export against production data: an operational step for the owner once the hosted credentials are set.
- The 50-palettes-per-user cap: applied at claim time, when the user's existing palettes are known.
- Recipes, armies, notes, descriptions, `is_public` (epic Out of scope).

## Requirements

- **R1** — Each old paint maps to a catalog ID by brand slug and `brand_paint_id`, using the same derivation as the catalog import, including merged paints; a derived ID missing from the current catalog, an excluded line, or an unknown brand leaves the paint unmapped.
- **R2** — For each old user with an email and at least one owned paint or palette, the export holds one record: `emailHash`, `ownedPaintIds` (mapped, unique), and `palettes` (oldest first, each with `name`, `paintIds` in position order, and `groups` in position order with `name` and `paintIds`).
- **R3** — Palettes fit this app's rules: palette and group names trimmed, cut to 60 characters, and an empty name becomes "Untitled"; duplicate paints in a list keep the first; at most 200 paints and 30 groups; a group keeps only paints that are in its palette's kept list.
- **R4** — Old users sharing one normalized email are merged into one record.
- **R5** — `emailHash` is the lowercase hex HMAC-SHA256 of the trimmed, lowercased email with `LEGACY_IMPORT_HASH_KEY`; the export and report contain no email address and no old user, palette or group UUID.
- **R6** — The report lists every unmapped paint once (old brand, `brand_paint_id`, name, reason, and how many owned and palette references it had), plus totals: users exported, users skipped without an email, users with no data, owned paints, palettes, and what the caps removed.
- **R7** — The CLI reads `LEGACY_SUPABASE_URL`, `LEGACY_SUPABASE_SECRET_KEY` and `LEGACY_IMPORT_HASH_KEY`, fails with a clear message when any is missing or the hash key is shorter than 32 characters, reads every row past PostgREST's page limit, and refuses an output directory inside the repository.

## Acceptance criteria

- **AC1** (R1) — Given old paint `cit-1` of brand `citadel`, when mapped, then it is `citadel-base-abaddon-black`; given a paint in an excluded line, then it is unmapped with reason `excluded-line`.
- **AC2** (R2, R3) — Given an old palette named with 80 characters, 250 paint rows including a repeat, and 35 groups, when transformed, then the record has a 60-character name, 200 unique paints, 30 groups, and the report counts what was removed.
- **AC3** (R4, R5) — Given two old profiles with `A@Example.com ` and `a@example.com`, when exported, then there is one record whose hash equals HMAC(key, `a@example.com`), and the output text contains neither address nor either UUID.
- **AC4** (R7) — Given 2,500 `user_paints` rows and a 1,000-row page limit, when the CLI reads them, then all 2,500 are used.
- **AC5** (R7) — Given an output path inside the repo, when the CLI runs, then it exits non-zero before reading anything.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `legacyPaintId derives the catalog ID convertBrand writes` | `scripts/catalog/import-legacy.test.ts` | For each fixture legacy paint, the ID equals the matching paint's ID in `convertBrand`'s output; merged duplicates map to the kept ID; excluded line returns null. |
| T2 | R1 | `buildPaintMap maps by brand and brand_paint_id` | `scripts/legacy/paint-map.test.ts` | `citadel`/`cit-1` → `citadel-base-abaddon-black` (with a fixture legacy file); unknown brand, excluded line, and an ID missing from the catalog set are unmapped with reasons `unknown-brand`, `excluded-line`, `not-in-catalog`. |
| T3 | R2 | `transform builds one record per user with mapped owned paints and ordered palettes` | `scripts/legacy/transform.test.ts` | Owned IDs mapped and unique; palettes ordered by `created_at`; paints by `position`; groups by `position` with members by `position`; users with no data are counted, not exported. |
| T4 | R3 | `transform fits palettes to the caps` | `scripts/legacy/transform.test.ts` | 80-char name → 60; whitespace name → "Untitled"; repeat paint collapsed; 250 → 200; 35 groups → 30; a group member removed by the cap or pointing at a collapsed duplicate resolves to the kept paint or is dropped; counts recorded. |
| T5 | R1, R6 | `transform drops unmapped paints and reports them once` | `scripts/legacy/transform.test.ts` | An unmapped paint referenced by an owned row and two palettes appears once in the report with counts 1 owned, 2 palette; absent from records. |
| T6 | R4 | `transform merges users sharing a normalized email` | `scripts/legacy/transform.test.ts` | Two profiles, emails differing by case and whitespace → one record with both users' owned paints (unique) and palettes. |
| T7 | R5 | `hashEmail is a keyed HMAC of the normalized email` | `scripts/legacy/hash.test.ts` | Equals a known HMAC-SHA256 vector for `a@example.com`; `' A@Example.com '` hashes the same; a different key gives a different hash. |
| T8 | R5, R6 | `export output contains no emails or old UUIDs` | `scripts/legacy/transform.test.ts` | `JSON.stringify` of records and report contains no fixture email and no fixture profile, palette, group or palette-paint UUID; users without email are counted as skipped. |
| T9 | R7 | `fetchAll pages through PostgREST` | `scripts/legacy/supabase.test.ts` | With a stub `fetch` serving 2,500 rows in pages of 1,000 by `Range`, returns 2,500 rows and sends the secret key in `apikey` and `Authorization`; a non-2xx response throws with the table name and status. |
| T10 | R7 | `readConfig validates the environment` | `scripts/legacy/export-config.test.ts` | Missing variable → error naming it; hash key under 32 chars → error; output dir inside the repo root → error; outside → ok. |

**Not unit testable:** None. The real run against the hosted project is an operational check (Risks).

## Implementation plan

1. [x] Export `legacyPaintId` from the catalog import and use it in `convertBrand` — touches `scripts/catalog/import-legacy.ts`, `scripts/catalog/import-legacy.test.ts` — tests T1
2. [x] Add the paint map and email hash — touches `scripts/legacy/paint-map.ts`, `scripts/legacy/paint-map.test.ts`, `scripts/legacy/hash.ts`, `scripts/legacy/hash.test.ts` — tests T2, T7
3. [x] Add the transform from old rows to export records and report — touches `scripts/legacy/transform.ts`, `scripts/legacy/transform.test.ts` — tests T3, T4, T5, T6, T8
4. [x] Add the PostgREST reader and config checks — touches `scripts/legacy/supabase.ts`, `scripts/legacy/supabase.test.ts`, `scripts/legacy/export-config.ts`, `scripts/legacy/export-config.test.ts` — tests T9, T10
5. [x] Add the `legacy:export` CLI and npm script — touches `scripts/legacy-export.ts`, `package.json` — tests none (wiring only)
6. [x] Document the export — touches `docs/ENVIRONMENT.md`, `docs/DECISIONS.md`, `docs/features/legacy-import.md`, `docs/features/overview.md` — tests none (docs only)

**Must not change:** `convertBrand`'s output for any input (T1 compares against it); the catalog files; Convex schema and functions.

**High-risk steps:** None in code: the script only reads the old project. Running it against the hosted project reads other people's personal data (emails) and is an owner-run step outside this item.

## Risks and open questions

- **Hosted credentials.** `../grimify.app/.env` holds a local Supabase URL. The real run needs the hosted project's URL and its secret (service-role) key, which aren't in the repo or the old project's files.
- **PostgREST page limit.** Supabase caps responses (default 1,000 rows); the reader pages with `Range` and ordered keys so no row is skipped.
- **Paints added outside the JSON.** Paints created in the old admin UI have a `brand_paint_id` that isn't in the legacy JSON; they land in the report.
- **Group members after collapse.** A group references a `palette_paint_id`; when that row was a repeat of an earlier paint, it resolves to the kept paint.
- **Export file.** Holds hashed emails and people's collections; the CLI refuses paths inside the repo, and the owner deletes it after the production load.

## Progress log

- 2026-10-17 — Planned.
- 2026-10-17 — Plan approved.
- 2026-10-17 — Approved under the owner's autonomous-delivery instruction for the legacy-import epic (2026-10-17)
- 2026-10-17 — Started on branch task/legacy-export from origin/dev.
- 2026-10-17 — Implemented steps 1-6. Deviations: added unmapped reason not-in-legacy-file (paints added in the old admin UI) with a T2 assertion; CLI takes the legacy JSON dir as a second argument and reads .env.legacy.local if present; refuses to overwrite an existing export; files written mode 600. Baseline build needs VITE_CONVEX_URL in the worktree (no .env.local); verified with a placeholder URL.
- 2026-10-17 — Unverified: whether Supabase's new sb_secret_ keys accept Authorization: Bearer alongside apikey (T9 requires both headers); the legacy service-role JWT is sent the same way. Confirm on the first real run.
