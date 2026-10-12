# Matching: Hue Classification and Equivalents

> Covers color math: hue families, value bands, Delta-E, match labels, and cross-brand equivalents.
> Schema and tuning data: [DATABASE.md §3](../DATABASE.md). Rationale: [DECISIONS 008, 009, 022, 025](../DECISIONS.md).

## TL;DR

- **All matching is client-side and pure** (AGENTS §3). There are no network calls and no React in `src/features/matching`.
- **Hue and value** are computed **at build time** from the hex, in **OKLCh**, and stored in `catalog.json`.
- **Equivalents** use **CIEDE2000 (ΔE00)** between the precomputed **D65 Lab** values.
- **Match labels**: ΔE **< 2 Very close**, **< 5 Close**, **< 10 Similar**.
- Paints match **only within their type family** unless the user picks "Show all types". **Special** paints (technical, other) get **curated equivalents only**.

## Where the code lives

| Path | Role | Runs |
|---|---|---|
| `src/features/matching/classify-hue.ts` | `classifyHue`, `classifyValue`, tuning constants | Build (Node) and tests |
| `src/features/matching/delta-e.ts` | `deltaE`, `hexToLab`, `matchLabel` | Browser |
| `src/features/matching/type-families.ts` | `TYPE_FAMILIES`, `typeFamily` | Browser |
| `src/features/matching/find-equivalents.ts` | `findEquivalents` | Browser |

`classify-hue.ts` also runs under plain Node in `scripts/build-catalog.ts`. **It may only use package imports and type-only imports.**

## Hue families and value bands

`classifyHue(hex)` converts the hex to **OKLCh** with culori:

1. If chroma **`C < 0.03`** (`NEUTRAL_CHROMA`), or there's no hue angle, the result is **`neutral`**.
2. Otherwise, the hue angle picks a segment from `HUE_SEGMENTS`. Each start is inclusive; angles **below 7.5° wrap to `red-violet`**.

| Start | Family | Start | Family |
|---|---|---|---|
| 7.5° | red | 137.5° | green |
| 32.5° | red-orange | 170° | blue-green |
| 47.5° | orange | 220° | blue |
| 65° | yellow-orange | 265° | blue-violet |
| 87.5° | yellow | 295° | violet |
| 112.5° | yellow-green | 325° | red-violet |

`classifyValue(hex)` uses OKLCh lightness: **`L < 0.40` dark**, **`L ≥ 0.75` light**, otherwise **mid**.

A paint's `hueOverride` in the source data **replaces `hue` only**. `value` is always computed.

## Delta-E and match labels

- `deltaE(lab1, lab2)` is culori's `differenceCiede2000` in `lab65`. This is the **same space** `catalog.json` stores in `lab`.
- `hexToLab(hex)` converts a typed hex for **hex search** ([search-and-filters.md](catalog/search-and-filters.md)).
- `matchLabel(distance)` returns `"Very close"` (< 2), `"Close"` (< 5), `"Similar"` (< 10), or `undefined`. ΔE00 ≈ 2 is the usual just-noticeable difference. Hex values are approximate, so the labels stay coarse (DECISIONS 022).

## Type families

| Family | Paint types |
|---|---|
| `opaque` | acrylic, base, layer, dry, air, primer |
| `tint` | contrast, speedpaint |
| `wash` | shade, wash, ink |
| `metallic` | metallic, **or any paint with `finish: "metallic"`** |
| `special` | technical, other |

`typeFamily(paint)` checks `finish === "metallic"` **before** the type lookup.

## How `findEquivalents` works

`findEquivalents(paint, catalog, { allTypes })` returns `{ special, curated, groups }`:

1. **`curated`** resolves `paint.curatedEquivalents` to paints. Unknown IDs are skipped.
2. If the paint's family is **`special`**, it returns right away: `special: true`, no groups.
3. For every paint from **another brand**:
   - Skip `special` candidates.
   - Skip other families **unless `allTypes`**.
   - Compute ΔE.
4. Per brand, sort by distance:
   - If any match is **< 10** (`CLOSE_MATCH_BELOW`), keep up to **3** (`MATCHES_PER_BRAND`), each labeled.
   - If none are, return **only the nearest paint, unlabeled**, with **`noCloseMatch: true`**.
5. Sort brand groups by their **closest match**.

The UI for this lives in [paint-detail.md](catalog/paint-detail.md).

## Change it safely

- **Changing a hue or value constant** only regenerates `catalog.json` (`npm run catalog:build`). Update the distribution notes in DATABASE.md §3.
- **Changing label thresholds or `MATCHES_PER_BRAND`** changes UX that DECISIONS 022 and 025 record. Add a decision entry; don't edit the constants quietly.
- Tests: `classify-hue.test.ts`, `delta-e.test.ts`, `find-equivalents.test.ts`, `type-families.test.ts`.

## Relations to other features

- **Catalog pipeline** ([data-pipeline.md](catalog/data-pipeline.md)): calls `classifyHue` and `classifyValue`, and writes `lab`.
- **Search** ([search-and-filters.md](catalog/search-and-filters.md)): uses `hexToLab`, `deltaE` and `matchLabel` for hex queries.
- **Paint detail** ([paint-detail.md](catalog/paint-detail.md)): renders `findEquivalents` and the family warning notes.
