# Palettes

> Covers the Palettes tab (`/palettes` and `/palettes/$paletteId`) with its groups, and adding paints from paint detail and from Select mode in Paints and My Paints.
> User journey: [UX_FLOWS.md Flow 10](../UX_FLOWS.md). Storage and rules: DATABASE, API, DECISIONS 047–053.

## TL;DR

- A signed-in user keeps **named palettes** of catalog paints. **Online only**: no outbox and no device copy (DECISIONS 047).
- **One Convex document per palette** in `palettes`: `name`, `paintIds` (the main list, in order) and `groups` (`{ id, name, paintIds }[]`, in creation order). A palette stores **paint IDs only**, never hex or names (DECISIONS 048).
- **Caps**: 50 palettes per user, palette and group names of 1–60 characters after trimming, **200 paints per palette** (`PALETTE_FULL`) and **30 groups per palette** (`GROUP_LIMIT`). No cap per group.
- **Another user's palette looks exactly like a missing one**: `get` returns `null`; every mutation throws `NOT_FOUND`.
- **Adding** goes through one picker sheet, `<AddToPaletteSheet>`, opened from paint detail or from Select mode's bar. New paints go to the end, in order; paints already there are skipped (DECISIONS 051).
- **Removing** is a ✕ button on each paint of the palette screen. No confirmation; it also removes the paint from every group.
- **Groups** only point at paints in the main list. A paint can be in any number of groups, once per group. Group IDs are made on the server. Groups are edited through menus: a Groups checkbox sheet on main-list rows, an actions sheet on group rows, and Rename and Delete group on each heading (DECISIONS 052).
- **Arrange mode** reorders paints and groups and moves paints between lists by drag and drop (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0), with a Move sheet as the non-drag path. Moves are sent as one item and a position, and show at once through Convex optimistic updates (DECISIONS 053).

## Where the code lives

| Path | Role |
|---|---|
| `convex/palettes.ts` | `listMine`, `get`, `create`, `rename`, `remove`, `addPaints`, `removePaint`, and the group mutations `createGroup`, `renameGroup`, `removeGroup`, `addPaintToGroup`, `removePaintFromGroup`, `movePaintToGroup`, and the reorder mutations `movePaint`, `moveGroupPaint`, `moveGroup` |
| `convex/userPaints.ts` | Exports `PAINT_ID`, the paint ID shape the palette mutations check |
| `convex/schema.ts` | `palettes` table, index `by_userId` |
| `convex/users.ts` | `deleteAccount` also deletes the caller's palettes |
| `src/routes/palettes/index.tsx` | Route `/palettes/`, title "Palettes" |
| `src/routes/palettes/$paletteId.tsx` | Route `/palettes/$paletteId`, back to Palettes |
| `src/features/palettes/palettes-screen.tsx` | `<PalettesScreen>`, plus the shared signed-out and loading states |
| `src/features/palettes/palette-detail.tsx` | `<PaletteDetail>`: All paints list with Groups and Remove buttons, actions, rename and delete sheets |
| `src/features/palettes/palette-groups.tsx` | `<PaletteGroups>`: group sections, New group, inline rename, group actions and delete sheets |
| `src/features/palettes/group-membership-sheet.tsx` | `<GroupMembershipSheet>`: the Groups sheet, one checkbox per group for a main-list paint |
| `src/features/palettes/group-paint-actions-sheet.tsx` | `<GroupPaintActionsSheet>`: move, copy or remove a paint in a group |
| `src/features/palettes/palette-arrange.tsx` | `<PaletteArrange>` (the `DndContext`: sensors, collision detection, announcements, focus after a drop, the drag overlay and Move sheet), `usePaletteMoves`, `<SortableItem>`, `<DragHandle>`, `<MoveButton>` |
| `src/features/palettes/drop-plan.ts` | Pure: `planDrop` (drag → mutation), `applyPlan` and `optimisticMove` (the optimistic update), the announcement texts, `positionOf` |
| `src/features/palettes/drag-preview.tsx` | `<DragPreview>`: the glass preview under the pointer |
| `src/features/palettes/move-sheet.tsx` | `<MoveSheet>`: Move to top, up, down, to bottom |
| `src/features/palettes/palette-name-sheet.tsx` | `<PaletteNameSheet>` for creating and renaming palettes and creating groups (`kind`); exports `OFFLINE_EDIT_NOTE` |
| `src/features/palettes/add-to-palette-sheet.tsx` | `<AddToPaletteSheet>`: the picker; adds `paintIds` to a chosen or new palette |
| `src/features/catalog/paint-detail.tsx` | `AddToPalette`: the "Add to palette" button on a paint's page |
| `src/features/catalog/paints-screen.tsx` | Select mode: the Add to palette button beside the count and the ticked IDs |
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
| `removePaint({ paletteId, paintId })` | `null` | `INVALID_PAINT_ID`, `NOT_FOUND` |
| `createGroup({ paletteId, name })` | The new group's ID | `GROUP_NAME_INVALID`, `NOT_FOUND`, `GROUP_LIMIT` |
| `renameGroup({ paletteId, groupId, name })` | `null` | `GROUP_NAME_INVALID`, `NOT_FOUND`, `GROUP_NOT_FOUND` |
| `removeGroup({ paletteId, groupId })` | `null` | `NOT_FOUND`, `GROUP_NOT_FOUND` |
| `addPaintToGroup({ paletteId, groupId, paintId, toIndex? })` | `null` | `INVALID_PAINT_ID`, `INVALID_INDEX`, `NOT_FOUND`, `GROUP_NOT_FOUND`, `PAINT_NOT_IN_PALETTE` |
| `removePaintFromGroup({ paletteId, groupId, paintId })` | `null` | `INVALID_PAINT_ID`, `NOT_FOUND`, `GROUP_NOT_FOUND` |
| `movePaintToGroup({ paletteId, paintId, fromGroupId, toGroupId, toIndex? })` | `null` | `INVALID_PAINT_ID`, `INVALID_INDEX`, `NOT_FOUND`, `GROUP_NOT_FOUND` |
| `movePaint({ paletteId, paintId, toIndex })` | `null` | `INVALID_PAINT_ID`, `INVALID_INDEX`, `NOT_FOUND` |
| `moveGroupPaint({ paletteId, groupId, paintId, toIndex })` | `null` | `INVALID_PAINT_ID`, `INVALID_INDEX`, `NOT_FOUND`, `GROUP_NOT_FOUND` |
| `moveGroup({ paletteId, groupId, toIndex })` | `null` | `INVALID_INDEX`, `NOT_FOUND`, `GROUP_NOT_FOUND` |

**`get` takes a plain string**, not `v.id("palettes")`, and normalizes it with `ctx.db.normalizeId`. The ID comes from the URL, so a mangled one shows "Palette not found" instead of failing argument validation.

**`addPaints` checks in this order.** More than 200 IDs → `PALETTE_FULL`. Any ID not matching `PAINT_ID` (`/^[a-z0-9-]{3,100}$/`) → `INVALID_PAINT_ID`. Then the owner check (`NOT_FOUND`). It builds `[...new Set([...palette.paintIds, ...paintIds])]`, so existing paints keep their place, new ones follow in the order given, and a repeat within the call counts once. Over 200 → `PALETTE_FULL`. Nothing is written on any error. **IDs aren't checked against the catalog**, the same as `userPaints.set` (DECISIONS 051).

**`removePaint` filters the paint out of `paintIds` and out of every group's `paintIds`**, so a paint never stays in a group after leaving the main list. A paint that isn't there leaves the lists as they were.

**Group mutations check in this order:** the name (`GROUP_NAME_INVALID`, through the same `cleanName` as palettes) or the paint ID shape (`INVALID_PAINT_ID`), then the owner check (`NOT_FOUND`), then the group (`GROUP_NOT_FOUND`). `createGroup` then checks the 30-group cap. Duplicate group names are allowed.

**Group IDs are made on the server** by `newGroupId`: 8 base-36 characters from `Math.random`, which Convex seeds per function run, picked again if the palette already has that ID. They're unique within a palette, not across palettes.

**`addPaintToGroup` only takes main-list paints** (`PAINT_NOT_IN_PALETTE`) and appends to the end of the group; a paint already there is a no-op. **`removePaintFromGroup`** leaves the main list and other groups alone; a paint not in the group is a no-op. **`movePaintToGroup`** removes the paint from the source and appends it to the target in one write; if the target already holds it, it only leaves the source. A paint not in the source, or the same group for both, is a no-op. **`removeGroup`** drops the group and leaves `paintIds` alone.

`updatedAt` is **server time** (`Date.now()`), set on create, rename, `createGroup` and `removeGroup`, and on `renameGroup`, `addPaints`, `removePaint` and the three group paint mutations only when they changed something. Concurrent edits are last write wins on the document (DECISIONS 049).

## Screens

**List (`/palettes`).** Signed out: "Sign in to keep color palettes on any device." and a Sign in button (offline: "Signing in needs an internet connection."). While the query is pending: "Loading your palettes…", or "Palettes need an internet connection." offline, because Convex keeps results only in memory. Each row links to the palette and shows its name, "n paints" and up to five swatches. **New palette** opens `<PaletteNameSheet>`; on success it opens the new palette.

**Detail (`/palettes/$paletteId`).** The `<h1>` is the palette name (`<PageTitle>`). The main list sits inside `<CatalogGate>` in a section headed **"All paints"** (`<h2>`), followed by `<PaletteGroups>`. Each row shows the paint's swatch, name and brand, linking to paint detail. **A paint ID the catalog doesn't have shows "Unknown paint"** with a neutral dashed swatch. The **Palette actions** button opens a sheet with Rename and Delete palette. Delete asks for confirmation, then returns to `/palettes` with a "Palette deleted" toast.

**Remove.** Each row, known or unknown, ends with a ghost ✕ icon button named **"Remove <name> from palette"** ("Remove unknown paint from palette" for an unknown paint). A tap calls `removePaint` right away, with **no confirmation** (DECISIONS 051). Success toasts **"Removed <name>"**; the Convex query then drops the row, and focus moves to the next row's Remove button, the previous one at the end, or **Palette actions** once the list is empty. While its remove is in flight the button is `aria-disabled` and ignores taps; it stays focusable (a `disabled` button drops focus, which a failure would strand). Failure toasts **"Couldn't remove <name>. Check your connection and try again."** and the row stays.

**Groups (`<PaletteGroups>`).** Each group is a `<section>` labelled by its `<h2>` name, in creation order, listing its paints (swatch, name, brand) or **"No paints in this group yet"**. Group rows don't link to paint detail; the main list keeps the link (DECISIONS 052). A paint the catalog doesn't have shows "Unknown paint" here too. After the groups, **New group** (outline) opens `<PaletteNameSheet kind="group">` titled "New group" with a **"Group name"** field and Create; success runs `createGroup` and focuses the new group's heading once Convex renders it (Convex doesn't promise that before the mutation resolves). Each heading has a ghost icon button **"Actions for group <name>"** opening a sheet titled with the group's name: **Rename** and **Delete group**.

**Rename (inline).** Rename closes the sheet and swaps the heading for a form: a "Group name" field (focused, filled with the current name), Cancel and Save. Enter saves through `renameGroup`; Escape or Cancel leaves the name as it was. Either way focus goes back to the group's actions button. Blank → "Give the group a name", over 60 characters → "Use 60 characters or fewer"; server `GROUP_NAME_INVALID` → "Give the group a name", anything else → **"Couldn't rename the group. Check your connection and try again."** The form stays open on an error. While the save is in flight online, Cancel is disabled and Escape does nothing, so a cancelled rename can't land afterwards.

**Delete group.** A sheet asks **"Delete group "<name>"?"** with "Its paints stay in the palette.", Cancel and Delete. Delete runs `removeGroup`, toasts **"Deleted group <name>"**, and focus moves to the next group's actions button, or New group when it was the last. Failure → "Couldn't delete the group. Check your connection and try again." in the sheet, which stays open. While the delete is in flight online, the sheet won't close.

**Groups sheet (`<GroupMembershipSheet>`).** When the palette has at least one group, each main-list row gets a ghost icon button (`Layers` icon) named **"Groups for <name>"** before Remove. It opens a sheet titled "Groups for <name>" with one checkbox per group, ticked where the paint is. Ticking runs `addPaintToGroup` and unticking runs `removePaintFromGroup`, saved at once. There's no toast; the checkbox is the feedback. While a save is in flight the box shows the asked-for state and is `aria-disabled` (not `disabled`, which would drop focus). A failure → **"Couldn't update <group>. Check your connection and try again."** and the box goes back to the palette's state. **Done** closes the sheet and focus returns to the row's Groups button. While a save is in flight online, Done is disabled and Escape doesn't close the sheet, so a failure is never hidden.

**Group row actions (`<GroupPaintActionsSheet>`).** Each paint in a group ends with a ghost icon button **"Actions for <name> in <group>"**. Its sheet, titled "<name> in <group>", offers **Move to group…**, **Copy to group…** (both disabled when the palette has no other group) and **Remove from group**. Move and Copy switch the sheet to "Move <name> to" or "Copy <name> to", listing the other groups as buttons, with **Back**. A group that already holds the paint is disabled and reads "<group> (already in it)". Move runs `movePaintToGroup` and toasts **"Moved to <group>"**; Copy runs `addPaintToGroup` and toasts **"Copied to <group>"**; Remove runs `removePaintFromGroup` and toasts **"Removed from <group>"**. The sheet closes on success. `PAINT_NOT_IN_PALETTE` → **"This paint is no longer in the palette."**; anything else → "Couldn't move <name>. Check your connection and try again." (or copy, remove). While a save is in flight online, the sheet won't close. On close, focus returns to the row's actions button; after a move or remove takes the row away, it goes to the next row in the group, the previous one at the end, then the group's actions button, then New group.

**Moves by position.** `movePaint`, `moveGroupPaint` and `moveGroup` take one item and `toIndex`, its index in the resulting list: a whole number ≥ 0 (`INVALID_INDEX` otherwise), clamped to the end. A missing paint, or a move to where it already is, writes nothing. `addPaintToGroup` and `movePaintToGroup` take an optional `toIndex` for drops on a spot; without it they append as before.

**Arrange mode.** "Arrange" sits in the "All paints" heading row whenever there's something to arrange (any paint, or two groups), and becomes "Done". `arranging` lives in `PaletteContent`; `PaintList` and `<PaletteGroups>` render sortable rows instead of their usual ones (the groups render a separate tree, so their sheets and New group aren't mounted). One `<PaletteArrange>` (`DndContext`) wraps both sections, always mounted, with its live region portalled to `document.body`. Sortable IDs keep a paint in two lists apart: `main:<paintId>`, `group:<groupId>:<paintId>`, `heading:<groupId>`, plus a `zone:<groupId>` droppable around each group. Sensors: mouse after 5px, touch after a 150ms hold (5px tolerance), keyboard with `sortableKeyboardCoordinates`. While a group is dragged, `<PaletteGroups>` reads the active item from `useDndContext()` and renders each group's heading only (no paint rows or empty text): `verticalListSortingStrategy` shifts by the dragged item's height, so full-height groups left a group-sized gap. dnd-kit re-measures the droppables once the drag initializes, after the collapse has rendered. The collapse can shorten the page enough to clamp the scroll; dnd-kit's one-time scroll compensation then can't put the heading back, and the preview starts where the heading moved to. For mouse and touch group drags `onDragStart` records the pointer's offset in the group before the collapse, and a `DragOverlay` modifier shifts the preview by a constant, fixed at the first measure, so that point stays under the pointer (#23). Drop targets follow because dnd-kit measures the overlay, shift included, for its collision box; on `DndContext` the shift would be counted twice. If focus was on a group paint row's Move or Drag button, which a pointer press leaves in place in Safari, `onDragStart` moves it to the dragged group's handle so the collapse doesn't drop it to the body (#22). Collision detection lets a group only land on group headings, and a paint prefer the row under the pointer, then a group's zone, then the nearest item. `planDrop` turns a drop into one mutation (the table in DECISIONS 053); `usePaletteMoves` runs it with an optimistic update that rewrites the cached `palettes.get` through `applyPlan`, so Convex rolls it back on failure, and toasts "Couldn't move <name>…". A drop while offline does nothing. dnd-kit's focus restore is off; after a keyboard drop or cancel, focus goes to the handle (`data-drag-handle`) of the item in its new place. The **Move sheet** (`<MoveSheet>`) opens from each row's or heading's Move button, shows "Position n of m", and calls the same mutations; focus returns to the Move button (`data-move-button`). Announcements come from `announcePickUp`, `announceOver`, `announceDrop` and `announceCancel` in `drop-plan.ts`.

**Picker (`<AddToPaletteSheet>`).** Props: `paintIds`, `open`, `onOpenChange`, optional `onAdded` and `returnFocus`. It runs `listMine` only while open, and lists each palette as a button with its name and "n paints", then **New palette**. Choosing a palette calls `addPaints`, closes the sheet and toasts from `added`: **"Added to X"** (1), **"Added n paints to X"** (n), **"Already in X"** (0). `PALETTE_FULL` → **"This palette is full (200 paints)"** in the sheet's `role="alert"` region, and the sheet stays open. Any other error → **"Couldn't add to the palette. Check your connection and try again."** While an add is in flight online, the buttons are disabled and the sheet won't close. **New palette** closes the picker and opens `<PaletteNameSheet>`; Save runs `create`, then `addPaints` with the new ID, then the same toast. Focus returns to `returnFocus` when the sheets close.

**Paint detail.** "Add to palette" (outline, `SwatchBook` icon) sits under `<PaintToggles>`. Signed in it opens the picker with `[paint.id]`. **Signed out it opens the app-wide sign-in sheet (`useSignIn`) and doesn't add afterwards.** It's disabled until Clerk has loaded, so a signed-in user's early tap can't open sign-in.

**Select mode (Paints and My Paints).** `<PaintsScreen>` serves both, so both get it. Signed in, an **Add to palette** button sits beside the result count; it's labelled for the goal rather than "Select", which testers found unclear. It's hidden when there are no results. State is `selected: string[] | null` in `PaintsSearch` (`null` = not selecting), so a search or filter change keeps it and leaving the screen drops it. While selecting, each `<PaintRow>` gets `selection` instead of a link and toggles: a native checkbox **"Select <name>"**, the whole row its label. Ticks are kept in tick order, which is the order `addPaints` receives. At **200** (`MAX_SELECTED`, matching the server cap) unticked boxes are disabled. `<SelectionBar>` shows **"n selected"** (`role="status"`), **Add to palette** (disabled at 0) and **Done**; it opens the picker with the ticked IDs, and a successful add or Done sets `selected` back to `null`. Focus moves to the first checkbox when the mode starts and back to that button when it ends, or to the search box if a search with no results has hidden it. The bar sits right after the count row in the DOM (so Tab reaches it before the list) and is sticky, so it never covers the last row.

**Offline.** Loaded data stays on screen, groups included. New palette, Palette actions, every Remove button, New group, every Groups button and every group and group-row actions button are disabled, and a `role="status"` region says **"Connect to the internet to edit palettes."** (`OFFLINE_EDIT_NOTE`). The region stays mounted and empties when the connection returns. Paint detail's Add to palette, the selection bar's Add to palette and the picker's buttons are disabled too, each with the same note. Inside group sheets already open, the Groups checkboxes, Remove from group, the move and copy targets, the name sheet's Create, inline rename's Save and the delete-group sheet's Delete are disabled, and those sheets show the same note. Select mode still works offline; only the add waits.

**Name sheet.** `kind` (`"palette"`, the default, or `"group"`) sets the wording: "Palette name" or "Group name". It checks names the way the server does: blank → "Give the palette a name" or "Give the group a name", over 60 characters → "Use 60 characters or fewer". Server codes become messages: `PALETTE_LIMIT` → "You can have up to 50 palettes", `GROUP_LIMIT` → "A palette can have up to 30 groups"; anything unmapped → "Couldn't save the palette…" or "Couldn't save the group…". The error is a `role="alert"` tied to the field by `aria-describedby`. Focus returns to the button that opened the sheet.

## Relations to other features

- **Catalog** ([catalog/data-pipeline.md](catalog/data-pipeline.md)): paint names, brands and hex come from `useCatalog()` and `<CatalogGate>`. Adding starts on [paint detail](catalog/paint-detail.md) and in Select mode on the [search screen](catalog/search-and-filters.md).
- **Auth** ([auth-account.md](auth-account.md)): Clerk user for the signed-out state and for showing Select; `useSignIn()` for Add to palette signed out; `deleteAccount` removes palettes.
- **App shell** ([app-shell-ui.md](app-shell-ui.md)): the Palettes tab and the back button.
- **PWA** ([pwa.md](pwa.md)): `useOnlineStatus()` drives the offline states.
