---
type: story
slug: paint-detail
status: released
branch: story/paint-detail
worktree_path: ../grimify-v2-worktrees/story-paint-detail
created: 2026-10-07
approved: 2026-10-07
version: 0.4.0
tag: v0.4.0
merge_commit: 7dc2535 (squash of story/paint-detail)
---

# Paint detail and equivalents

## Summary

Give every paint its own screen at `/paints/$paintId`: a full-width swatch, its details, a copyable hex, and its closest matches in other brands ranked by CIEDE2000 (PRD Feature 2, UX_FLOWS Flow 3, DECISIONS 008). This is Grimify's core promise ("what's the Vallejo version of Mephiston Red?"). It also makes the Paints list rows tappable.

## Context

ROADMAP NOW: "Paint detail + computed equivalents (CIEDE2000)".

Already in place:

- `catalog.json` carries `lab`, `hue` and `value` for every paint.
- `src/features/matching/delta-e.ts` has `deltaE` and the match labels (DECISIONS 022: < 2 Very close, < 5 Close, < 10 Similar).
- DATABASE §3 defines the type families and names `src/features/matching/type-families.ts`, which doesn't exist yet.
- Rows in the Paints list aren't links.
- `AppShell` shows a header `<h1>` from the route's `staticData.title` and has no back control.

What the docs fix:

- **Matching:**
  - Equivalents come from **other** brands, in the **same type family** by default, with a "Show all types" toggle.
  - They're grouped by brand and ranked by ΔE, with labels.
  - The `special` family (technical, other) gets curated equivalents only.
  - When nothing is within the threshold: "No close match in [Brand]" plus the nearest result, muted.
- **On the screen:**
  - A large swatch about 160px tall, with "Colors are approximate." under it.
  - Name, brand, line, type, finish, and a hex that copies on tap.
  - A disclaimer that metallics and washes match poorly by hex.

## Defaults the docs leave open (change any)

- **"Within the threshold" means ΔE < 10**, the edge of "Similar" (DECISIONS 022). Beyond that a brand shows "No close match in [Brand]" with its single nearest paint, muted.
- **Up to 3 paints per brand.** Brands are ordered by their best match.
- **"Show all types" lives in the URL** as `?types=all`, so Back and links keep it. It doesn't apply to `special` paints. Following the PRD, those show only curated equivalents, and no paint has any yet.
- **Back control:** the detail screen's header shows a "Paints" back button instead of a title, and the paint name is the page's `<h1>`.
  - If the previous history entry is in the app, the button goes back, so the list's search and filters return.
  - Otherwise, after opening a shared link, it goes to `/paints`.
  - Routes opt in with `staticData.back`.
- **Unknown paint ID:** "This paint isn't in the catalog" with a link to Paints.
- **Copying the hex:** uses the Clipboard API and announces "Copied #9A1115" through a polite status message. If the clipboard is unavailable, the hex stays selectable text.

## Scope

**In scope**

- `type-families.ts` and `find-equivalents.ts` (pure, tested)
- The `/paints/$paintId` route and `PaintDetail` screen, including not-found and loading/error (reusing the catalog loader)
- `PaintSwatch` gains a `hero` size; new tokens for its height
- `PaintRow` becomes a link to the detail screen
- `AppShell` back button driven by `staticData.back`
- Unit, component and E2E tests; docs

**Out of scope**

- Own/Want toggles and the "You own this" badge (collection items)
- Curated equivalents data (`curatedEquivalents` is supported by the logic, but no paint has any)
- Sharing, deep-link previews, per-paint SEO (DECISIONS 001)
- Showing a paint's own other-line duplicates (e.g., Mephiston Red Air and Spray); equivalents are other brands only

## Requirements

- **R1** — `/paints/$paintId` shows the paint:
  - A full-width swatch with "Colors are approximate." under it.
  - Its name as the page's `<h1>`.
  - Brand, line, type and finish (when set), "Discontinued" when set, and aliases as "Also known as".
  - A hex button that copies the value and announces it.
  - An unknown ID shows a not-found message with a link back to Paints.
- **R2** — Equivalents compare the paint against paints from **other** brands in the same type family (DATABASE §3, `finish: "metallic"` counts as metallic), ranked by CIEDE2000 on `lab`.
- **R3** — Equivalents are grouped by brand:
  - At most 3 per brand, each with its match label.
  - Brands are ordered by their closest match.
  - A brand with nothing under ΔE 10 shows "No close match in [Brand]" and its nearest paint, muted, without a label.
- **R4** — "Show all types" (`?types=all`) compares against every type except for `special` paints. Those only ever list `curatedEquivalents`, or "No automatic equivalents for technical and special paints" when there are none.
- **R5** — For metallic, wash and tint paints, a note under the equivalents says hex matching is rough for that kind of paint.
- **R6** — Each row in the Paints list, and each equivalent, is a link to that paint's detail. The header's back button returns to the previous in-app screen with its search and filters, or to `/paints` when there's no in-app history.
- **R7** — Accessibility (WCAG 2.1 AA):
  - The page has one `<h1>` (the paint name), and equivalents sit under an `<h2>` with an `<h3>` per brand.
  - The back button is named "Back to Paints".
  - The hex button is named "Copy hex #9A1115".
  - The toggle is a labelled checkbox.
  - Match labels and "No close match" are text, never color alone.

## Acceptance criteria

- **AC1** (R1, R6) — Given `/paints`, when I tap Mephiston Red (Citadel Base), then the detail shows its swatch, "Mephiston Red", "Citadel · Base · Base", the hex button and "Colors are approximate."; Back returns to the list with my search intact.
- **AC2** (R2, R3) — Given Mephiston Red's detail, then equivalents list brands other than Citadel, each with up to 3 opaque paints labelled Very close / Close / Similar, with the brand whose best match is closest first.
- **AC3** (R4) — Given Mephiston Red's detail, when I tick "Show all types", then the URL gains `?types=all` and contrast or wash paints may appear. Unticking restores the opaque-only list.
- **AC4** (R3) — Given a paint with no close opaque match in some brand, then that brand reads "No close match in [Brand]" with one muted paint.
- **AC5** (R4) — Given a technical paint (e.g., Army Painter Speedpaint Medium), then the equivalents section says there are no automatic equivalents.
- **AC6** (R1) — Given I tap the hex, then the clipboard holds it and a screen reader hears "Copied #9B130B".
- **AC7** (R1, R6) — Given `/paints/not-a-paint`, then "This paint isn't in the catalog" shows with a link to Paints; given a shared detail link opened fresh, the back button goes to `/paints`.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R2, R4 | `maps paint types to families` | `src/features/matching/type-families.test.ts` | Every `PaintType` has a family; `acrylic` → opaque, `speedpaint` → tint, `ink` → wash, `technical` → special; any `finish: "metallic"` → metallic |
| T2 | R2 | `ranks other-brand paints in the same family` | `src/features/matching/find-equivalents.test.ts` | Same-brand paints excluded; a wash never matches an opaque paint by default; order is ΔE ascending |
| T3 | R3 | `groups by brand, keeps three, orders by best match` | `src/features/matching/find-equivalents.test.ts` | 5 candidates in one brand → 3 kept; brand order follows each brand's best ΔE |
| T4 | R3 | `marks a brand with no close match` | `src/features/matching/find-equivalents.test.ts` | Best ΔE ≥ 10 → `{ noCloseMatch: true, paints: [nearest] }` with no label |
| T5 | R4 | `widens to all types except for special paints` | `src/features/matching/find-equivalents.test.ts` | `allTypes: true` lets a wash match an opaque paint; a technical paint returns curated IDs only (empty when none) |
| T6 | R1, R7 | `shows the paint and copies its hex` | `src/features/catalog/paint-detail.test.tsx` | `/paints/<id>` → h1 name, meta line, disclaimer; clicking "Copy hex #…" calls `navigator.clipboard.writeText` and shows "Copied #…" in a status region |
| T7 | R3, R4, R5 | `lists equivalents and toggles all types` | `src/features/catalog/paint-detail.test.tsx` | h2 "Equivalents" and h3 per brand; ticking "Show all types" sets `types=all` in the URL; the metallic note shows for a metallic paint |
| T8 | R1, R6 | `handles unknown paints and back navigation` | `src/features/catalog/paint-detail.test.tsx` | Unknown ID → not-found text and Paints link; fresh load → "Back to Paints" navigates to `/paints` |
| T9 | R6 | `links each row to its detail` | `src/components/paint-row.test.tsx` | Row contains a link to `/paints/<id>` whose name includes the paint name |
| E1 | R1, R3, R6 | `opens a paint and its equivalents, then returns to the search` | `tests/e2e/catalog.spec.ts` | AC1 and AC2 on the real catalog, both device profiles |

**Not unit testable:** AC6's spoken announcement and the swatch's look on a phone are manual. Clipboard writes are mocked in jsdom.

## Implementation plan

1. [x] `type-families.ts` with T1. Touches `src/features/matching/type-families.ts`, `type-families.test.ts`.
2. [x] `findEquivalents(paint, catalog, { allTypes })` → `{ special: boolean; groups: { brand; noCloseMatch; matches: { paint; distance; label }[] }[] }` with T2–T5. Touches `src/features/matching/find-equivalents.ts`, `find-equivalents.test.ts`.
3. [x] `PaintSwatch` `hero` size (full width, `--swatch-hero-height` 160px). Touches `src/components/paint-swatch.css`, `src/styles/tokens.css`.
4. [x] `PaintRow` links to the detail. The whole row is the link target and keeps a ≥ 56px height and a visible focus ring. Equivalent rows reuse it. T9. Touches `src/components/paint-row.tsx`, `paint-row.css`, `paint-row.test.tsx`; `paints-screen.test.tsx` if its row selectors need the link.
5. [x] `AppShell` back button: `staticData.back = { to, label }`. Uses `useCanGoBack()`: history back when possible, otherwise navigate to `to`. Lucide `ChevronLeft` + label text, accessible name "Back to Paints". Touches `src/components/app-shell.tsx`, `app-shell.css`, `src/router.ts` (the `StaticDataRouteOption` type).
6. [x] Detail route and screen: `src/routes/paints/$paintId.tsx` with `validateSearch` for `types`; `PaintDetail` uses `useCatalog`, with header facts, the hex copy button with a status message, disclaimers, the equivalents section and the toggle. T6–T8. Touches `src/routes/paints/$paintId.tsx`, `src/features/catalog/paint-detail.tsx`, `paint-detail.css`, `paint-detail.test.tsx`; `src/routeTree.gen.ts` is regenerated by the router plugin, never edited by hand.
7. [x] E1. Touches `tests/e2e/catalog.spec.ts`.
8. [x] Docs. Touches the files listed.
    - **DECISIONS 025:** the equivalents presentation defaults (threshold 10, 3 per brand, `?types=all`, special stays curated-only).
    - **DESIGN_SYSTEM:** §10 detail layout and hero swatch; §11 header back button.
    - **UX_FLOWS Flow 3:** back behavior, not-found.
    - **API.md / ARCHITECTURE:** none expected (all client-side); confirmed at the time.
9. [x] Verify: `npm run check`, `npm run build`, `npm run test:e2e`, `prettier --check .`, plus screenshots of a detail screen (opaque, metallic, technical; light and dark) through a temporary spec, removed afterwards. Touches nothing.

**Must not change:** the Paints list's search and filter behavior and URL keys; catalog data; the match label thresholds.

## Risks and open questions

- **The defaults above** are product choices the docs left open. They're easy to change after release.
- **Back-button behavior depends on router history** (`useCanGoBack`, exported by the installed TanStack Router 1.170). It's covered by T8 and E1, but iOS standalone mode has no browser back button, so this header button is the only way back there.
- **Duplicates across a brand's own lines** (e.g., Mephiston Red in Base, Air and Spray) don't show as equivalents. That's intended, since equivalents are other brands only, but a painter might expect "the same paint in the Air range". A possible later "Same paint in other lines" section.
- **Match quality is only as good as the hex data.** Inherited bad values (e.g., Mournfang Brown `#681409`) produce confident-looking wrong matches. The disclaimers say so; data fixes are separate.
- **Accessibility:** the hero swatch is decorative (`aria-hidden`) because every fact is in text. Very pale or very dark swatches rely on the edge token, as in the list.
- **Estimate:** 1.5–2 sessions.

## Progress log

- 2026-10-07 — Planned. No open TBDs block this item; the defaults above are proposed for approval.
- 2026-10-07 — Approved as written, including the four defaults.
- 2026-10-07 — Implementation started in worktree `../grimify-v2-worktrees/story-paint-detail` on `story/paint-detail`.
- 2026-10-07 — Steps 1–9 done. `npm run check` (112 tests in 21 files; catalog valid), `npm run build`, `npm run test:e2e` (8 passed: 4 journeys × 2 devices) and `prettier --check .` exit 0. The main JS bundle fell from 122 to 89 KB gzipped, because the catalog code shared by both Paints routes moved to its own chunk. Screenshots (iPhone 15; Mephiston Red, Leadbelcher, Speedpaint Medium; light and dark) checked by eye, then the temporary spec was removed. Drift:
  - Order: step 4 (row links) ran after step 6, because the typed `Link` needs `/paints/$paintId` in the route tree. `routeTree.gen.ts` was regenerated by the router plugin (`vite build`), not edited.
  - Added `CatalogGate`, shared by both screens, as a separate `refactor` commit. It's the Paints screen's loading and error states, moved unchanged.
  - Added `--opacity-muted` (0.7) for "no close match" rows and `src/test/render-with-router.tsx` for component tests that render router links.
  - Equivalents show a "Curated matches" section for any paint with `curatedEquivalents` (none exist yet), not only special paints, because DECISIONS 008 allows curated overrides on any paint.
  - The copy failure path announces "Couldn't copy; select the hex instead." and logs the error.
  - Seen in screenshots, not a bug in this item: Citadel Leadbelcher is typed `base` with hex `#455051` in the seed data, so it gets no metallic note and matches dark greys. That's the known "metallics inside non-metallic lines" gap from the seed catalog.
- 2026-10-07 — Staged. Version 0.4.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/paint-detail`. Manual checks still open: AC6's VoiceOver announcement, and the back button in an installed iOS app (after the PWA item).
- 2026-10-07 — Released. Owner approved the review. Squash-merged 12 commits from `story/paint-detail` into `main` as 0.4.0 (7dc2535), tagged `v0.4.0`. Worktree and branch removed.
