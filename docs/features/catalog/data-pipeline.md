# Catalog: Data Pipeline

> Covers how paint data goes from `data/catalog/*.json` to the browser.
> Rules and rationale: [DATABASE.md §3](../../DATABASE.md), [DECISIONS 004, 015, 016, 018](../../DECISIONS.md).

## TL;DR

- The paint catalog is **JSON in Git**, not Convex. There is **one file per brand**: `data/catalog/<brandId>.json`.
- `scripts/build-catalog.ts` **validates** the files and **compiles** them into **`public/catalog.json`**.
- The build adds **`brandId`, `lab`, `hue`, `value` and `version`** to the output.
- **Paint IDs are permanent.** The ledger `data/catalog/published-ids.json` makes the build **fail** if an ID disappears.
- The browser **fetches `catalog.json` once per session**. The service worker **precaches** it, so the catalog works offline after one visit.

## Where the code lives

| Path | Role |
|---|---|
| `data/catalog/<brandId>.json` | Source data: one brand, its lines, its paints |
| `data/catalog/published-ids.json` | **Ledger** of every published paint ID |
| `data/catalog/SOURCES.md` | Where the hex values came from, by brand |
| `src/features/catalog/schema.ts` | **Zod schemas** and types; shared by the build script and the app |
| `scripts/build-catalog.ts` | CLI entry point: `--validate`, `--build`, `--record-ids` |
| `scripts/catalog/validate.ts` | Schema checks and cross-file checks |
| `scripts/catalog/compile.ts` | Adds computed fields, sorts, hashes the version |
| `scripts/catalog/ledger.ts` | `recordIds()`: adds IDs to the ledger, never removes any |
| `scripts/import-legacy-catalog.ts`, `scripts/catalog/import-legacy.ts` | One-time seed import from the earlier Grimify repo (DECISIONS 018) |
| `src/features/catalog/load-catalog.ts` | Browser fetch of `catalog.json` |
| `src/features/catalog/use-catalog.ts` | React hook: loading, error with retry, or ready with a search index |
| `src/features/catalog/catalog-gate.tsx` | Renders the loading or offline message until the catalog is ready |

`schema.ts` is imported by `scripts/build-catalog.ts` under plain Node. **It may only import packages**, not `@/` app modules.

## How it works

```text
data/catalog/*.json ──► validate ──► compile ──► public/catalog.json ──► dist/ ──► browser
        ▲                  │
published-ids.json ────────┘ (ledger checks)
```

### Validate

`validateCatalog()` in `scripts/catalog/validate.ts` parses **each brand, line and paint on its own**, so one bad paint doesn't hide the rest. It reports an error when:

- The file isn't valid JSON, or it doesn't match `{ brand, lines, paints }`.
- An item fails its Zod schema: a bad ID format, a blank name, or a `hex` that isn't `#RRGGBB` in **uppercase**.
- `brand.id` doesn't match the file name (`<brand.id>.json`).
- A line or paint ID doesn't start with `<brandId>-`.
- A brand, line or paint ID is **duplicated** across files.
- A paint's `lineId` isn't defined in the same file.
- A `curatedEquivalents` entry points to itself or to a paint that doesn't exist.
- A paint ID **isn't in the ledger** yet. Fix: `npm run catalog:ids`.
- A ledger ID **no longer exists**. Fix: restore the paint and set `discontinued: true`.

IDs are lowercase kebab-case ASCII, 3–100 characters, which is the same bound as the Convex `paintId` check.

### Compile

`compileCatalog()` in `scripts/catalog/compile.ts`:

1. Adds `brandId` to every line and paint, taken from the file.
2. Adds `lab`: **CIELAB, D65 white point** (culori `lab65`), rounded to 2 decimals.
3. Adds `hue`: `hueOverride` when set, otherwise `classifyHue(hex)`.
4. Adds `value`: always `classifyValue(hex)`.
5. Sorts brands, lines and paints **by ID**.
6. Sets `version` to the first 16 hex characters of a **SHA-256** over the sorted content.

The same data always produces the same file and the same `version`. Hue and value classification live in `src/features/matching/classify-hue.ts`; see the [matching doc](../matching.md).

### Load in the browser

1. `loadCatalog()` fetches `${BASE_URL}catalog.json` **once per session** and caches the promise.
2. A failed fetch is **forgotten**, so the next call retries.
3. `useCatalog()` returns `loading`, `error` (with `retry`), or `ready` with the catalog and a **Fuse.js name index**. The index is built once per catalog object and kept in a `WeakMap`.
4. `<CatalogGate>` shows "Downloading paint catalog…" while loading. On error it shows "Connect to the internet once to download the paint catalog." with a **Retry** button.

The service worker's `globPatterns` in `vite.config.ts` include `json`, which **precaches `catalog.json`**.

## Commands

```bash
npm run catalog:validate   # validate only; part of npm run check
npm run catalog:build      # validate, then write public/catalog.json; runs first in npm run build
npm run catalog:ids        # record new paint IDs in published-ids.json
```

`--build` prints the brand, line and paint counts and the **gzipped size**. Errors print as `data/catalog/<file> <path>: <message>`, and the script exits with code `1`.

## Add or change paints

1. Edit `data/catalog/<brandId>.json`.
2. For a new paint, use the ID format `<brandId>-<line-slug>-<name-slug>`.
3. To rename a paint, **keep its ID** and add the old name to `aliases`.
4. To retire a paint, **don't delete it**. Set `discontinued: true`.
5. To fix a misclassified hue, set `hueOverride`.
6. Record new IDs:

   ```bash
   npm run catalog:ids
   ```

7. Validate:

   ```bash
   npm run catalog:validate
   ```

## Relations to other features

- **Matching** ([matching.md](../matching.md)): the build calls `classifyHue` and `classifyValue`. The browser uses `lab` for Delta-E.
- **Search** ([search-and-filters.md](search-and-filters.md)): consumes `useCatalog()` through `<CatalogGate>`.
- **Collection** ([collection](../collection/)): the **paint ID is the only link** between the catalog and Convex user data.
- **PWA** ([pwa.md](../pwa.md)): the service worker precaches `catalog.json`.
