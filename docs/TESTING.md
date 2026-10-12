# Testing

> Status: **Draft v0.2**

## 1. Testing Goals

Critical functionality:
- Catalog data is valid (IDs unique and immutable, hex valid, references resolve)
- Search and filters return the correct paints
- Color equivalents are computed correctly and ranked sensibly
- Own/Want state saves, syncs and is only visible to its owner
- The app installs and works offline as a PWA

---

## 2. Test Types

### Unit Testing
Test:
- `features/matching`: hex → Lab conversion, Delta-E, `findEquivalents` (type-family filtering, "show all" toggle, ranking, thresholds)
- `features/collection`: outbox (queue, collapse duplicates, flush order, keep on network error, drop on validation error), device store, cached and pending flags in `CollectionProvider`, device user (offline, other user, signed out)
- `features/catalog`: query parser (`parse-query`): hex detection (`#abc`, `abc123`, invalid hex), brand detection (case/alias), hue names (`red-orange`, `red orange`), combinations, plain text fallback
- `features/catalog`: search (fuzzy, aliases), filter combinations, URL search-param parsing
- `features/matching`: hue classification (known reference colors → expected family; neutral threshold; `hueOverride` wins)
- `scripts/build-catalog`: validation rules (duplicate ID, bad hex, missing brand, removed ID → fail)
- Small components where the logic is non-trivial (e.g., `PaintSwatch` black/white label choice)

### Integration Testing
Test (with `convex-test`):
- `users.store` is idempotent
- `userPaints.set` inserts, then updates (no duplicate rows); owned and wishlisted are independent
- `userPaints.set` keeps a cleared row as a tombstone, and an older change can't bring it back (issue #4); `listMine` leaves tombstones out
- `userPaints.set` ignores an older `clientUpdatedAt` (last-write-wins); replaying is idempotent
- Unauthenticated calls throw `UNAUTHENTICATED`
- User A cannot read or modify user B's data
- `users.deleteAccount` removes all of the user's data (tombstones and palettes included) and nobody else's, in scheduled batches past 500 rows; signed out → `UNAUTHENTICATED`, nothing left → `null`
- `palettes.*`: trimmed names, `PALETTE_NAME_INVALID` and `PALETTE_LIMIT` (51st palette), rename and remove, list order and preview, another user's ID behaves like a missing one, a malformed ID → `null`, every function `UNAUTHENTICATED` signed out (`convex/palettes.test.ts`)

Deleting an account isn't covered by E2E: it would delete the shared test user (DECISIONS 032) during parallel runs. Check it by hand on the dev instance with a throwaway email.

### End-to-End Testing
Test critical user journeys (Playwright with mobile device emulation: iPhone 15 and Pixel 7 profiles):
- Search → open paint → see equivalents
- Type a hex code → closest paints across brands appear
- Type a brand name → brand chip + only that brand's paints
- Tap a hue dot → only that hue family
- Filter by brand/type → URL updates → reload keeps filters
- Sign in (test-mode auth) → mark owned → appears in My Paints: `tests/e2e/collection.spec.ts`, with `@clerk/testing`. Global setup creates `grimify-e2e+clerk_test@example.com` in the Clerk development instance if missing (DECISIONS 032); each device profile uses a different paint and un-owns it at the end
- Offline: load app, go offline (`context.setOffline(true)`), search still works
- Palettes: sign in → create a palette → rename it → back to the list ("0 paints") → delete it → gone after reload: `tests/e2e/palettes.spec.ts`. Each device profile names its own palette (`E2E <profile> <timestamp>`). Needs the `palettes` functions on the dev deployment (`npx convex dev`); without them the app shows its error screen
- Offline toggle: go offline, reload, mark a paint owned, see "1 change waiting to sync", go online → change synced (visible in a fresh context): `tests/e2e/collection.spec.ts`, Chromium only like `offline.spec.ts`

### Manual Testing (real devices, before each release)
Automated tools can't fully cover installed iOS PWA behavior:
- [ ] iPhone: Add to Home Screen → opens standalone, safe areas correct
- [ ] iPhone installed PWA: sign in with email code works without leaving the app
- [ ] iPhone installed PWA: airplane mode → catalog and search work
- [ ] iPhone installed PWA: airplane mode → mark paint owned → turn off airplane mode → synced to another device
- [ ] Android: install prompt → standalone
- [ ] Update prompt appears after a new deploy

### Deployed checks (after each deploy to dev, stage or production, and after any `public/_headers` change)
Replace `<site>` with `dev.grimify.app`, `stage.grimify.app` or `grimify.app`. Run them in a private window or with the service worker unregistered: a cached `index.html` keeps the CSP it was cached with.
- [ ] `curl -sI https://<site>/paints` shows the CSP, `nosniff`, `Referrer-Policy` and `Permissions-Policy`, and the CSP's `connect-src` names that environment's Convex deployment (`nautical-toucan-398` only on grimify.app)
- [ ] `https://<site>/robots.txt` reads `User-agent: *` / `Disallow: /`
- [ ] A paint URL pasted into a new tab loads the paint, not a 404; reloading on `/my-paints` keeps you there; `curl -s -o /dev/null -w "%{http_code}" https://<site>/paints` prints `200`
- [ ] Desktop browser: sign in with an email code, own a paint, see it in My Paints, sign out; the console shows no CSP violations
- [ ] Dev and stage: a paint owned there doesn't appear in My Paints on grimify.app (separate data)
- [ ] iPhone Safari and the installed app (production): the same journey; the paint owned on desktop shows up
- [ ] Settings › About shows the deployed version

---

## 3. Testing Tools

Unit: Vitest (+ @testing-library/react for components)
Integration: Vitest + `convex-test`
E2E: Playwright
PWA audit: Lighthouse (Chrome DevTools or `@lhci/cli` in CI, optional)

---

## 4. Test File Structure

```text
src/**/*.test.ts(x)     # unit tests colocated next to the code
convex/**/*.test.ts     # Convex integration tests (convex-test), run in Vitest's `convex` project (edge-runtime); `src/`, `lint/` and `scripts/` run in the `app` project. Clerk is mocked globally in `src/test/setup.ts` as signed out
scripts/**/*.test.ts    # catalog build/validation tests
lint/**/*.test.js       # local ESLint rule + Stylelint config tests
tests/
└── e2e/                # Playwright specs
    ├── catalog.spec.ts
    ├── collection.spec.ts
    ├── header.spec.ts  # large title collapse, header alignment with the content column, title contrast
    ├── nav.spec.ts     # nav layout per width (four tabs), glass and fallback, contrast over black/white
    ├── offline.spec.ts
    └── palettes.spec.ts
```

---

## 5. Critical User Flows

Flow: Find an equivalent
Steps:
1. Open `/paints`
2. Search "Mephiston"
3. Open "Mephiston Red"
Expected result: the detail page shows equivalents from at least one other brand, ranked closest first.

Flow: Save a paint
Steps:
1. Sign in as the test user
2. Mark a paint as Own
3. Open My Paints → Owned
Expected result: the paint is listed; after a reload it's still listed.

Flow: Offline catalog
Steps:
1. Load the app once online
2. Go offline and reload
3. Search for a paint
Expected result: results appear; the "Offline" indicator is visible.

---

## 6. Coverage

Target: no global % target. Aim for ~90% on `features/matching`, `features/catalog` and `convex/`.

Prioritize:
- Color-matching logic
- Catalog validation
- Authorization in Convex functions
- Data mutations
- The three critical flows above

---

## 7. Commands

| Purpose | Command |
|---|---|
| Unit + integration tests | `npm test` (Vitest) |
| E2E | `npm run test:e2e` (Playwright; builds and serves the app for the run). First time: `npx playwright install chromium webkit`. Not part of `check`. `tests/e2e/offline.spec.ts` runs on Chromium only (Playwright's WebKit service-worker support is limited); iPhone offline stays on the manual list. Needs `CLERK_SECRET_KEY` in `.env.local` (global setup fails with its name if missing) and writes to the dev Clerk and Convex instances |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` (`tsc -b`) |
| Validate catalog | `npm run catalog:validate` |
| Build catalog only | `npm run catalog:build` (writes `public/catalog.json`) |
| Record new paint IDs | `npm run catalog:ids` |
| Build | `npm run build` (runs `catalog:build` first) |
| All checks | `npm run check` (lint + typecheck + test + `catalog:validate`) |

---

## 8. Definition of Done

- Tests pass
- Build passes
- Lint passes
- Type checking passes
- Catalog validates
- Critical flow verified (E2E, or manually on a phone for PWA-specific changes)
- No blocking console errors
