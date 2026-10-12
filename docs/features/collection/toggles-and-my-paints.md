# Collection: Toggles and My Paints

> Covers the Own/Want/Favorite buttons and the `/my-paints` screen.
> User journeys: [UX_FLOWS.md Flows 5 and 6](../../UX_FLOWS.md). Rationale: [DECISIONS 011, 030, 031, 033, 034](../../DECISIONS.md).

## TL;DR

- **Three independent flags**: **owned**, **wishlisted** and **favorite**. Setting one never clears another (DECISIONS 011, 033).
- `<PaintToggles>` shows **plus, bookmark and heart** icon buttons with **`aria-pressed`** and **no tooltips** (DECISIONS 034).
- **Signed out**: a tap **opens sign-in** and **finishes the toggle after sign-in** (DECISIONS 030). Offline, it shows a toast instead.
- **My Paints is the catalog search screen**, scoped to one part of the collection (DECISIONS 031).
- Tabs **Owned / Wishlist / Favorites** live in the URL as **`?tab=`**. The default is `owned`.

## Where the code lives

| Path | Role |
|---|---|
| `src/features/collection/paint-toggles.tsx` | `<PaintToggles paintId paintName>` |
| `src/features/collection/my-paints-screen.tsx` | `<MyPaintsScreen>`: tabs, empty states, signed-out message |
| `src/routes/my-paints.tsx` | Route; Zod schema for `tab`, `q`, `brand`, `line`, `type`, `hue` |
| `src/features/catalog/filters.ts` | `COLLECTION_VIEWS`, `collectionView()` |

## What a toggle tap does

| Situation | Result |
|---|---|
| Device user known (online **or offline**) | `useSetPaintFlags()` queues the change in the outbox |
| No user, **offline** | Toast: **"Signing in needs an internet connection."** |
| No user, online | Opens the sign-in sheet with a **pending action** `{ paintId, change }` |

Button labels: "Mark {name} as owned", "… as wanted", "… as favorite".

## My Paints behavior

1. **Signed out** (Clerk loaded): "Sign in to see the paints you own and want, on any device." It shows a **Sign in** button when online, or the offline note.
2. **Loading**: "Loading your paints…" with three skeleton rows.
3. Otherwise, it shows the tabs with counts, e.g. **"Owned (12)"**, and **`<PaintsScreen>`** with:
   - `scope` set to the tab's set of paint IDs.
   - `hideShow`, so the **Show only** filter is hidden.
   - An empty-tab message plus **Browse paints**: "You haven't added any paints yet", "Nothing on your wishlist" or "No favorites yet".

Changing filters keeps `tab` and `q`, and always drops `show`. **Clear all** keeps only `tab`.

**Offline**, Clerk never loads, so the collection answers from the device for the stored user.

## Relations to other features

- **Outbox** ([sync-and-outbox.md](sync-and-outbox.md)): all writes and reads.
- **Search** ([search-and-filters.md](../catalog/search-and-filters.md)): My Paints reuses `<PaintsScreen>`.
- **Auth** ([auth-account.md](../auth-account.md)): `useSignIn()` and the pending action.
- **PWA** ([pwa.md](../pwa.md)): `useOnlineStatus()`.
