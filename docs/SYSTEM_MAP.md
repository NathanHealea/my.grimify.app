# System Map

> Quick-answer reference: what each piece is, where it lives, and what it talks to.
> Rationale lives in `DECISIONS.md`. Full detail lives in `ARCHITECTURE.md`, `API.md` and `DATABASE.md`.
> Mapped from the code on 2026-10-11.

## TL;DR

- **Static SPA + Convex.** No custom server. Convex functions are the backend.
- **Two data stores:**
  - Paint catalog: JSON in Git → `public/catalog.json` → fetched by the browser. Public, read-only.
  - User data: Convex tables `users` and `userPaints`. Private, per user.
- **Paint ID** is the only link between the catalog and user data.
- **All search and color matching run in the browser.** Convex never sees the catalog.
- **Every collection write goes through the outbox** (IndexedDB), online or offline.

---

## Where do I look for…?

| I need to… | Go to |
|---|---|
| Add or change a page | `src/routes/` (file-based, TanStack Router) |
| Change search behavior | `src/features/catalog/parse-query.ts` → `search.ts` |
| Change filters | `src/features/catalog/filters.ts`, `paints-filters.tsx` |
| Change equivalents / color matching | `src/features/matching/` |
| Change Own / Want / Favorite | `src/features/collection/` |
| Change sign-in / account | `src/features/auth/` |
| Change offline / install / update prompts | `src/features/pwa/` |
| Change a Convex function | `convex/users.ts`, `convex/userPaints.ts` |
| Change auth checks on the backend | `convex/lib/auth.ts` |
| Change the Convex schema | `convex/schema.ts` (+ `DATABASE.md` first) |
| Change paint data | `data/catalog/<brandId>.json`, then `npm run catalog:ids` |
| Change how the catalog is built | `scripts/build-catalog.ts`, `scripts/catalog/` |
| Change hosting / domains | `wrangler.jsonc`, `scripts/deploy.ts` |
| Change the service worker | `vite.config.ts` (`VitePWA` → `workbox`) |

---

## The big picture

```text
 Build time                         Runtime (user's phone)
 ──────────                         ──────────────────────
 data/catalog/*.json                ┌──────────────────────────────────┐
        │                           │ React SPA                        │
        ▼                           │                                  │
 scripts/build-catalog.ts           │  features/catalog ──► Fuse index │
  validate → compile                │  features/matching (culori)      │
        │                           │  features/collection             │
        ▼                           │     └─ outbox (IndexedDB) ───────┼──► Convex
 public/catalog.json ──► dist/ ─────┼──► fetched once, precached by SW │    users / userPaints
                          │         │  features/auth (Clerk) ──────────┼──► Clerk
                          ▼         └──────────────────────────────────┘
               Cloudflare Worker
               (static assets only)

 Clerk issues the session JWT → Convex verifies it (convex/auth.config.ts).
```

---

## Frontend

### Boot order

`src/main.tsx` wraps the app in this order (outer → inner):

1. `ServiceWorkerUpdates`: registers the service worker, provides the update state (`useUpdateState()`) and renders the update bar after the app
2. `ClerkProvider`: auth session
3. `ConvexProviderWithClerk`: Convex client, authenticated with Clerk's token
4. `AppProviders` (`src/app-providers.tsx`):
   1. `ToastProvider`
   2. `CollectionProvider`
   3. `SignInProvider`, plus `<StoreUser />` (creates the `users` row after sign-in)
5. `RouterProvider`: renders routes

If `readAuthEnv` fails, the missing config shows on screen instead of a blank page.

### Routes

All routes render inside `AppShell` (from `src/routes/__root.tsx`).

| URL | File | Renders | Search params |
|---|---|---|---|
| `/` | `routes/index.tsx` | Redirects to `/paints` | none |
| `/paints` | `routes/paints/index.tsx` | `PaintsScreen` | `q`, filters |
| `/paints/$paintId` | `routes/paints/$paintId.tsx` | `PaintDetail` | none |
| `/my-paints` | `routes/my-paints.tsx` | `MyPaintsScreen` | `tab`, `q`, `brand`, `line`, `type`, `hue` |
| `/settings` | `routes/settings.tsx` | `SettingsScreen` | none |

- Search params are validated with Zod in `validateSearch`.
- `/my-paints` defaults `tab` to `owned`.

### Feature modules (`src/features/`)

| Module | Owns | Key files | Talks to |
|---|---|---|---|
| `catalog` | Loading, parsing queries, search, filters, paint screens | `load-catalog.ts`, `use-catalog.ts`, `catalog-gate.tsx`, `parse-query.ts`, `search.ts`, `filters.ts`, `schema.ts`, `paints-screen.tsx`, `paint-detail.tsx` | `matching`, `collection` |
| `matching` | Delta-E, equivalents, hue + value classification, type families. Pure, no React. | `delta-e.ts`, `find-equivalents.ts`, `classify-hue.ts`, `type-families.ts` | `catalog/schema` (types only) |
| `collection` | Owned / wishlist / favorite state, outbox, device cache | `collection-provider.tsx`, `use-set-paint-flags.ts`, `outbox.ts`, `device-store.ts`, `paint-toggles.tsx`, `my-paints-screen.tsx` | Convex, Clerk, `auth`, `feedback`, `pwa` |
| `auth` | Sign-in sheet, storing the user, account + delete | `sign-in-provider.tsx`, `sign-in-sheet.tsx`, `use-store-user.ts`, `account-section.tsx`, `delete-account.tsx`, `env.ts` | Convex, Clerk, `collection` |
| `pwa` | Online status, install banner, update prompt | `use-online-status.ts`, `install-banner.tsx`, `install-hint.ts`, `service-worker-updates.tsx`, `update-state.tsx`, `update-prompt.tsx` | `virtual:pwa-register/react` |
| `feedback` | Toasts | `toast-provider.tsx` | `components/ui/toast` |
| `settings` | Settings page | `settings-screen.tsx` | `auth` |

### Shared components (`src/components/`)

| Component | Used by | Notes |
|---|---|---|
| `AppShell` | `__root.tsx` | Header, page title, offline + sync status, install banner |
| `PageTitle` | `AppShell`, `PaintDetail` | `PageTitleProvider` / `usePageTitle` |
| `PaintRow` | `PaintsScreen`, `PaintDetail` | One paint in a list, with match label |
| `PaintSwatch` | `PaintRow`, `PaintsScreen`, `PaintDetail` | Color chip from `hex` |
| `HueDots` | `PaintsScreen`, `PaintsFilters` | Hue family picker |
| `SearchChip` | `PaintsScreen` | One parsed query token |
| `ui/button`, `ui/input`, `ui/sheet`, `ui/toast` | Everywhere | shadcn, converted to plain CSS. Must not import `src/features` |

Every component has a sibling `.css` file. See `CODE_STYLE.md` §5a.

### Who calls Convex

Only these files import `convex/_generated/api`:

| File | Calls |
|---|---|
| `collection/collection-provider.tsx` | `userPaints.listMine`, `users.me`, `userPaints.set` |
| `auth/sign-in-provider.tsx` | `users.me` |
| `auth/use-store-user.ts` | `users.store` |
| `auth/delete-account.tsx` | `users.deleteAccount` |

Components never call Convex directly. They use hooks: `useCollection`, `usePaintFlags`, `useSetPaintFlags`.

---

## Backend (Convex)

### Files

| File | Exports | Kind |
|---|---|---|
| `convex/schema.ts` | `users`, `userPaints` tables | Schema |
| `convex/users.ts` | `store` | mutation |
| | `me` | query |
| | `deleteAccount` | mutation |
| | `deletePaints` | internal mutation (batched cleanup) |
| `convex/userPaints.ts` | `listMine` | query |
| | `set` | mutation |
| `convex/lib/auth.ts` | `requireIdentity`, `findUser`, `requireUser` | Helpers |
| `convex/auth.config.ts` | Clerk issuer | Auth config |

### Function cheat sheet

| Function | Auth | Does | Returns |
|---|---|---|---|
| `users.store` | Required | Creates the caller's `users` row if missing. Idempotent. | `Id<"users">` |
| `users.me` | Optional | Looks up the caller's row | `{ _id }` or `null` |
| `users.deleteAccount` | Required | Deletes the caller's `userPaints` (500 per batch) and `users` row | `null` |
| `userPaints.listMine` | Optional | Lists the caller's rows, tombstones excluded, max 5,000 | `[]` when signed out |
| `userPaints.set` | Required | Upserts one paint's flags, last-write-wins on `clientUpdatedAt` | `null` |

### Auth rule

- Every user-data function starts with `requireUser(ctx)` or `requireIdentity(ctx)`.
- `userId` is **never** an argument. It comes from the Clerk identity → `users.by_tokenIdentifier`.
- Not signed in, or no `users` row yet → `ConvexError("UNAUTHENTICATED")`.

### `userPaints.set` errors

| Error | Cause | Client does |
|---|---|---|
| `UNAUTHENTICATED` | No identity or no `users` row | Keeps the entry, retries later |
| `INVALID_PAINT_ID` | `paintId` fails `^[a-z0-9-]{3,100}$` | Drops the entry, toast |
| `NO_FLAGS` | No flag provided | Drops the entry, toast |
| `CLOCK_IN_FUTURE` | `clientUpdatedAt` more than 5 minutes ahead | Drops the entry, toast |

---

## Data and relations

```text
 Catalog (JSON, public)            Convex (private)
 ──────────────────────            ────────────────
 Brand                             users
  └─< Line                          │  tokenIdentifier  (index: by_tokenIdentifier)
       └─< Paint ◄─── paintId ───┐  │
            id (immutable)       │  └─< userPaints
                                 └──── paintId  (soft ref, not enforced)
                                       owned / wishlisted / favorite?
                                       updatedAt (client time)
                                       (index: by_userId_and_paintId)
```

- One user → many `userPaints`. At most one row per (`userId`, `paintId`).
- All flags `false` → the row stays as a **tombstone**. Never deleted, except by account deletion (DECISIONS 035).
- `users` stores no email or name. Those stay in Clerk (DECISIONS 028).

---

## Key flows

### Search (no backend)

1. `useCatalog` → `loadCatalog` fetches `catalog.json` once per session.
2. `createNameIndex` builds the Fuse index.
3. The user types → URL `q` updates.
4. `parseQuery` splits the input into hex, brand, hue and name tokens.
5. `searchPaints` filters and ranks: hex by Delta-E, name by Fuse.

### Open a paint

1. `/paints/$paintId` → `PaintDetail`.
2. `findEquivalents` compares precomputed `lab` values within the same type family.
3. Results group by brand.

### Tap Own / Want / Favorite

1. `PaintToggles` → `useSetPaintFlags`.
2. The change joins the outbox in IndexedDB (`idb-keyval`, key `grimify-device`). The toggle updates at once.
3. Flush runs when Convex is authenticated **and** `users.me` is non-null: after each change, when that becomes true, and on the browser's `online` event.
4. `userPaints.set` runs per entry, oldest first, one at a time.
5. `listMine` re-runs reactively. Every device updates.

### First sign-in

1. `SignInSheet` shows Clerk's `<SignIn>`.
2. `StoreUser` calls `users.store` once Convex is authenticated.
3. `users.me` becomes non-null → the outbox can flush. This order stops `set` from racing `store`.

### Offline launch

Clerk can't load. The collection uses the user ID stored on the device to show cached rows and accept changes (DECISIONS 036).

### Delete account

1. `DeleteAccount` calls `users.deleteAccount`.
2. Then the client deletes the Clerk account with `user.delete()` (DECISIONS 037).

---

## Build and deploy

| Step | Command | Does |
|---|---|---|
| Validate catalog | `npm run catalog:validate` | Zod + ID ledger checks |
| Record new IDs | `npm run catalog:ids` | Adds IDs to `data/catalog/published-ids.json` |
| Build | `npm run build` | `catalog:build` → `tsc -b` → `vite build` |
| Deploy | `npm run deploy:dev` / `deploy:stage` / `deploy:prod` | Deploys that environment from its branch |

- The catalog build reuses `src/features/matching/classify-hue.ts` to set `hue` and `value`.
- The service worker precaches `**/*.{js,css,html,json,svg,woff2}`, which includes `catalog.json`.
- Domains: `my.grimify.app`, `stage.my.grimify.app`, `dev.my.grimify.app`. Production also keeps `grimify.app` until the marketing cutover (DECISIONS 060); `www.grimify.app` redirects to it.

---

## Dependency rules (don't break these)

- UI components never call Convex directly. Use `src/features/*` hooks.
- Catalog data is read only through `src/features/catalog`.
- Color math lives only in `src/features/matching`. Pure functions, no React.
- `src/components/ui` must not import from `src/features`.
- Convex code must not import from `src/`.
- Collection writes go through `useSetPaintFlags`. Never call `userPaints.set` from a component.
