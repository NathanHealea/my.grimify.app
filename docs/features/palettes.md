# Palettes

> Covers the Palettes tab (`/palettes` and `/palettes/$paletteId`), and adding paints from paint detail and from Select mode in Paints and My Paints.
> User journey: [UX_FLOWS.md Flow 10](../UX_FLOWS.md). Storage and rules: DATABASE, API, DECISIONS 047–051.

## TL;DR

- A signed-in user keeps **named palettes** of catalog paints. **Online only**: no outbox and no device copy (DECISIONS 047).
- **One Convex document per palette** in `palettes`: `name`, `paintIds` (the main list, in order) and `groups` (empty until the groups story). A palette stores **paint IDs only**, never hex or names (DECISIONS 048).
- **Caps enforced so far**: 50 palettes per user, names of 1–60 characters after trimming, and **200 paints per palette** (`PALETTE_FULL`). The group cap lands with the groups story.
- **Another user's palette looks exactly like a missing one**: `get` returns `null`; every mutation throws `NOT_FOUND`.
- **Adding** goes through one picker sheet, `<AddToPaletteSheet>`, opened from paint detail or from Select mode's bar. New paints go to the end, in order; paints already there are skipped (DECISIONS 051).
- **Removing** is a ✕ button on each paint of the palette screen. No confirmation; it also removes the paint from every group.

## Where the code lives

| Path | Role |
|---|---|
| `convex/palettes.ts` | `listMine`, `get`, `create`, `rename`, `remove`, `addPaints`, `removePaint` |
| `convex/userPaints.ts` | Exports `PAINT_ID`, the paint ID shape `addPaints` checks |
| `convex/schema.ts` | `palettes` table, index `by_userId` |
| `convex/users.ts` | `deleteAccount` also deletes the caller's palettes |
| `src/routes/palettes/index.tsx` | Route `/palettes/`, title "Palettes" |
| `src/routes/palettes/$paletteId.tsx` | Route `/palettes/$paletteId`, back to Palettes |
| `src/features/palettes/palettes-screen.tsx` | `<PalettesScreen>`, plus the shared signed-out and loading states |
| `src/features/palettes/palette-detail.tsx` | `<PaletteDetail>`: main list with Remove buttons, actions, rename and delete sheets |
| `src/features/palettes/palette-name-sheet.tsx` | `<PaletteNameSheet>` for create and rename; exports `OFFLINE_EDIT_NOTE` |
| `src/features/palettes/add-to-palette-sheet.tsx` | `<AddToPaletteSheet>`: the picker; adds `paintIds` to a chosen or new palette |
| `src/features/catalog/paint-detail.tsx` | `AddToPalette`: the "Add to palette" button on a paint's page |
| `src/features/catalog/paints-screen.tsx` | Select mode: the Select button and the ticked IDs |
| `src/features/catalog/selection-bar.tsx` | `<SelectionBar>`: "n selected", Add to palette, Done |
| `src/components/paint-row.tsx` | `selection` prop: the row as a checkbox label |
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
| `addPaints({ paletteId, paintIds })` | `{ added }`: how many were new | `PALETTE_FULL`, `INVALID_PAINT_ID`, `NOT_FOUND` |
| `removePaint({ paletteId, paintId })` | `null` | `NOT_FOUND` |

**`get` takes a plain string**, not `v.id("palettes")`, and normalizes it with `ctx.db.normalizeId`. The ID comes from the URL, so a mangled one shows "Palette not found" instead of failing argument validation.

**`addPaints` checks in this order.** More than 200 IDs → `PALETTE_FULL`. Any ID not matching `PAINT_ID` (`/^[a-z0-9-]{3,100}$/`) → `INVALID_PAINT_ID`. Then the owner check (`NOT_FOUND`). It builds `[...new Set([...palette.paintIds, ...paintIds])]`, so existing paints keep their place, new ones follow in the order given, and a repeat within the call counts once. Over 200 → `PALETTE_FULL`. Nothing is written on any error. **IDs aren't checked against the catalog**, the same as `userPaints.set` (DECISIONS 051).

**`removePaint` filters the paint out of `paintIds` and out of every group's `paintIds`**, so a paint never stays in a group after leaving the main list. A paint that isn't there leaves the lists as they were.

`updatedAt` is **server time** (`Date.now()`), set on create and rename, and on `addPaints` and `removePaint` only when they changed the paints. Concurrent edits are last write wins on the document (DECISIONS 049).

## Screens

**List (`/palettes`).** Signed out: "Sign in to keep color palettes on any device." and a Sign in button (offline: "Signing in needs an internet connection."). While the query is pending: "Loading your palettes…", or "Palettes need an internet connection." offline, because Convex keeps results only in memory. Each row links to the palette and shows its name, "n paints" and up to five swatches. **New palette** opens `<PaletteNameSheet>`; on success it opens the new palette.

**Detail (`/palettes/$paletteId`).** The `<h1>` is the palette name (`<PageTitle>`). The main list sits inside `<CatalogGate>` and shows each paint's swatch, name and brand, linking to paint detail. **A paint ID the catalog doesn't have shows "Unknown paint"** with a neutral dashed swatch. The **Palette actions** button opens a sheet with Rename and Delete palette. Delete asks for confirmation, then returns to `/palettes` with a "Palette deleted" toast.

**Remove.** Each row, known or unknown, ends with a ghost ✕ icon button named **"Remove <name> from palette"** ("Remove unknown paint from palette" for an unknown paint). A tap calls `removePaint` right away, with **no confirmation** (DECISIONS 051). Success toasts **"Removed <name>"**; the Convex query then drops the row. Failure toasts **"Couldn't remove <name>. Check your connection and try again."** and the row stays.

**Picker (`<AddToPaletteSheet>`).** Props: `paintIds`, `open`, `onOpenChange`, optional `onAdded` and `returnFocus`. It runs `listMine` only while open, and lists each palette as a button with its name and "n paints", then **New palette**. Choosing a palette calls `addPaints`, closes the sheet and toasts from `added`: **"Added to X"** (1), **"Added n paints to X"** (n), **"Already in X"** (0). `PALETTE_FULL` → **"This palette is full (200 paints)"** in the sheet's `role="alert"` region, and the sheet stays open. Any other error → **"Couldn't add to the palette. Check your connection and try again."** While an add is in flight online, the buttons are disabled and the sheet won't close. **New palette** closes the picker and opens `<PaletteNameSheet>`; Save runs `create`, then `addPaints` with the new ID, then the same toast. Focus returns to `returnFocus` when the sheets close.

**Paint detail.** "Add to palette" (outline, `SwatchBook` icon) sits under `<PaintToggles>`. Signed in it opens the picker with `[paint.id]`. **Signed out it opens the app-wide sign-in sheet (`useSignIn`) and doesn't add afterwards.** It's disabled until Clerk has loaded, so a signed-in user's early tap can't open sign-in.

**Select mode (Paints and My Paints).** `<PaintsScreen>` serves both, so both get it. Signed in, a **Select** button sits beside the result count. State is `selected: string[] | null` in `PaintsSearch` (`null` = not selecting), so a search or filter change keeps it and leaving the screen drops it. While selecting, each `<PaintRow>` gets `selection` instead of a link and toggles: a native checkbox **"Select <name>"**, the whole row its label. Ticks are kept in tick order, which is the order `addPaints` receives. At **200** (`MAX_SELECTED`, matching the server cap) unticked boxes are disabled. `<SelectionBar>` shows **"n selected"** (`role="status"`), **Add to palette** (disabled at 0) and **Done**; it opens the picker with the ticked IDs, and a successful add or Done sets `selected` back to `null`. Focus moves to the first checkbox on Select and back to Select when the mode ends. The screen sets `data-selecting` for extra bottom padding so the bar doesn't cover the last row.

**Offline.** Loaded data stays on screen. New palette, Palette actions and every Remove button are disabled, and a `role="status"` region says **"Connect to the internet to edit palettes."** (`OFFLINE_EDIT_NOTE`). The region stays mounted and empties when the connection returns. Paint detail's Add to palette, the selection bar's Add to palette and the picker's buttons are disabled too, each with the same note. Select mode still works offline; only the add waits.

**Name sheet.** It checks names the way the server does: blank → "Give the palette a name", over 60 characters → "Use 60 characters or fewer". Server codes become messages: `PALETTE_LIMIT` → "You can have up to 50 palettes". The error is a `role="alert"` tied to the field by `aria-describedby`. Focus returns to the button that opened the sheet.

## Relations to other features

- **Catalog** ([catalog/data-pipeline.md](catalog/data-pipeline.md)): paint names, brands and hex come from `useCatalog()` and `<CatalogGate>`. Adding starts on [paint detail](catalog/paint-detail.md) and in Select mode on the [search screen](catalog/search-and-filters.md).
- **Auth** ([auth-account.md](auth-account.md)): Clerk user for the signed-out state and for showing Select; `useSignIn()` for Add to palette signed out; `deleteAccount` removes palettes.
- **App shell** ([app-shell-ui.md](app-shell-ui.md)): the Palettes tab and the back button.
- **PWA** ([pwa.md](pwa.md)): `useOnlineStatus()` drives the offline states.
