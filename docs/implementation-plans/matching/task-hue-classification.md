---
type: task
slug: hue-classification
status: released
branch: task/hue-classification
worktree_path: ../grimify-v2-worktrees/task-hue-classification
created: 2026-10-06
approved: 2026-10-06
version: 0.1.3
tag: v0.1.3
merge_commit: 54f0425 (squash of task/hue-classification)
---

# Hue-family classification

## Summary

Give every paint in `catalog.json` a hue family (one of the 12 artist's-wheel hues or neutral) and a value band (light, mid, dark), computed from its hex at build time with `hueOverride` winning (DECISIONS 009). The Paints tab's hue search, hue dots and light-to-dark sorting all read these fields, so this item comes before it.

## Context

ROADMAP NOW had "Paints tab" before "Hue-family classification". The owner agreed on 2026-10-06 to swap them, so the Paints tab ships with hue search on day one instead of needing a second pass.

DATABASE §3 fixes the method: convert hex to OKLCh; chroma below a threshold → `neutral`; otherwise map the hue angle to one of 12 wheel segments, whose boundaries are documented constants; `ValueBand` from lightness; `hueOverride` wins. The code lives in `src/features/matching/classify-hue.ts` (DATABASE §3, AGENTS: matching stays client-side and pure). The constants were never chosen. This plan proposes them, derived from the 2,837-paint catalog on 2026-10-06.

The pipeline compiles in `scripts/catalog/compile.ts`, which Node runs without Vite. A `src/` module the script imports must use relative imports; type-only imports are erased by Node's type stripping, so they need no `.ts` extension.

## Proposed constants

**Neutral:** OKLCh chroma `C < 0.03`.

- 728 paints (26%) come out neutral.
- 82% of paints whose name says grey, black, white or silver (and no color word) fall under 0.03.
- The grey-named paints above it are visibly tinted, e.g., "Rock Grey" `#C1B897`, "German Field Grey" `#423E23`, so they're classified by their tint.
- At 0.04, 122 of 384 green-named paints would turn neutral, so 0.03 is the better trade.

**Hue segments (OKLCh hue angle, start inclusive):**

| Family | From | Center | Reference |
|---|---|---|---|
| red | 7.5° | 25° | `#FF0000` = 29°; Mephiston Red 29° |
| red-orange | 32.5° | 40° | Troll Slayer Orange 43° |
| orange | 47.5° | 55° | `#FF8000` = 53° |
| yellow-orange | 65° | 75° | Averland Sunset 83° |
| yellow | 87.5° | 100° | Yriel Yellow 96°; `#FFFF00` = 110° |
| yellow-green | 112.5° | 125° | Death Guard Green 116° |
| green | 137.5° | 150° | `#00A651` = 151°; Caliban Green 155° |
| blue-green | 170° | 190° | `#00FFFF` = 195°; Sotek Green 210° |
| blue | 220° | 250° | `#0000FF` = 264°; Macragge Blue 262° |
| blue-violet | 265° | 280° | Ultramarine paints |
| violet | 295° | 305° | Naggaroth Night 305°; Xereus Purple 315° |
| red-violet | 325° | 345° | `#FF00FF` = 328°; Screamer Pink 4° (wraps to red at 7.5°) |

The artist's wheel gives half its circle to red through yellow, but OKLCh fits those hues into about 80°, so the warm segments are narrow and the cool ones wide. Boundaries sit between the centers. Applied to the catalog:

| Family | Paints | Family | Paints |
|---|---|---|---|
| neutral | 728 | green | 135 |
| yellow | 327 | blue-green | 118 |
| yellow-orange | 319 | blue | 232 |
| red | 236 | blue-violet | 58 |
| orange | 208 | violet | 52 |
| yellow-green | 169 | red-violet | 99 |
| red-orange | 156 | | |

**Value band (OKLCh lightness):** `L < 0.40` → dark, `L ≥ 0.75` → light, otherwise mid. That gives 598 dark, 1,612 mid and 627 light. Mephiston Red (0.44) is mid, Macragge Blue (0.36) is dark, and Ushabti Bone (0.80) is light.

## Scope

**In scope**

- `classifyHue(hex)` and `classifyValue(hex)` in `src/features/matching/classify-hue.ts`, with the constants above as named, commented exports
- `VALUE_BANDS` and `ValueBand` in the schema; `hue` and `value` on `CatalogPaint`
- The compiler adds `hue` (the `hueOverride` when present) and `value` to every paint
- DATABASE §3 records the constants; ROADMAP swaps the two items

**Out of scope**

- Hue search, hue dots, light-to-dark sorting (Paints tab)
- Setting `hueOverride` on any paint. Misfits get fixed one at a time as they're noticed; the field already validates.
- A "brown" search alias (PRD open question; Paints tab)
- Fixing suspicious source hex values (e.g., Mournfang Brown `#681409` reads as dark red)

## Requirements

- **R1** — A color with OKLCh chroma below 0.03 is `neutral`; at or above it, the hue angle picks the family from the segment table, including the wrap from red-violet back to red at 7.5°.
- **R2** — Value band: `dark` below L 0.40, `light` at L 0.75 or above, otherwise `mid`.
- **R3** — Every paint in `catalog.json` has `hue` and `value`. `hue` equals `hueOverride` when the source sets one, otherwise the computed family. `value` is always computed.
- **R4** — Classification is pure and deterministic: the same hex gives the same result, with no I/O, and it runs both in the build script and in the browser.

## Acceptance criteria

- **AC1** (R1, R3) — Given the built catalog, when I look up `citadel-base-mephiston-red`, `citadel-layer-yriel-yellow`, `citadel-base-macragge-blue` and `citadel-base-mechanicus-standard-grey`, then their `hue` values are red, yellow, blue and neutral.
- **AC2** (R3) — Given a scratch `hueOverride: "orange"` on a red paint, when I rebuild, then that paint's `hue` is orange; after removing it, it's red again.
- **AC3** (R1, R2) — Given the built catalog, when I count paints per hue and value, then the counts match the tables above.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `classifies reference colors into their families` | `src/features/matching/classify-hue.test.ts` | `#FF0000` red, `#FF8000` orange, `#FFFF00` yellow, `#00A651` green, `#00FFFF` blue-green, `#0000FF` blue, `#FF00FF` red-violet; Citadel examples from the table land where the table says |
| T2 | R1 | `treats low-chroma colors as neutral` | `src/features/matching/classify-hue.test.ts` | `#000000`, `#FFFFFF`, `#454F50` (C 0.013) → neutral; `#4E3433` Rhinox Hide (C 0.038) → red |
| T3 | R1 | `wraps red-violet back to red` | `src/features/matching/classify-hue.test.ts` | Screamer Pink `#821A41` (h ≈ 4°) → red-violet; a hue just above 7.5° → red. Boundaries are tested from OKLCh inputs so the edges are exact |
| T4 | R1 | `uses start-inclusive segment boundaries` | `src/features/matching/classify-hue.test.ts` | For each boundary, an OKLCh color at the boundary gets the next family and one just below gets the previous one |
| T5 | R2 | `assigns value bands at the lightness cut points` | `src/features/matching/classify-hue.test.ts` | L 0.399 → dark, 0.40 → mid, 0.749 → mid, 0.75 → light; `#000000` dark, `#FFFFFF` light |
| T6 | R3 | `adds hue and value, preferring hueOverride` | `scripts/catalog/compile.test.ts` | A red paint gets `hue: "red"` and a value; the same paint with `hueOverride: "orange"` gets `hue: "orange"` |

**Not unit testable:** none. R4 is covered by the tests importing the module directly and by the build script using the same function. AC1–AC3 are checked against the real catalog.

## Implementation plan

1. [x] Schema: add `VALUE_BANDS` and `ValueBand`, and `hue: HueFamily; value: ValueBand` on `CatalogPaint`. Touches `src/features/catalog/schema.ts`.
2. [x] Classifier with T1–T5: `classifyHue(hex)` and `classifyValue(hex)`, plus internal OKLCh variants for exact boundary tests. Constants are exported, with a one-line note on how they were derived. Imports `culori` and type-only schema types, so Node can load it. Touches `src/features/matching/classify-hue.ts`, `classify-hue.test.ts`.
3. [x] Compiler with T6: `hue: paint.hueOverride ?? classifyHue(hex)`, `value: classifyValue(hex)`. Touches `scripts/catalog/compile.ts`, `compile.test.ts`.
4. [x] Docs: DATABASE §3 records the constants and the distribution; ROADMAP moves "Hue-family classification" above "Paints tab". Touches `docs/DATABASE.md`, `docs/ROADMAP.md`.
5. [x] Verify: `npm run check`, `npm run build`, `prettier --check .`, AC1–AC3 against the real catalog (AC2 with a scratch override, removed afterwards). Touches nothing.

**Must not change:** paint IDs and source data; existing `catalog.json` fields.

## Risks and open questions

- **Judgment call: the constants.** They're tuned to this catalog and to familiar landmarks, not to a standard. Hue boundaries for an RYB-style wheel have no single right answer. Changing them later only changes `catalog.json`, so this is a two-way door, but users will notice families shifting.
- **Known misfits at 0.03:** about 70 paints named "grey" are tinted enough to get a color family. Light warm greys (e.g., Silver Grey `#E2D7B7`) land in yellow. They can be fixed with `hueOverride`, or by tuning the threshold if it bothers people in testing.
- **Inherited data errors show up here:** a wrong hex (e.g., Mournfang Brown `#681409`, which reads as dark red) gets classified faithfully wrong. That's a data fix, not a classifier fix.
- **Browns** split mostly across orange, yellow-orange, red-orange and red, as DECISIONS 009 expects. Whether "brown" works as a search word is the PRD open question for the Paints tab.
- **Estimate:** 0.5 session.

## Progress log

- 2026-10-06 — Planned. Owner agreed to build this before the Paints tab. Constants derived from the seed catalog.
- 2026-10-06 — Approved as written, including the proposed constants.
- 2026-10-06 — Implementation started in worktree `../grimify-v2-worktrees/task-hue-classification` on `task/hue-classification`.
- 2026-10-06 — Steps 1–5 done. AC1: Mephiston Red red/mid, Yriel Yellow yellow/light, Macragge Blue blue/dark, Mechanicus Standard Grey neutral/mid. AC2: a scratch `hueOverride: "orange"` on Mephiston Red gave orange, and red again once removed. AC3: hue and value counts match the plan's tables exactly. `npm run check` (74 tests in 10 files, catalog valid), `npm run build` (91.4 KB gzipped) and `prettier --check .` exit 0. Drift: step 1 was split so every commit type-checks. `ValueBand` landed with the classifier, and `hue`/`value` on `CatalogPaint` landed with the compiler.
- 2026-10-06 — Staged. Version 0.1.3; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `task/hue-classification`.
- 2026-10-07 — Released. Owner approved the review. Squash-merged 6 commits from `task/hue-classification` into `main` as 0.1.3 (54f0425), tagged `v0.1.3`. Worktree and branch removed.
