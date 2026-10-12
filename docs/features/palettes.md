# Palettes

> Covers the Palettes tab: `/palettes` and `/palettes/$paletteId`.
> User journey: [UX_FLOWS.md Flow 10](../UX_FLOWS.md). Storage and rules: DATABASE, API, DECISIONS 047–050.

## TL;DR

- A signed-in user keeps **named palettes** of catalog paints. **Online only**: no outbox and no device copy (DECISIONS 047).
- **One Convex document per palette** in `palettes`: `name`, `paintIds` (the main list, in order) and `groups` (empty until the groups story). A palette stores **paint IDs only**, never hex or names (DECISIONS 048).
- **Caps enforced so far**: 50 palettes per user and names of 1–60 characters after trimming. The paint and group caps land with the stories that add paints and groups.
- **Another user's palette looks exactly like a missing one**: `get` returns `null`; `rename` and `remove` throw `NOT_FOUND`.
- Adding paints isn't built yet (story `palette-add-paint`), so every palette is empty for now.

## Where the code lives

| Path | Role |
|---|---|
| `convex/palettes.ts` | `listMine`, `get`, `create`, `rename`, `remove` |
| `convex/schema.ts` | `palettes` table, index `by_userId` |
| `convex/users.ts` | `deleteAccount` also deletes the caller's palettes |
| `src/routes/palettes/index.tsx` | Route `/palettes/`, title "Palettes" |
| `src/routes/palettes/$paletteId.tsx` | Route `/palettes/$paletteId`, back to Palettes |
| `src/features/palettes/palettes-screen.tsx` | `<PalettesScreen>`, plus the shared signed-out and loading states |
| `src/features/palettes/palette-detail.tsx` | `<PaletteDetail>`: main list, actions, rename and delete sheets |
| `src/features/palettes/palette-name-sheet.tsx` | `<PaletteNameSheet>` for create and rename |
| `src/features/palettes/use-paint-lookup.ts` | `usePaintLookup()`: paint ID → catalog paint for preview swatches |

## Convex functions

Every function starts with **`requireUser(ctx)`**, so signed-out calls throw `UNAUTHENTICATED`. The screens skip their queries until `useConvexAuth()` reports `isAuthenticated`.

| Function | Returns | Errors |
|---|---|---|
| `listMine({})` | `{ _id, name, paintCount, previewPaintIds, updatedAt }[]`, newest `updatedAt` first, at most 5 preview IDs | `UNAUTHENTICATED` |
| `get({ paletteId })` | The palette, or `null` when missing, someone else's, or not a palette ID | `UNAUTHENTICATED` |
| `create({ name })` | The new palette's ID | `PALETTE_NAME_INVALID`, `PALETTE_LIMIT` |
| `rename({ paletteId, name })` | `null` | `PALETTE_NAME_INVALID`, `NOT_FOUND` |
| `remove({ paletteId })` | `null` | `NOT_FOUND` |

**`get` takes a plain string**, not `v.id("palettes")`, and normalizes it with `ctx.db.normalizeId`. The ID comes from the URL, so a mangled one shows "Palette not found" instead of failing argument validation.

`updatedAt` is **server time** (`Date.now()`), set on create and rename. Concurrent edits are last write wins on the document (DECISIONS 049).

## Screens

**List (`/palettes`).** Signed out: "Sign in to keep color palettes on any device." and a Sign in button (offline: "Signing in needs an internet connection."). While the query is pending: "Loading your palettes…", or "Palettes need an internet connection." offline, because Convex keeps results only in memory. Each row links to the palette and shows its name, "n paints" and up to five swatches. **New palette** opens `<PaletteNameSheet>`; on success it opens the new palette.

**Detail (`/palettes/$paletteId`).** The `<h1>` is the palette name (`<PageTitle>`). The main list sits inside `<CatalogGate>` and shows each paint's swatch, name and brand, linking to paint detail. **A paint ID the catalog doesn't have shows "Unknown paint"** with a neutral dashed swatch. The **Palette actions** button opens a sheet with Rename and Delete palette. Delete asks for confirmation, then returns to `/palettes` with a "Palette deleted" toast.

**Offline.** Loaded data stays on screen. New palette and Palette actions are disabled, and a `role="status"` region says **"Connect to the internet to edit palettes."** The region stays mounted and empties when the connection returns.

**Name sheet.** It checks names the way the server does: blank → "Give the palette a name", over 60 characters → "Use 60 characters or fewer". Server codes become messages: `PALETTE_LIMIT` → "You can have up to 50 palettes". The error is a `role="alert"` tied to the field by `aria-describedby`. Focus returns to the button that opened the sheet.

## Relations to other features

- **Catalog** ([catalog/data-pipeline.md](catalog/data-pipeline.md)): paint names, brands and hex come from `useCatalog()` and `<CatalogGate>`.
- **Auth** ([auth-account.md](auth-account.md)): Clerk user for the signed-out state; `deleteAccount` removes palettes.
- **App shell** ([app-shell-ui.md](app-shell-ui.md)): the Palettes tab and the back button.
- **PWA** ([pwa.md](pwa.md)): `useOnlineStatus()` drives the offline states.
