# Catalog: Search and Filters

> Covers the Paints screen: the search box, chips, the Filters sheet, the result list and Select mode.
> User journey: [UX_FLOWS.md Flows 2 and 7](../../UX_FLOWS.md). Rationale: [DECISIONS 009, 021, 022, 023, 024, 031, 051](../../DECISIONS.md).

## TL;DR

- **One parser**: `parseQuery()` in `src/features/catalog/parse-query.ts` splits a query into **hex, brands, hues and free text**. Don't add another search path (AGENTS §3).
- **One search function**: `searchPaints()` in `search.ts` runs **all in the browser**. There are no backend calls.
- The query and filters live **in the URL** (`?q=`, `?brand=`, `?line=`, `?type=`, `?hue=`, `?show=`), so Back works and views are linkable.
- **Filters combine with the query**: OR within one filter, AND across filters and with the search box.
- **My Paints reuses this same screen**, scoped to the collection (DECISIONS 031).
- **Select mode** (signed in) swaps each row's toggles for a checkbox so several paints can go into a palette at once (DECISIONS 051).

## Where the code lives

| Path | Role |
|---|---|
| `src/routes/paints/index.tsx` | Route `/paints/`; validates search params with Zod; turns changes into navigation |
| `src/features/catalog/paints-screen.tsx` | `<PaintsScreen>`: search box, chips, hue dots, result list, paging |
| `src/features/catalog/paints-filters.tsx` | `<PaintsFilters>`: the Filters bottom sheet |
| `src/features/catalog/selection-store.ts` | `createSelection`: Select mode's ticked IDs in tick order, with `useTicked`, `useAtCap` and `useSelectedIds` |
| `src/features/catalog/selection-bar.tsx` | `<SelectionBar>`: Select mode's bar; opens the [palette picker](../palettes.md) |
| `src/features/catalog/parse-query.ts` | `parseQuery`, `removeToken`, `suggest`, `hueLabel` |
| `src/features/catalog/search.ts` | `createNameIndex` (Fuse.js), `searchPaints` |
| `src/features/catalog/filters.ts` | `Filters` type; URL parse and serialize; `normalizeFilters`; `scopeFor` |
| `src/components/search-chip.tsx`, `hue-dots.tsx`, `paint-row.tsx` | Shared UI; see [app-shell-ui.md](../app-shell-ui.md) |

## How a query is parsed

`parseQuery(query, brands)` lowercases the query and removes recognized parts in this order:

1. **Hex.** `#RRGGBB`, `#RGB`, or a bare 6-character form **that contains a digit**, so `facade` stays text. It's normalized to uppercase `#RRGGBB`. Only one hex is used.
2. **Brands.** It matches the brand name, the name without a leading "the ", and the ID with dashes as spaces. Longest phrase first.
3. **Hues.** It matches the 13 hue family names, including `red orange` for `red-orange`.
4. **Free text.** Whatever is left.

**Hue words only filter when nothing else is left.** `mephiston red` is a name search; `red` alone is a hue filter. This is because most paint names contain a color word.

Each recognized part becomes a `QueryToken` with its **character span** in the query. That span lets a chip's ✕ remove exactly its text (`removeToken`).

`suggest()` offers brand and hue completions for the **last word** once it is **2+ characters** and doesn't start with `#`.

## How results are ranked

`searchPaints(catalog, index, query, filters, scope)`:

1. Keeps paints inside `scope` (if given) that match the query's brands and hues and the sheet's filters.
2. With free text, candidates come from the **Fuse.js index**. The keys are `name` (weight 2) and `aliases` (weight 1), with `threshold: 0.35` and `ignoreLocation: true`.
3. Sorting:

| Query has | Sort |
|---|---|
| Hex | **Delta-E** distance to the hex, closest first, with a match label |
| Free text | Fuse relevance |
| Hue (typed or filtered) | Lightness (`lab[0]`), light to dark |
| Nothing | Name, then brand name (`Intl.Collator`, numeric) |

## How filters work

`Filters` is `{ brands, lines, types, hues, show? }`.

- **URL form**: comma-separated IDs, left out when empty. Example: `?q=red&brand=citadel,vallejo&type=metallic`.
- `parseFilterParams` drops unknown types and hues. `normalizeFilters` drops unknown brand and line IDs, and **drops lines whose brand isn't selected**.
- **A ticked line narrows only its own brand.** Other selected brands keep all their lines.
- **`show`** (`owned`, `wishlist`, `favorites`) is offered **only when signed in** and **not inside My Paints**. `scopeFor` narrows the scope to that part of the collection.

The sheet edits a **draft**. **"Show N paints" commits it**, and the count is live. Closing the sheet any other way **discards** the draft.

## Screen behavior

- Typing is **debounced 100 ms** and written with `replace: true`, so Back skips keystrokes. Chip taps and suggestions push a **new** history entry.
- Results render in **pages of 60**. An `IntersectionObserver` sentinel loads the next page.
- With an **empty query and no filters**, hue dots offer one-tap color browsing.
- A hex query shows the entered color's swatch above the list.
- No results shows **"No paints match"** and **Clear all**, which clears the query and every filter in one history entry.
- Each row carries the Own/Want/Favorite toggles from the [collection feature](../collection/).

## Select mode

- **Add to palette** (the button that starts Select mode) sits beside the result count, **only when signed in** (`useUser().isSignedIn`). Palettes need an account.
- Ticked IDs live in a **per-screen store** (`createSelection` in `selection-store.ts`), **not in React state or the URL**. The screen keeps only whether it's selecting. Each row reads its own tick with `useTicked` and the cap with `useAtCap`; the bar reads the IDs with `useSelectedIds`. So a tick re-renders one row and the bar, not the screen (#29). Search and filter changes keep the ticks; Done, a successful add and leaving the screen drop them.
- While selecting, `<PaintRow>` gets `selection` instead of the link and toggles: the row is a `<label>` for a checkbox named **"Select <name>"**, so a tap anywhere on it ticks.
- Order is **tick order**; that's the order paints are added. At **200** ticks (`MAX_SELECTED`, the palette cap) the unticked boxes are disabled.
- `<SelectionBar>` (a `section` named "Selection") shows **"n selected"** in a `status` region, **Add to palette** (disabled at 0 or offline, with the offline note) and **Done**. A successful add or Done turns the mode off.
- Focus goes to the first checkbox when the mode starts and back to the Add to palette button when it ends. That button is hidden when there are no results. The bar is rendered right after the count row so Tab reaches it before the list; it's `position: sticky` with `order: 1`, so it shows at the bottom and can't cover the last row.

## Change it safely

- **New search syntax** goes in `parseQuery`. Add a `QueryToken` kind so it gets a chip.
- **Select mode must leave the default row alone**: without `selection`, `<PaintRow>` renders exactly as before (link plus `actions`).
- **Rows subscribe narrowly.** A row hook must return a value that only its own paint's tick changes, such as a boolean. Reading the whole ID list in a row brings back a re-render of every row on every tick.
- **New filter**: add it to `Filters`, `FilterParams`, `parseFilterParams`, `serializeFilters`, `countActive` and `matchesFilters`, **and** to the route's Zod `searchSchema` in both `routes/paints/index.tsx` and `routes/my-paints.tsx`.
- Tests sit next to each file: `parse-query.test.ts`, `search.test.ts`, `filters.test.ts`, `paints-screen.test.tsx` (Select mode included), `selection-store.test.ts`, `paints-filters.test.tsx`.

## Relations to other features

- **Catalog pipeline** ([data-pipeline.md](data-pipeline.md)): `<CatalogGate>` supplies the catalog and the name index.
- **Matching** ([matching.md](../matching.md)): `deltaE`, `hexToLab` and `matchLabel` rank hex searches.
- **Collection** ([collection](../collection/)): `useCollection()` feeds the Show only filter. `useCanSavePaints()` decides whether it appears. My Paints passes `scope`.
- **Palettes** ([palettes.md](../palettes.md)): Select mode's bar opens `<AddToPaletteSheet>` with the ticked IDs.
