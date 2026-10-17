# Legacy Import

> Covers bringing old Grimify (the Supabase app in `../grimify.app`) owned paints and palettes into this app.
> Plan: [epic-legacy-import.md](../implementation-plans/legacy-import/epic-legacy-import.md). Env vars: [ENVIRONMENT.md](../ENVIRONMENT.md). Rationale: [DECISIONS 056, 057, 058, 059](../DECISIONS.md). Flow: [UX_FLOWS Flow 11](../UX_FLOWS.md).

## TL;DR

- Built so far: **the export, the loader and claiming on sign-in**. The purge is a later work item.
- `npm run legacy:export -- <output-dir> <grimify>/scripts/data` reads the old project **read-only** and writes **`export.json`** and **`report.json`**.
- Each old user becomes one record keyed by **`emailHash`**, an **HMAC-SHA256 of the normalized email** with `LEGACY_IMPORT_HASH_KEY`. The output holds **no email and no old UUID**.
- Old paints map to catalog IDs with **the same derivation as the catalog import**. Paints that don't map are **left out and listed in the report**.
- Palettes are **fitted to this app's limits** in the export: 60-character names, 200 paints, 30 groups, no repeated paints.
- Emails come from **Supabase Auth's admin API, confirmed addresses only**, not from `profiles.email`, which any old user could edit on their own row.
- `npm run legacy:load -- <env> <export.json>` stages the export in that environment's Convex deployment, in **`legacyImports`**, one row per `emailHash`. Loading again gives the same rows and **skips hashes already claimed**.
- The output directory **must be outside the repository**. **Only production gets real data**: dev and stage get a made-up export hashed with their own key.
- After sign-in, a user whose **verified** email hashes to a staged row is offered **Import**, **Not now** or **Discard**. The server reads the addresses from **Clerk's Backend API** (`CLERK_SECRET_KEY`); Import or Discard deletes the row and records the hash, so it **can't be claimed twice**.
- After the production load, **delete the export and `.env.legacy.local`** (or rotate the old project's secret key). Unclaimed staged data is purged 180 days after loading.

## Where the code lives

| Path | Role |
|---|---|
| `scripts/legacy-export.ts` | The CLI: config check, reads the tables, writes the files |
| `scripts/legacy/export-config.ts` | `readConfig`: env vars, hash key length, output directory outside the repo |
| `scripts/legacy/supabase.ts` | `fetchAll`: pages a PostgREST table with `Range`; `fetchAuthUsers`: pages Supabase Auth's admin users |
| `scripts/legacy/paint-map.ts` | `buildPaintMap`: old paint UUID → catalog ID or an unmapped reason |
| `scripts/legacy/hash.ts` | `normalizeEmail`, `hashEmail` |
| `scripts/legacy/transform.ts` | `transform`: old rows → export records and report |
| `scripts/legacy-load.ts` | The loader CLI: environment, deploy key, runs `npx convex run` |
| `scripts/legacy/load.ts` | `readExport`, `chunkRecord` (under 100 KB per call), `loaderEnv`, `loadExport` |
| `convex/legacyImports.ts` | `stageChunk`: the internal mutation each chunk is sent to; `summaryForHashes` and `claim` for the claim |
| `convex/legacyClaim.ts` | `findMine`, `resolveMine`: the public actions the prompt calls |
| `convex/lib/clerk.ts` | `verifiedEmails`: a Clerk user's verified addresses from the Backend API |
| `convex/lib/emailHash.ts` | `hashEmail`: the export's HMAC with Web Crypto, for the Convex runtime |
| `src/features/legacy-import/legacy-import-prompt.tsx` | The prompt sheet, mounted once in `AppProviders` |
| `scripts/catalog/import-legacy.ts` | `legacyPaintId`, shared with `convertBrand` |

## Running the export

Prerequisites: the old hosted project is running (free Supabase projects pause when idle), its URL and secret key are at hand, and you have a hash key. Put the three variables in `.env.legacy.local` (ENVIRONMENT.md).

```bash
npm run legacy:export -- /tmp/grimify-legacy ../grimify.app/scripts/data
```

The command stops with exit code 2, **before reading anything**, when a variable is missing, the URL isn't `https://`, the secret key has spaces or control characters, the hash key is under 32 characters, the output directory is inside the repository, or `export.json` or `report.json` already exists there. It prints row counts per table and a one-line summary with no personal data. Both files are written with mode `600`.

## How paints map

`buildPaintMap` follows paint → product line → brand to get the old brand slug, which equals this catalog's brand ID. It then finds the paint's `brand_paint_id` in that brand's legacy JSON file and runs `legacyPaintId`, the derivation `convertBrand` uses, so merged duplicate paints map to the kept ID. An ID is accepted only when it's in `data/catalog/*.json`.

| Reason in the report | Meaning |
|---|---|
| `unknown-brand` | The old brand isn't one the catalog import converted |
| `not-in-legacy-file` | The paint was added in the old admin UI, not from the JSON |
| `excluded-line` | Its line was excluded by the catalog import (AK Interactive Abteilung 502) |
| `not-in-catalog` | The derived ID isn't in the current catalog |

## What the export holds

`export.json` is an array of records, sorted by `emailHash`:

```json
{
  "emailHash": "a048681d…",
  "ownedPaintIds": ["citadel-base-abaddon-black"],
  "palettes": [
    { "name": "My palette", "paintIds": ["citadel-base-abaddon-black"], "groups": [] }
  ]
}
```

- Users come from Supabase Auth (`/auth/v1/admin/users`); an address counts only when `email_confirmed_at` is set. Users are grouped by trimmed, lowercased email, so two old accounts with one address become one record. Users without a confirmed email are skipped and counted.
- `ownedPaintIds` are the mapped owned paints, unique and sorted.
- Palettes are oldest first. Paints and groups keep their old position order.
- An email with no mapped owned paint and no palette isn't exported; it's counted as "no data".

Palette fitting, in order: unmapped paints are dropped; a repeated catalog ID keeps its first position; the list is cut to 200; groups past the 30th are dropped. A group member resolves through its palette paint to a catalog ID, so a member pointing at a collapsed repeat resolves to the kept paint. Members cut by the 200 cap, or repeated in a group, are dropped. Names are trimmed, cut to 60 characters, and an empty name becomes "Untitled". The 50-palette cap is applied at claim time.

`report.json` holds `totals` (users exported, skipped without an email, with no data, owned paints, palettes, and `removed`: duplicate paints, paints over the cap, groups over the cap, group paints dropped, names shortened, names set to "Untitled") and `unmapped`: one entry per unmapped old paint with its brand, `brand_paint_id`, name, reason, and how many owned and palette rows referenced it.

## Loading into Convex

Prerequisites: the deployment has the code from this work item (deploy it first), `.env.deploy.<env>.local` holds that environment's `CONVEX_DEPLOY_KEY` (ENVIRONMENT.md), and `npm ci` has run. Production gets the real export; dev and stage get a made-up export hashed with their own key.

```bash
npm run legacy:load -- dev /tmp/grimify-legacy-fixture/export.json
```

The command stops with exit code 2, before any call, when the environment is unknown, the settings file or key is missing, the key belongs to another deployment, or the export file isn't an array of valid records (the message names the first bad record by its position). It then:

1. Splits each record into chunks whose JSON stays under 100 KB: owned IDs first, then palettes, never splitting a palette. A palette too big for a chunk on its own fails that record.
2. Calls `npx --no convex run legacyImports:stageChunk '<chunk>'` per chunk, with the deploy key in the child's environment and `CONVEX_DEPLOYMENT` removed. The first chunk replaces the hash's staged row; later chunks append; the last sets `complete`.
3. Prints `Staged N, already claimed N, failed N`. A failed record is named only by its position and chunk number; Convex's own error output is hidden because it echoes the values sent. Exit code 1 when any record failed.

`stageChunk` checks every value again: hash format, paint IDs, names of 1–60 characters, 200 paints and 30 groups per palette. It stores at most 50 palettes per user and counts the rest in `palettesOmitted`. A hash in `legacyImportClaims` returns `claimed` and stages nothing. A load stopped partway leaves a row with `complete: false`; running it again replaces it.

To debug a failure, load the same record from a made-up export into dev, or run `stageChunk` from the Convex dashboard on dev.

## Claiming on sign-in

Prerequisites on the deployment: the staged data from its own export, `LEGACY_IMPORT_HASH_KEY` set to the key that export was hashed with, and `CLERK_SECRET_KEY` set to the secret key of the Clerk instance its users sign in with (ENVIRONMENT.md). Without the hash key the feature is off and nobody sees a prompt, so the code can ship ahead of the data.

1. Once per signed-in session, after `users.me` is non-null, the app calls `legacyClaim.findMine`.
2. The action takes the Clerk user ID from the session (`identity.subject`), reads `GET https://api.clerk.com/v1/users/{id}`, keeps addresses whose `verification.status` is `verified` by `email_code` or `email_link` (`verification.strategy`; an OAuth or SAML provider's address doesn't count), and hashes them like the export (`hashEmail`, Web Crypto).
3. `legacyImports.summaryForHashes` returns the counts for the first **complete** staged row matching a hash, or null. Unverified addresses, incomplete loads and users without a `users` row get null.
4. The sheet shows the counts (palettes include those the export counted as omitted). Import or Discard calls `legacyClaim.resolveMine`, which repeats the lookup and runs `legacyImports.claim` in one transaction:
   - Deletes the staged row and inserts the hash into `legacyImportClaims`, so a second call from any account fails with `LEGACY_IMPORT_NOT_FOUND` and a later load skips it.
   - Import: each staged paint becomes `owned: true` with `updatedAt` at the claim time, keeping `wishlisted` and `favorite`; paints already owned are left alone. Staged palettes are added oldest first, with new group IDs, until the user has 50; the rest, plus `palettesOmitted`, come back as `palettesSkipped`.
   - Discard: nothing is written to the user's data.

If an account has several verified addresses with staged data, one is offered per session, in Clerk's order. A user whose new account uses a different address can't claim. Nothing about the email is stored or logged; a failed Clerk call throws with its HTTP status only.

To try it on a deployment, load a made-up export whose record is hashed from an address you can sign in with, using that deployment's own hash key.

## Relations to other features

- **Catalog**: reads `data/catalog/*.json` for valid IDs and shares the ID derivation with the catalog import ([catalog/data-pipeline.md](catalog/data-pipeline.md)).
- **Palettes**: the caps match `convex/palettes.ts` ([palettes.md](palettes.md)); imported palettes get group IDs from its `newGroupId`.
- **Collection**: imported paints are ordinary `userPaints` rows, so the last-write-wins rule (DECISIONS 010) applies from the claim time on.
