---
type: task
slug: seed-catalog
status: released
branch: task/seed-catalog
worktree_path: ../grimify-v2-worktrees/task-seed-catalog
created: 2026-10-06
approved: 2026-10-06
version: 0.1.2
tag: v0.1.2
merge_commit: 10fdb2f (squash of task/seed-catalog)
---

# Seed catalog

## Summary

Fill `data/catalog/` with the real paint data: 2,837 paints from six brands, converted from the earlier Grimify dataset (DECISIONS 015) into the DATABASE §3 format, with every ID recorded in the published-ID ledger. Every later catalog feature (search, hue classification, equivalents, My Paints) needs this data, and the IDs it creates are permanent, so the conversion rules have to be right before anything ships.

## Context

ROADMAP NOW item 4. The catalog pipeline (v0.1.1) validates and compiles `data/catalog/<brandId>.json` files; today there are none and `published-ids.json` is `[]`.

Source: `../grimify/scripts/data/paints/*.json` at commit `c31eacb` of the earlier repo. Each paint is `{ id, name, hex, type, description, comparable }`. `type` holds the product line name ("Fanatic", "Model Color"). Provenance: `../grimify/scripts/data/REFERENCES.md` and `../grimify/docs/02-paint-data-search/scale75-paints.md` (Scale75 was sourced from PaintPad paint pages, with Scale75's site as fallback).

Decisions made in conversation on 2026-10-06:

- **Brands:** Citadel, The Army Painter, Vallejo, AK Interactive, Scale75 and Green Stuff World. Pro Acryl (a PRD launch brand) isn't in the dataset and becomes its own ROADMAP item, needing a data source.
- **Lines:** every line in the data except AK Abteilung 502 (42 oil paints, none of them PaintPad-sourced).
- **Types:** add an `acrylic` paint type for general-purpose acrylic lines, in the opaque type family.

What the audit of the source data found (2026-10-06):

- All 2,886 hex values are already uppercase `#RRGGBB`.
- 7 same-line duplicate pairs where the names slug alike and the hex is identical, e.g., `cit-4` "Bugmans Glow" and `cit-309` "Bugman's Glow" (both `#8C5144`).
- 4 AK names contain the HTML entity `&amp;`, and 3 contain non-ASCII characters ("Olivgrün Base").
- 334 `comparable` links (Citadel 167, Army Painter 107, Vallejo 60), all resolving, with no documented origin.
- `description` is filled for 255 paints (e.g., Army Painter "Matt Black" → "Black").
- There are no discontinued flags and no SKUs.

## Scope

**In scope**

- `acrylic` added to `PaintType` (schema and DATABASE §3)
- A one-time import script that converts the old files, with tests for its conversion rules
- Six brand files in `data/catalog/`, every ID recorded in `published-ids.json`
- `data/catalog/SOURCES.md` with provenance per brand
- Docs: DECISIONS 017 (acrylic type) and 018 (seed scope and conversion rules); PRD launch brands and product lines; DATABASE §3; ROADMAP (Pro Acryl item)

**Out of scope**

- Pro Acryl data (new ROADMAP item)
- AK Abteilung 502
- Hue family and value band (the hue-classification item)
- Importing old `comparable` links as `curatedEquivalents` (see risks)
- Old `description` text and `paint-groups/` gradient groups: no field for them in DATABASE §3
- SKUs: the old data has none
- Whether discontinued paints are hidden (PRD TBD; decided with the Paints tab); every imported paint is current
- Detecting metallic paints inside non-metallic lines (e.g., Citadel Leadbelcher in Base); see risks

## Conversion rules

**Brands**

| `id` | `name` | `manufacturer` | `website` |
|---|---|---|---|
| `citadel` | Citadel | Games Workshop | https://www.games-workshop.com |
| `army-painter` | The Army Painter | The Army Painter | https://thearmypainter.com |
| `vallejo` | Vallejo | Acrílicos Vallejo | https://acrylicosvallejo.com |
| `ak-interactive` | AK Interactive | AK Interactive | https://ak-interactive.com |
| `scale75` | Scale75 | Scale75 | https://scale75.com |
| `green-stuff-world` | Green Stuff World | Green Stuff World | https://www.greenstuffworld.com |

Websites come from the old `generate-seed.ts`.

**IDs**

- Line: `<brandId>-<slug(line name)>`, e.g., `scale75-drop-paint`, `vallejo-model-color`.
- Paint: `<lineId>-<slug(name)>`, e.g., `citadel-base-mephiston-red`.
- `slug`: decode HTML entities, strip accents (NFKD), lowercase, drop apostrophes, and turn every other run of non-alphanumerics into one `-`. "Bugman's Glow" → `bugmans-glow`; "Olivgrün Base" → `olivgrun-base`.
- Names keep their original text, with HTML entities decoded.

**Duplicates.** Two paints in the same line whose IDs collide are merged when their hex values match. The name with an apostrophe or hyphen wins ("Bugman's Glow" over "Bugmans Glow"), and the other spelling becomes an `alias`. A collision with different hex values stops the import, so nothing gets guessed.

**Line → `type` (`finish: "metallic"` wherever type is `metallic`)**

| Brand | Line → type |
|---|---|
| Citadel | Base → base · Layer → layer · Edge → layer · Shade → shade · Contrast → contrast · Dry → dry · Air → air · Spray → primer · Technical → technical |
| The Army Painter | Fanatic, Warpaints, Masterclass → acrylic · Fanatic Metallic, Warpaints Metallic → metallic · Fanatic Wash, Warpaints Wash → wash · Warpaints Air → air · Speedpaint → speedpaint, except "Speedpaint Medium" → technical (colorless medium, placeholder hex) |
| Vallejo | Model Color, Game Color, Mecha Color, Panzer Aces → acrylic · Model Air, Game Air → air · Game Color Metallic, Metal Color, Liquid Metal → metallic · Game Color Wash, Model Wash → wash · Game Color Ink → ink · Xpress Color → contrast · Surface Primer → primer |
| AK Interactive | 3rd Gen Acrylics, 3rd Gen Intense, Acrylics, Acrylics AFV, Acrylics Figure, Acrylics Naval → acrylic · 3rd Gen Metallic → metallic · Acrylics Air → air · Acrylics Primer → primer · Abteilung 502 → excluded |
| Scale75 | Scalecolor, Scalecolor Artist, Scalecolor Floww, Fantasy & Games, Warfront, Drop & Paint, FX Fluor → acrylic · Metal n' Alchemy → metallic · Inktensity → ink · Instant Colors → contrast · Prism Effect, Mystic Colors → other |
| Green Stuff World | Acrylic → acrylic · Metallic → metallic |

An unmapped line stops the import.

## Requirements

- **R1** — `PaintType` includes `acrylic`, and DATABASE §3 lists it in the `opaque` type family.
- **R2** — `data/catalog/` holds exactly six brand files (the brands above), with every line in the data except Abteilung 502, and paints converted by the rules above.
- **R3** — Every paint and line ID follows the ID rules. Same-line duplicates with matching hex are merged into one paint whose other spelling is an alias. No paint from the source is lost except the excluded line and merged duplicates.
- **R4** — Each paint's `type` and `finish` follow the line table.
- **R5** — Paint names have no HTML entities.
- **R6** — `published-ids.json` lists every paint ID, and `npm run catalog:validate` and `npm run build` pass.
- **R7** — `data/catalog/SOURCES.md` states each brand's hex source, coverage and known gaps, the source commit, and the PaintPad permission condition.

## Acceptance criteria

- **AC1** (R2, R3, R6) — Given the branch, when I run `npm run catalog:build`, then it reports 6 brands, 55 lines, and the paint count the import printed: 2,886 minus 42 Abteilung 502 minus 7 merged duplicates = 2,837.
- **AC2** (R3) — Given `data/catalog/citadel.json`, when I search for "bugmans", then there is one paint, `citadel-base-bugmans-glow`, named "Bugman's Glow" with alias "Bugmans Glow".
- **AC3** (R4) — Given the built `catalog.json`, when I group paints by brand and type, then Vallejo Model Color paints are `acrylic`, Xpress Color are `contrast`, and every `metallic` paint has `finish: "metallic"`.
- **AC4** (R5) — Given the brand files, when I search for `&amp;`, then there are no matches, and "OIF & OEF – US Vehicles Base Color" exists.
- **AC5** (R7) — Given `SOURCES.md`, when I read it, then each of the six brands has its source, coverage and gaps, and the Pro Acryl gap and PaintPad condition are stated.

## Test plan

The conversion is pure functions in `scripts/catalog/import-legacy.ts`, tested in the node environment like the other `scripts/catalog/` tests. The data itself is verified by `catalog:validate` (every rule from the pipeline item) plus the counts and spot checks in the acceptance criteria.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R3, R5 | `slugs names the way the ID rules describe` | `scripts/catalog/import-legacy.test.ts` | "Bugman's Glow" → `bugmans-glow`; "Olivgrün Base" → `olivgrun-base`; "Drop & Paint" → `drop-paint`; "OIF &amp; OEF – US" → `oif-oef-us` |
| T2 | R5 | `decodes HTML entities in names` | `scripts/catalog/import-legacy.test.ts` | `&amp;` → `&`; plain names unchanged |
| T3 | R2, R4 | `converts a brand with lines, types and finishes` | `scripts/catalog/import-legacy.test.ts` | A small Vallejo fixture (Model Color, Xpress Color, Metal Color) → three lines with expected IDs; types `acrylic`, `contrast`, `metallic`; `finish: "metallic"` only on the metal |
| T4 | R2 | `skips excluded lines` | `scripts/catalog/import-legacy.test.ts` | An AK fixture with an Abteilung 502 paint → no `ak-interactive-abteilung-502` line or paints |
| T5 | R3 | `merges same-line duplicates and keeps the other spelling as an alias` | `scripts/catalog/import-legacy.test.ts` | "Bugmans Glow" + "Bugman's Glow", same hex → one paint named "Bugman's Glow", `aliases: ["Bugmans Glow"]` |
| T6 | R3 | `stops on a collision with different hex values` | `scripts/catalog/import-legacy.test.ts` | Same slug, different hex → throws, naming both source IDs |
| T7 | R4 | `stops on an unmapped line` | `scripts/catalog/import-legacy.test.ts` | Line "Mystery Range" → throws, naming the brand and line |
| T8 | R4 | `maps Speedpaint Medium to technical` | `scripts/catalog/import-legacy.test.ts` | That one paint is `technical`; other Speedpaints are `speedpaint` |
| T9 | R1 | `accepts acrylic as a paint type` | `scripts/catalog/validate.test.ts` | A paint with `type: "acrylic"` validates |

**Not unit testable:** R6 and R7 are checked by running `catalog:validate` and `build` (R6) and reading `SOURCES.md` (R7), per AC1–AC5.

## Implementation plan

1. [x] Add `acrylic` to `PAINT_TYPES` and write T9. Touches `src/features/catalog/schema.ts`, `scripts/catalog/validate.test.ts`.
2. [x] Conversion logic with T1–T8: brand table, line → type map, exclusions, `slug`, entity decoding, duplicate merge. Pure `convertBrand(brandId, oldPaints) → BrandFile`, which throws on an unmapped line or a conflicting collision. Touches `scripts/catalog/import-legacy.ts`, `import-legacy.test.ts`.
3. [x] Import CLI `scripts/import-legacy-catalog.ts <old-data-dir>`. It reads `<dir>/paints/*.json` for the six brands, writes `data/catalog/<brandId>.json` (2-space JSON, then Prettier), and prints per-brand counts of paints read, excluded and merged. It refuses to overwrite an existing brand file, so it can't clobber edits. Touches `scripts/import-legacy-catalog.ts`.
4. [x] Run the import against `../grimify/scripts/data`, then `npm run catalog:ids` and `npm run catalog:validate`. Check the printed counts against AC1, and spot-check AC2–AC4. If any count is off, stop and report rather than adjusting the rules on the fly. Touches `data/catalog/*.json`, `data/catalog/published-ids.json`.
5. [x] Write `data/catalog/SOURCES.md` from REFERENCES.md and the Scale75 plan: per-brand source URLs, coverage, unmatched paints, the merged duplicates, the source commit `c31eacb`, and the PaintPad permission condition. Touches `data/catalog/SOURCES.md`.
6. [x] Docs. Touches the files listed.
    - **DECISIONS 017:** the `acrylic` paint type.
    - **DECISIONS 018:** seed scope (brands, lines, Abteilung 502 excluded, Pro Acryl deferred), the conversion rules, and dropping `comparable` and `description`.
    - **DATABASE §3:** `acrylic` in `PaintType` and in the `opaque` family.
    - **PRD:** launch brands (add Green Stuff World, Pro Acryl pending a source) and the product-lines TBD resolved.
    - **ROADMAP:** add "Pro Acryl catalog (needs a data source)" after Seed catalog.
7. [x] Verify: `npm run check`, `npm run build` (note the gzipped size against the 500 KB budget), `prettier --check .`. Touches nothing.

**Must not change:** the validator rules and the `catalog.json` shape from the pipeline item; any existing paint ID (there are none yet, so after this item every ID is permanent).

## Risks and open questions

- **One-way door: these IDs are permanent.** After release, a wrong slug can only be fixed with an alias, never a rename. The ID rules and the duplicate merge are the thing to review hardest.
- **Decided by default: `comparable` links are not imported.** Their origin isn't documented, and `curatedEquivalents` overrides computed matches, so importing 334 links of unknown quality would put guesses ahead of CIEDE2000. They stay in the old repo if you want them later.
- **Decided by default: the import script is committed.** It documents exactly how the data was converted, which matters if PaintPad says no and the data is re-sourced. It's dead code after this item and can be deleted later.
- **Guessed mappings to check:** Scale75 Mystic Colors and Prism Effect → `other` (I believe they're color-shift paints, but didn't verify); Drop & Paint and FX Fluor → `acrylic`; AK 3rd Gen Intense → `acrylic`; AP Masterclass → `acrylic`. Wrong types are fixable later (type isn't part of the ID), but they affect type filters and equivalents.
- **Known gap: metallics inside non-metallic lines.** Citadel Base and Layer, Vallejo Model Color and others include metallic paints (e.g., Leadbelcher) that the line table can't detect. They'll match as opaque until someone sets `type: "metallic"` by hand. A follow-up could tag them by name.
- **Risk: some "duplicates" may be real, separate products.** Vallejo Model Color's two "Yellow Green" (`val-26`, `val-136`) and two "Dark Blue Grey" share a hex in the old data, but Vallejo may sell two codes under one name. Merging loses one; the alias doesn't bring it back. Without codes in the data I can't tell.
- **Data quality inherited:** 119 paints across Vallejo, Army Painter, GSW and AK kept their original pre-PaintPad hex values (REFERENCES.md), so they're less trustworthy. Recorded in SOURCES.md.
- **Estimate:** 1–1.5 sessions, assuming the counts reconcile on the first run. Add half a session if the slugging turns up more collisions than the audit found.

## Progress log

- 2026-10-06 — Planned. Decided in conversation: six brands including Green Stuff World, Pro Acryl as its own item; all lines except AK Abteilung 502; new `acrylic` paint type.
- 2026-10-06 — Approved as written.
- 2026-10-06 — Implementation started in worktree `../grimify-v2-worktrees/task-seed-catalog` on `task/seed-catalog`.
- 2026-10-06 — Steps 1–7 done. The import printed exactly the planned counts (55 lines, 2,837 paints, 42 excluded, 7 merged) with no conflicting collisions. Spot checks passed:
  - AC2: one Bugman's Glow, with alias "Bugmans Glow".
  - AC3: 163 Model Color paints are `acrylic` and 83 Xpress Color are `contrast`; `metallic` type and finish always appear together.
  - AC4: no `&amp;` remains, and "OIF & OEF – US Vehicles Base Color" exists.
  - Longest ID is 85 characters. `catalog.json` is 85.9 KB gzipped.

  `npm run check` (53 tests in 9 files, catalog valid), `npm run build` and `prettier --check .` exit 0. Drift: none. The Vallejo Yellow Green and Dark Blue Grey merges produce no alias, because both entries had the same name. Brand files were formatted with Prettier after the import.
- 2026-10-06 — Staged. Version 0.1.2; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `task/seed-catalog`.
- 2026-10-06 — Released. Owner approved the review. Squash-merged 9 commits from `task/seed-catalog` into `main` as 0.1.2 (10fdb2f), tagged `v0.1.2`. Worktree and branch removed. The 2,837 paint IDs are now permanent.
