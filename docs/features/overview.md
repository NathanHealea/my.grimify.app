# Feature Docs: Overview

> Start here. Each feature doc explains **how the feature works in code** and links to the topic docs (ARCHITECTURE, API, DATABASE, UX_FLOWS, DECISIONS) for rules and rationale.
> **Topic docs are the source of truth.** If a feature doc disagrees with one, the topic doc wins. Flag the conflict.

## TL;DR

- Grimify is a **static React SPA/PWA** on **Cloudflare Workers**, with **Convex** as the backend and **Clerk** for sign-in. There's **no custom server**.
- There are **two data stores**:
  - **Paint catalog**: JSON in Git, built to `catalog.json`. Public and read-only.
  - **User data**: Convex tables `users`, `userPaints` and `palettes`. Private, per user.
- The **paint ID** is the **only link** between the two stores.
- **Search and color matching run in the browser.** Convex never sees the catalog.
- **Every collection write goes through the outbox** (IndexedDB), online or offline.

## Feature index

| Feature | Doc | Code |
|---|---|---|
| Catalog data pipeline | [catalog/data-pipeline.md](catalog/data-pipeline.md) | `data/catalog/`, `scripts/build-catalog.ts`, `src/features/catalog/` |
| Search and filters | [catalog/search-and-filters.md](catalog/search-and-filters.md) | `src/features/catalog/`, `src/routes/paints/index.tsx` |
| Paint detail | [catalog/paint-detail.md](catalog/paint-detail.md) | `src/features/catalog/paint-detail.tsx` |
| Matching | [matching.md](matching.md) | `src/features/matching/` |
| Collection: sync and outbox | [collection/sync-and-outbox.md](collection/sync-and-outbox.md) | `src/features/collection/` |
| Collection: Convex backend | [collection/convex-api.md](collection/convex-api.md) | `convex/` |
| Collection: toggles and My Paints | [collection/toggles-and-my-paints.md](collection/toggles-and-my-paints.md) | `src/features/collection/`, `src/routes/my-paints.tsx` |
| Auth and account | [auth-account.md](auth-account.md) | `src/features/auth/`, `convex/users.ts` |
| PWA | [pwa.md](pwa.md) | `src/features/pwa/`, `vite.config.ts` |
| Palettes | [palettes.md](palettes.md) | `src/features/palettes/`, `src/routes/palettes/`, `convex/palettes.ts` |
| Settings | [settings.md](settings.md) | `src/features/settings/` |
| App shell and shared UI | [app-shell-ui.md](app-shell-ui.md) | `src/components/`, `src/routes/`, `src/features/feedback/` |
| Hosting and deploys | [hosting.md](hosting.md) | `wrangler.json`, `scripts/deploy.ts`, `public/_headers` |

## Architecture

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

## How the features depend on each other

```text
app-shell ──► collection (pending count) ──► auth (Clerk user)
    │               ▲                            │
    ▼               │                            ▼
 catalog ──► matching          convex (users, userPaints) ◄── auth (users.store)
    │
    └──► collection (toggles on every row, Show only filter, My Paints scope)
pwa ──► used by collection (online event), auth (offline gates), app-shell (banner, Offline pill)
```

| Feature | Uses | Used by |
|---|---|---|
| Catalog | matching, collection (toggles, `useCollection`) | collection (My Paints), app shell |
| Matching | catalog types only | catalog build, search, paint detail, `<PaintRow>` |
| Collection | auth (Clerk user), Convex, feedback, pwa | catalog screens, auth, app shell |
| Auth | collection (`useEndSession`, `useSetPaintFlags`), Convex, pwa | collection, settings |
| PWA | n/a | collection, auth, app shell |

## Two flows end to end

### Search for a paint (no backend)

1. `/paints?q=…` → `<PaintsScreen>` → `<CatalogGate>` loads `catalog.json` from the service-worker cache or the network.
2. `parseQuery()` → `searchPaints()` runs against the in-memory catalog and the Fuse index.
3. Results render as `<PaintRow>`s in pages of 60.

### Mark a paint as owned

1. `<PaintToggles>` → `useSetPaintFlags()` → `enqueue` into the device outbox (IndexedDB).
2. The UI updates at once, through `applyOutbox`.
3. When Convex is ready, `flushOutbox` → `userPaints.set` (last-write-wins).
4. `userPaints.listMine` updates reactively. The stored copy refreshes.

## Conventions for these docs

- One doc per feature, or a folder when a feature has more than one part.
- Each doc starts with a **TL;DR**, then **Where the code lives**, then the details, then **Relations to other features**.
- **Bold** marks the facts to remember. Paths and identifiers are in `code`.
- Every fact comes from the code or an existing doc. Update the feature doc **in the same change** as the code.
