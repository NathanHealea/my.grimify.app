# Catalog: Paint Detail

> Covers the `/paints/$paintId` screen: paint facts, copy hex, and cross-brand equivalents.
> User journey: [UX_FLOWS.md Flow 3](../../UX_FLOWS.md). Rationale: [DECISIONS 008, 025](../../DECISIONS.md).

## TL;DR

- Shows **one paint**: swatch, name, brand · line · type · finish, aliases, **tap-to-copy hex**, and the Own/Want/Favorite toggles.
- **Equivalents** come from `findEquivalents()` in the [matching feature](../matching.md). They're grouped **by brand** and limited to the **same type family** by default.
- **"Show all types"** is stored in the URL as **`?types=all`**, written with `replace`, so Back still returns to the list.
- Equivalents the user **owns** show **"You own this"**.
- An unknown ID shows **"This paint isn't in the catalog"** with a link to `/paints`.

## Where the code lives

| Path | Role |
|---|---|
| `src/routes/paints/$paintId.tsx` | Route; validates `types` (`"all"` or absent); back link to `/paints` |
| `src/features/catalog/paint-detail.tsx` | `<PaintDetail>`, facts, equivalents list, `EquivalentRow` |
| `src/features/matching/find-equivalents.ts` | Builds the curated list and the per-brand groups |
| `src/features/matching/type-families.ts` | `typeFamily(paint)` |

## How it works

1. `<CatalogGate>` waits for the catalog, then finds the paint by ID.
2. The facts line joins brand, line and type. It adds `finish` only when the finish differs from the type.
3. **Copy hex** uses `navigator.clipboard.writeText`. On success the status reads "Copied #RRGGBB". On failure it reads "Couldn't copy; select the hex instead." The status region is `role="status"`.
4. `findEquivalents(paint, catalog, { allTypes })` returns `curated`, `groups` and `special`.
5. Rendering:
   - **Curated matches** (from `curatedEquivalents`) are listed first when present.
   - **Special** paints (technical, other) hide the "Show all types" toggle. With no curated matches, they show **"No automatic equivalents for technical and special paints."**
   - Each brand group shows its matches with labels. A group with `noCloseMatch` shows **"No close match in [Brand]"** and mutes the list (`data-muted`).
6. **Metallic, wash and tint families get a warning note**, because hex can't carry sheen or transparency (DECISIONS 008).

## Relations to other features

- **Matching** ([matching.md](../matching.md)): does all the equivalence work.
- **Collection** ([collection](../collection/)): `usePaintFlags()` drives "You own this". `<PaintToggles>` sits on the paint and on every equivalent row.
- **App shell** ([app-shell-ui.md](../app-shell-ui.md)): `staticData.back` gives the header's back link. `<PageTitle>` sets the large title and document title.
