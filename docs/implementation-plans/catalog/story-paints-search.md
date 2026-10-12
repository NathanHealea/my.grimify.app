---
type: story
slug: paints-search
status: released
branch: story/paints-search
worktree_path: ../grimify-v2-worktrees/story-paints-search
created: 2026-10-07
approved: 2026-10-07
version: 0.2.0
tag: v0.2.0
merge_commit: a780962 (squash of story/paints-search)
---

# Paints list and smart search

## Summary

Turn the placeholder Paints tab into the app's main screen: load `catalog.json`, list every paint with its swatch, and search it from one box by name, hex, brand or hue (PRD Feature 1, DECISIONS 009). Detected brands and hues show as removable chips, hex searches rank paints by CIEDE2000 with match labels, hue dots offer one-tap color browsing, and the query lives in the URL. The filter bottom sheet is the next item.

## Context

ROADMAP NOW: "Paints tab: smart search + filters". On 2026-10-07 the owner agreed to split it into this item and "Paints filters" (bottom sheet with brand, line, type and hue as URL params). Owned/Wishlist filtering waits for auth.

Decisions made in conversation on 2026-10-07:

- **Input border:** a new `--color-input-border` token for form controls only. Light `#8A8A8A` is 3.45:1 on Background and 3.17:1 on Secondary; dark `#666666` is 3.45:1 on Background and 3.12:1 on Surface. This resolves the DESIGN_SYSTEM §3 Open item (SC 1.4.11). Decorative borders keep `--color-border`.
- **Swatch shape:** rounded square with `--radius-md`; circles are kept for hue dots, so a filter never looks like a paint.
- **No "brown" alias** (PRD §12 open question): "brown" falls through to name search, which matches the 188 paints with Brown in the name.

Code today: `src/routes/paints/index.tsx` is a placeholder; `AppShell` provides the header and nav. The catalog has 2,837 paints with `lab`, `hue` and `value` (v0.1.3), and `classify-hue.ts` shows the pattern for pure matching code. Nothing loads `catalog.json` in the app yet. `Button` is the only converted shadcn component.

## Dependencies (need your approval)

Versions checked against the npm registry on 2026-10-07.

| Package | Version | Kind | Why |
|---|---|---|---|
| fuse.js | 7.5.0 | runtime | Fuzzy name search (ARCHITECTURE §2); "mephston" must find Mephiston Red |
| @playwright/test | 1.63.0 | dev | First E2E specs (TESTING §2 and §4). `npx playwright install chromium webkit` downloads browsers (several hundred MB, outside the repo) |

No virtualization library: the list renders 60 rows and adds more as you scroll (IntersectionObserver), which keeps typing fast without a dependency. No `cmdk`: suggestions are plain chips, so DESIGN_SYSTEM §9's `<Command>` mention is dropped.

## Proposed: match labels for hex search

CIEDE2000 ΔE between the searched color and each paint's precomputed `lab`. The thresholds are shared with the equivalents item.

| ΔE | Label | Meaning |
|---|---|---|
| < 2 | Very close | Barely distinguishable side by side |
| < 5 | Close | A noticeable but small difference |
| < 10 | Similar | Same color family, clearly different |
| ≥ 10 | none | Still listed, ranked, without a label |

A ΔE of about 2 is the usual "just noticeable" point. The hex values are approximations anyway, which is why there are no finer labels.

## Search behavior

All of this item's state is the URL's `q` (validated with Zod via `validateSearch`). The input updates `q` with `replace` after a 100 ms debounce. The parser (`parse-query.ts`, the single search code path) splits `q` into:

- **Hex:** a `#RGB`, `#RRGGBB`, `RGB` or `RRGGBB` token, case-insensitive. Only one counts; the first wins. 3-digit hex expands. A bare 3-letter word like `bad` or `fed` counts as hex only with `#`, so words aren't hijacked; 6-character tokens count without `#`.
- **Brands:** brand name, name without a leading "The", or ID with spaces. Matched longest first, so `army painter` and `green stuff world` work, and case doesn't matter.
- **Hues:** the 13 family names, with a space or hyphen (`red orange`, `red-orange`). Longest first, so `red orange` isn't read as red plus orange. A hue only becomes a filter when no other text is left. Most paint names contain a color word, and classification can disagree with the name: "Death Guard Green" is yellow-green, so `death guard green` must search names, not filter to green. So `vallejo red-orange` is brand plus hue, but `mephiston red` is text.
- **Text:** whatever is left (including hue words, per the rule above), for fuzzy search on `name` and `aliases`.

Results:

- **Filtering:** brands and hues filter (OR within each kind, AND across kinds).
- **Order:** a hex ranks by ΔE ascending. Otherwise text ranks by Fuse score. Otherwise a hue sorts light to dark (`lab` L descending). Otherwise paints sort by name, then brand.
- **Chips:** each detected brand, hue and hex shows as a chip under the box (`Brand: Vallejo ×`). Removing one removes that token from `q`.
- **Suggestions:** when the last word has two or more characters and starts a brand or hue name, matching suggestions show as tappable chips that complete it.
- **Hue dots:** 13 labelled circular buttons, shown only while `q` is empty. Tapping one sets `q` to that hue.
- **Hex swatch:** a hex search shows a swatch of the entered color above the results.

## Scope

**In scope**

- Catalog loading: fetched once and cached in memory; "Downloading paint catalog…" while loading; on failure, "Connect to the internet once to download the paint catalog" with Retry (ARCHITECTURE §9)
- `--color-input-border`, a swatch inner-border token, and shadcn `Input` converted to `input.tsx` + `input.css`
- `PaintSwatch`: rounded square, `--swatch-color`, inner border, type icon for metallic, wash and contrast-style paints
- `PaintRow`: swatch, name, brand, line · type, "Discontinued" badge when set; row height ≥ 56px
- Search input, chips, suggestions, hue dots, hex swatch, result count, empty state, incremental list
- `parse-query.ts`, `search.ts`, `delta-e.ts` with unit tests
- Playwright setup and `tests/e2e/catalog.spec.ts` (name, hex, brand and hue journeys) on iPhone 15 and Pixel 7 profiles
- Docs: DECISIONS 019–022, DESIGN_SYSTEM §3, §6, §9 and §10, PRD §12, UX_FLOWS Flow 2, TESTING §7, ROADMAP split

**Out of scope**

- Filter sheet, `brand` / `line` / `type` / `hue` URL params, product line and type filters (Paints filters item)
- Owned/Wishlist filter and Own/Want toggles (auth and collection items)
- Paint detail route; rows aren't links until the detail item exists
- Service-worker caching and the offline indicator (PWA item); this item fetches the catalog over the network
- Hiding discontinued paints (PRD TBD; no paint is discontinued today, so it changes nothing yet)
- A "brown" alias

## Requirements

- **R1** — The Paints tab loads the catalog once per session. While it loads, the screen says "Downloading paint catalog…". If loading fails, it shows the offline message and a Retry button that tries again.
- **R2** — With no query, every paint is listed by name, then brand. Each row shows a rounded-square swatch of the paint's hex, its name, brand, line and type, and "Discontinued" when set. Rows are at least 56px tall. A "2,837 paints" style count is announced politely to screen readers whenever it changes.
- **R3** — The query parser detects one hex (rules above) and any number of brands. Hues become filters only when nothing else is left as text; otherwise hue words stay in the text.
- **R4** — Text matches name and aliases fuzzily ("mephston" → Mephiston Red); brands and hues filter; a hex ranks by CIEDE2000 with the match labels above and shows the entered color; a hue alone sorts light to dark.
- **R5** — Every detected brand, hue and hex appears as a chip; removing a chip removes it from the query and the results.
- **R6** — While the box is empty, 13 labelled hue dots are shown; tapping one searches that hue. While typing a partial brand or hue name, matching suggestions complete it in one tap.
- **R7** — The query is stored in the URL as `q`: reload and the back button restore it, and an invalid `q` type falls back to empty.
- **R8** — The list shows the first 60 results and appends more as the user scrolls, so typing stays responsive. Results update within 100 ms of the debounce on a mid-range phone.
- **R9** — No results shows "No paints match" with a "Clear search" button.
- **R10** — Accessibility (WCAG 2.1 AA):
  - The search input has a visible label or `aria-label`, a 16px font, and the 3:1 input border.
  - Chip remove buttons are named, e.g., "Remove Brand: Vallejo".
  - Hue dots are buttons with text labels.
  - Swatch colors are never the only information.
  - Every control has a visible focus ring and works by keyboard.

## Acceptance criteria

- **AC1** (R1) — Given DevTools offline before first load, when I open `/paints`, then the offline message and Retry show; going online and pressing Retry loads the list.
- **AC2** (R2) — Given `/paints`, then the list starts with the alphabetically first paint, the count reads 2,837 paints, and scrolling to the bottom keeps appending rows until all are shown.
- **AC3** (R4) — Given I type `mephston`, then Mephiston Red appears in the first results.
- **AC4** (R4, R5) — Given I type `#9A1115`, then a swatch of that red shows, results are ranked closest first with "Very close" on the top results, and a `Hex: #9A1115` chip appears.
- **AC5** (R3, R4, R5) — Given I type `vallejo red-orange`, then only Vallejo red-orange paints show, sorted light to dark, with chips `Brand: Vallejo` and `Hue: Red-Orange`. Removing the brand chip leaves all red-orange paints.
- **AC6** (R6) — Given an empty box, when I tap the Blue dot, then the box reads `blue` and only blue paints show; when I type `gree`, then a `Green` and a `Green Stuff World` suggestion appear.
- **AC7** (R7) — Given a search, when I reload, then the same query and results return; pressing back after clearing restores the previous query.
- **AC8** (R9) — Given I type `zzzzqq`, then "No paints match" and "Clear search" show, and Clear search empties the box.
- **AC9** (R10) — Given VoiceOver on an iPhone, the search field is announced with its label, result counts are announced after typing, chip remove buttons announce their names, and hue dots announce their color names.

## Test plan

Unit and component tests stay colocated under `src/` (TESTING §4). Playwright specs go in `tests/e2e/`.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R3 | `detects hex codes in every accepted form` | `src/features/catalog/parse-query.test.ts` | `#9A1115`, `9a1115`, `#abc` → `#AABBCC`; `abc` without `#` is text; `#12345` and `#GGGGGG` are text |
| T2 | R3 | `detects brands by name, short name and id, longest first` | `src/features/catalog/parse-query.test.ts` | `Vallejo`, `army painter`, `The Army Painter`, `green stuff world`, `ak interactive` → brand IDs; remaining text preserved |
| T3 | R3 | `detects hue names with spaces or hyphens` | `src/features/catalog/parse-query.test.ts` | `red-orange` and `red orange` → one `red-orange`, not red and orange; `neutral` works |
| T4 | R3 | `keeps hue words in the text when other text is present` | `src/features/catalog/parse-query.test.ts` | `vallejo red-orange` → brand + hue; `death guard green` → text `death guard green`, no hue; `vallejo mephiston red` → brand + text `mephiston red`; `#9A1115 blue` → hex + hue; `brown` stays text |
| T5 | R5 | `removes one token from the query` | `src/features/catalog/parse-query.test.ts` | Removing the brand from `vallejo red-orange` leaves `red-orange` |
| T6 | R4 | `computes CIEDE2000 and labels the distance` | `src/features/matching/delta-e.test.ts` | Same color → 0; culori reference value for a known pair; labels at 1.99 / 2 / 4.99 / 5 / 9.99 / 10 |
| T7 | R4 | `finds misspelled names and aliases` | `src/features/catalog/search.test.ts` | Small fixture catalog: `mephston` → Mephiston Red first; an alias spelling finds its paint |
| T8 | R4 | `filters by brand and hue and sorts by lightness` | `src/features/catalog/search.test.ts` | Brand + hue → intersection; hue alone → L descending |
| T9 | R4 | `ranks by distance for a hex query` | `src/features/catalog/search.test.ts` | Closest paint first, with label; brand filter still applies |
| T10 | R2 | `sorts the full catalog by name, then brand` | `src/features/catalog/search.test.ts` | Empty query → name A–Z, ties broken by brand |
| T11 | R2, R10 | `renders a swatch with the paint color and no color-only meaning` | `src/components/paint-row.test.tsx` | Row shows name, brand, line · type text; swatch has `--swatch-color` and `aria-hidden`; "Discontinued" only when set |
| T12 | R1 | `shows loading, then error with retry, then the list` | `src/features/catalog/paints-screen.test.tsx` | Mocked fetch: loading text → failure message → Retry → rows |
| T13 | R5, R6, R10 | `shows chips, hue dots and suggestions` | `src/features/catalog/paints-screen.test.tsx` | `q=vallejo` → chip button named "Remove Brand: Vallejo"; empty `q` → 13 hue dot buttons named by hue; typing `gree` → suggestion chips |
| T14 | R8, R9 | `renders 60 rows, then more, and an empty state` | `src/features/catalog/paints-screen.test.tsx` | 100-paint fixture → 60 rows, sentinel intersection → 100; nonsense query → "No paints match" + Clear search |
| T15 | R7 | `restores the query from the URL` | `src/features/catalog/paints-screen.test.tsx` | `/paints?q=blue` → input value `blue`, only blue fixtures listed; `?q=123` (number) → treated as text `123`, no crash |
| E1 | R4, R5 | `searches by name, hex, brand and hue` | `tests/e2e/catalog.spec.ts` | Against the real built catalog on iPhone 15 and Pixel 7: AC3, AC4, AC5 and the Blue dot from AC6 |
| E2 | R7 | `keeps the query across reload and back` | `tests/e2e/catalog.spec.ts` | AC7 |

**Not unit testable:**

- R8's 100 ms budget is checked by hand on a phone (and Playwright's timing, roughly).
- R10's contrast and VoiceOver behavior are manual (AC9).
- R1 offline is manual (AC1); service-worker offline is the PWA item.

## Implementation plan

1. [x] Install `fuse.js@7.5.0` and `@playwright/test@1.63.0` (exact). Touches `package.json`, `package-lock.json`.
2. [x] Tokens: `--color-input-border` (light `#8A8A8A`, dark `#666666`), `--color-swatch-edge` (light `rgb(0 0 0 / 10%)`, dark `rgb(255 255 255 / 10%)`), and `--swatch-size` (40px). Touches `src/styles/tokens.css`.
3. [x] Convert shadcn `Input`, taking the current source from the shadcn docs or CLI, to `input.tsx` + `input.css` per CODE_STYLE §5a, with tokens only, `--color-input-border`, 16px text and a focus ring. Touches `src/components/ui/input.tsx`, `input.css`.
4. [x] Matching: `deltaE(labA, labB)` with culori `differenceCiede2000` on `lab65` objects, `hexToLab`, and `matchLabel(deltaE)` with the thresholds above. T6. Touches `src/features/matching/delta-e.ts`, `delta-e.test.ts`.
5. [x] Parser and search: `parseQuery(q, brands)` returns `{ hex, brandIds, hues, text }` with token spans so a chip can remove its token; `removeToken`; `searchPaints(catalog, parsed, fuseIndex)` returns ordered results with optional `deltaE` and label. T1–T10. Touches `src/features/catalog/parse-query.ts`, `search.ts` and tests.
6. [x] Catalog loading: `loadCatalog()` fetches `/catalog.json` once (a module-level promise, reset on failure so Retry works); `useCatalog()` exposes `loading | error | ready` and `retry`, and builds the Fuse index once. Touches `src/features/catalog/load-catalog.ts`, `use-catalog.ts`.
7. [x] Components, each with a sibling `.css`. T11. Touches the files listed.
    - **`PaintSwatch`:** `--swatch-color` style prop only, `data-size`, a type icon for metallic, wash, shade, ink, contrast and speedpaint (decorative; the type is in the row text).
    - **`PaintRow`:** an `<li>` with swatch, name, brand, line · type, and the Discontinued badge.
    - **`SearchChip`:** a pill with a label and a named remove button.
    - **`HueDots`:** 13 circular buttons with text labels; dot colors come from each family's OKLCh center (L 0.65, C 0.12), with neutral as mid grey.

    Files: `src/components/paint-swatch.*`, `paint-row.*`, `search-chip.*`, `hue-dots.*`.
8. [x] Paints screen and route. T12–T15. Touches `src/routes/paints/index.tsx`, `src/features/catalog/paints-screen.tsx`, `paints-screen.css`, `paints-screen.test.tsx`; `src/test/setup.ts` (IntersectionObserver stub).
    - **Route:** `validateSearch` with Zod: `q` is an optional string; anything else becomes `undefined`.
    - **`PaintsScreen`:** a labelled `<search>`/form with `Input`, chips, suggestions, hex swatch, hue dots, an `aria-live="polite"` count, the list with a sentinel, and the empty state.
9. [x] Playwright: `playwright.config.ts` (projects iPhone 15 and Pixel 7; `webServer` runs `npm run build && npm run preview` only while the tests run), E1–E2, script `test:e2e`, ignore Playwright output folders. `check` stays without E2E. Touches `playwright.config.ts`, `tests/e2e/catalog.spec.ts`, `package.json`, `.gitignore`, `vite.config.ts` (keep Vitest away from `tests/e2e`).
10. [x] Docs. Touches the files listed.
    - **DECISIONS 019:** the input border token.
    - **DECISIONS 020:** rounded-square swatches.
    - **DECISIONS 021:** no "brown" alias for MVP.
    - **DECISIONS 022:** the match label thresholds.
    - **DESIGN_SYSTEM:** §3 token table, with the Open item resolved; §6 swatch radius; §9 Input with no `Command`, and suggestion chips; §10 swatch edge token.
    - **PRD §12:** brown answered.
    - **UX_FLOWS Flow 2:** state lives in `q` until the filters item; suggestions are chips.
    - **TESTING §7:** `test:e2e` and the browser install step.
    - **ROADMAP:** split "Paints tab" into "Paints list and smart search" and "Paints filters".
11. [x] Verify: `npm run check`, `npm run build`, `npm run test:e2e`, `prettier --check .`. Then the manual list for a phone (AC1, AC8 and AC9, VoiceOver, the 100 ms feel). Touches nothing.

**Must not change:** the catalog data and `catalog.json` shape; the app shell and nav; the routes other than `/paints`.

## Risks and open questions

- **Decision needed: the dependencies above,** especially Playwright's browser download. Without Playwright, E1–E2 become manual checks, and TESTING's E2E plan slips to a later item.
- **Decision needed: the match label thresholds** (2 / 5 / 10). They carry over to the equivalents item, so they're worth a look now.
- **Size:** about 11 steps, 15 unit and component tests and 2 E2E specs. The largest item yet, even after the split. Estimate 2–3 sessions, assuming the shadcn Input converts cleanly and Playwright installs without trouble.
- **Playwright starts a preview server while E2E runs.** That's only during `npm run test:e2e`, never the dev server, but say so if you'd rather run E2E against a server you start yourself.
- **Rows aren't tappable yet.** Until the detail item, tapping a paint does nothing. Expected, but it'll feel unfinished in a demo.
- **The catalog loads over the network on every visit until the PWA item** adds the service worker (about 91 KB gzipped).
- **Accessibility, flagged:**
  - Hue dot colors such as yellow on white are under 3:1. The text label carries the meaning, so this passes SC 1.4.11, but they may look faint.
  - Swatches of very pale paints rely on the 10% edge to stay visible; the paint name is always present, so no information is lost.
- **Search quality:** with hue words staying in the text when other words are present, a query like `dark red` is a name search for paints named "dark … red" rather than red paints. That matches how painters type names; `red` alone still gives the red family. Worth watching in testing.

## Progress log

- 2026-10-07 — Planned. Decided in conversation: split the Paints tab in two; a separate input border token; rounded-square swatches; no brown alias.
- 2026-10-07 — Approved as written, including fuse.js and Playwright and the 2 / 5 / 10 match label thresholds.
- 2026-10-07 — Implementation started in worktree `../grimify-v2-worktrees/story-paints-search` on `story/paints-search`.
- 2026-10-07 — Steps 1–11 done. `npm run check` (92 tests in 15 files; catalog valid), `npm run build`, `npm run test:e2e` (E1 and E2 on iPhone 15 and Pixel 7, 4 passed) and `prettier --check .` exit 0. Screenshots of the built app (iPhone 15, light and dark: empty, hex and chip states) checked by eye through a temporary spec, then removed. Drift:
  - A bare 6-character hex needs a digit, so words like "facade" stay text; `#` forms are unchanged. T1 covers it.
  - Added tokens beyond step 2: `--color-swatch-ink-dark/-light` (theme-independent marker ink), `--icon-size-sm` and `--row-min-height`.
  - Test setup stubs `fetch` (pending by default) and IntersectionObserver, and resets the catalog cache after each test. `src/test/catalog-fixture.ts` and `src/test/intersection-observer.ts` were added.
  - T15's numeric case became its own test, because two routers in one test don't mix. T12 holds the first fetch open, so the loading state is observed reliably.
  - `vite.config.ts` didn't need changing: Vitest's include patterns never matched `tests/e2e`. `tsconfig.node.json` now includes `playwright.config.ts` and `tests`.
  - Suggestions also appear in the screen test (T13) rather than only in unit tests; the parser's `suggest` has its own unit test.
  - Main JS bundle grew from 98 to 122 KB gzipped (culori, Fuse and Zod load with the app).
- 2026-10-07 — Staged. Version 0.2.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/paints-search`. Manual checks still open: AC1 (offline first load), AC8 on a phone, AC9 (VoiceOver), and the 100 ms feel on a mid-range phone.
- 2026-10-07 — Released. Owner approved the review. Squash-merged 13 commits from `story/paints-search` into `main` as 0.2.0 (a780962), tagged `v0.2.0`. Worktree and branch removed.
