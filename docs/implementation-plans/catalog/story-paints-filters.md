---
type: story
slug: paints-filters
status: released
branch: story/paints-filters
worktree_path: ../grimify-v2-worktrees/story-paints-filters
created: 2026-10-07
approved: 2026-10-07
version: 0.3.0
tag: v0.3.0
merge_commit: 5862a86 (squash of story/paints-filters)
---

# Paints filters

## Summary

Add a Filters bottom sheet to the Paints tab for brand, product line, paint type and hue, stored in the URL as `brand`, `line`, `type` and `hue` (UX_FLOWS Flow 2, PRD Feature 1). It completes the Paints tab started by `story-paints-search` (v0.2.0): browsing a single line ("Vallejo Model Air") or a type ("every metallic") is awkward by typing alone.

## Context

ROADMAP NOW: "Paints filters: bottom sheet with brand, line, type and hue (URL state)". The Owned/Wishlist filter waits for auth.

Decisions made in conversation on 2026-10-07:

- **Sheet, not Drawer.** shadcn's Drawer is built on `vaul`, whose README says "This repo is unmaintained" (last release 1.1.2, December 2024). The sheet is shadcn's Sheet (`side="bottom"`) on `@radix-ui/react-dialog`, which brings a focus trap, Escape, focus return and a labelled dialog. There's no swipe-to-dismiss. DESIGN_SYSTEM §11 changes from Drawer to Sheet.
- **Search box and sheet combine.** The box stays free text with its own detected chips (`q`). The sheet sets separate `brand` / `line` / `type` / `hue` params. Everything ANDs together, and all chips show in one row. Typing "vallejo" doesn't tick Vallejo in the sheet; the chips make any conflict visible. Option C (sheet mirrors typed terms) is the follow-up if testing shows confusion.

Code today:

- `src/routes/paints/index.tsx` validates `q` with Zod.
- `src/features/catalog/paints-screen.tsx` renders the search, chips, hue dots and list.
- `searchPaints` filters by the parsed query.
- `HueDots` is a one-shot picker.
- `SearchChip` handles removal.

## Dependencies (need your approval)

| Package | Version | Kind | Why |
|---|---|---|---|
| @radix-ui/react-dialog | 1.2.0 | runtime | The Sheet's accessible modal behavior. Same Radix family and `react-slot` 1.4.0 as the existing Button; published 2026-10-06 |

Checkboxes are native `<input type="checkbox">` styled in CSS, so `@radix-ui/react-checkbox` isn't needed.

## Behavior

**URL**

- Each filter is a comma-separated list of IDs: `?q=red&brand=citadel,vallejo&line=vallejo-model-air&type=metallic,air&hue=blue`.
- `type` and `hue` are validated against the schema enums; unknown values are dropped.
- `brand` and `line` accept any kebab-case ID; IDs not in the catalog are ignored once it loads.
- Empty lists are left out of the URL.

**Filter logic**

- Within one filter, values are ORed; across filters, and with `q`, they're ANDed.
- A selected line restricts its own brand only. With Citadel and Vallejo picked and only "Vallejo Model Air" ticked, every Citadel paint stays plus Model Air from Vallejo.
- The `hue` param always filters, even with text typed, because it's an explicit choice. The hue-word rule only applies to typed hues.

**Sheet**

- **Opening:** a "Filters" button sits beside the search box. With filters active, its label shows the count ("Filters · 2"), and its accessible name is "Filters, 2 active".
- **Title:** "Filters".
- **Brand:** checkboxes for the six brands.
- **Product line:** appears only when at least one brand is ticked. It lists the lines of the ticked brands, grouped by brand. Unticking a brand drops its lines.
- **Type:** checkboxes for the types present in the catalog, in catalog order, with counts.
- **Hue:** the 13 hue dots as toggle buttons (`aria-pressed`).
- **Footer (sticky):** "Clear all" and a primary "Show N paints" button. N updates live from the sheet's draft, combined with the current `q`.
- **Draft and commit:** the sheet edits a draft. "Show N paints" writes it to the URL as one history entry (Back undoes it) and closes the sheet. Escape, the close button and tapping outside discard the draft.

**Chips:** filter chips join the chip row ("Brand: Citadel", "Line: Model Air", "Type: Metallic", "Hue: Blue"). Removing one writes a new history entry.

**Empty state:** "No paints match" with "Clear all", which clears `q` and every filter. This replaces "Clear search".

## Scope

**In scope**

- `@radix-ui/react-dialog`; shadcn Sheet converted to `sheet.tsx` + `sheet.css` (bottom side only, tokens only, safe-area padding, reduced-motion respected)
- `--color-overlay` token and a sheet max-height token
- Filter param parsing and serializing, filter application in `searchPaints`, line options per brand
- `PaintsFilters` sheet component; Filters button; filter chips; `HueDots` gains an optional pressed state
- Route `validateSearch` for the four params; "Clear all" in the empty state
- Unit, component and E2E tests; docs

**Out of scope**

- Owned / Wishlist filter (auth and collection items)
- Mirroring typed brands and hues in the sheet (option C, a later follow-up if needed)
- Swipe-to-dismiss
- Hiding discontinued paints (PRD TBD; still no discontinued paints)
- Lazy-loading the search code to shrink the 122 KB bundle

## Requirements

- **R1** — The URL holds `brand`, `line`, `type` and `hue` as comma-separated lists. Reload and Back restore them, invalid `type` and `hue` values are dropped, and unknown brand and line IDs are ignored.
- **R2** — Filters combine with each other and with `q` as described (OR within, AND across, line restricts only its own brand, `hue` param always filters).
- **R3** — A Filters button opens a bottom sheet titled "Filters" with Brand, Product line (only when a brand is ticked, limited to ticked brands), Type and Hue sections. The button announces how many filters are active.
- **R4** — The sheet edits a draft. "Show N paints" shows the live count for the draft plus the current query, commits it as one history entry and closes. Escape, close and outside-tap discard it. "Clear all" empties the draft.
- **R5** — Each active filter value appears as a removable chip next to the search chips; removing one updates the URL as a new history entry.
- **R6** — The empty state offers "Clear all", which clears `q` and every filter.
- **R7** — Accessibility (WCAG 2.1 AA):
  - The sheet is a modal dialog named "Filters" that traps focus and returns focus to the Filters button on close.
  - Every checkbox and hue toggle has a visible text label and a target of at least 44px.
  - Pressed hue toggles are distinguishable without color: a check mark and `aria-pressed`.
  - Overlay and sheet respect safe-area insets and reduced motion.

## Acceptance criteria

- **AC1** (R3, R4) — Given `/paints`, when I open Filters, tick Vallejo and Metallic, then the button reads "Show N paints" with the right N; tapping it closes the sheet, the list shows only Vallejo metallics, and the URL has `brand=vallejo&type=metallic`.
- **AC2** (R3) — Given the sheet with Vallejo ticked, then a Product line section lists only Vallejo's 14 lines. Unticking Vallejo hides it and drops any ticked Vallejo line.
- **AC3** (R4) — Given filters applied, when I reopen the sheet, change things and press Escape, then the URL and list are unchanged.
- **AC4** (R1, R5) — Given filters applied, when I reload, then they persist. When I remove the "Type: Metallic" chip and press Back, then it returns.
- **AC5** (R2) — Given `q=citadel` typed and Vallejo ticked in the sheet, then "No paints match" shows with both brand chips visible. Clear all empties everything.
- **AC6** (R7) — Given VoiceOver on an iPhone, the sheet is announced as "Filters, dialog". Checkboxes and hue toggles announce their state, and closing returns to the Filters button.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `parses and serializes filter params` | `src/features/catalog/filters.test.ts` | `"vallejo,citadel"` → `["vallejo","citadel"]`; empty and repeated values cleaned; `type=metallic,glaze` keeps `metallic`; serialize omits empty lists and keeps order |
| T2 | R2 | `combines filters with OR within and AND across` | `src/features/catalog/search.test.ts` | Brand Citadel + Vallejo with type metallic → only metallics from both; adding `q` text intersects further |
| T3 | R2 | `restricts lines to their own brand` | `src/features/catalog/search.test.ts` | Brands Citadel + Vallejo, line `vallejo-model-air` → all Citadel paints + Vallejo Model Air only |
| T4 | R2 | `applies the hue param even with text` | `src/features/catalog/search.test.ts` | `q=blue steel`-style text plus `hue=blue` → only blue paints matching the text |
| T5 | R3 | `lists lines for ticked brands and prunes the rest` | `src/features/catalog/filters.test.ts` | `lineOptions(catalog, ["vallejo"])` → Vallejo lines; `pruneLines` drops lines whose brand was unticked |
| T6 | R3, R4, R7 | `edits a draft and commits it with Show` | `src/features/catalog/paints-filters.test.tsx` | Open → dialog named "Filters"; tick a brand → Product line appears; count text updates; Show → `onApply` called with the draft and dialog closes |
| T7 | R4, R7 | `discards the draft on Escape and returns focus` | `src/features/catalog/paints-filters.test.tsx` | Change, Escape → `onApply` not called; focus back on the Filters button |
| T8 | R4 | `clears the draft with Clear all` | `src/features/catalog/paints-filters.test.tsx` | Clear all → nothing ticked, count = all paints for the current `q` |
| T9 | R3, R7 | `shows pressed state on hue toggles` | `src/components/hue-dots.test.tsx` | With `pressed`, buttons expose `aria-pressed`; without it, they don't |
| T10 | R1, R5, R6 | `shows filter chips and clears everything` | `src/features/catalog/paints-screen.test.tsx` | `/paints?brand=vallejo&type=metallic` → chips "Remove Brand: Vallejo", "Remove Type: Metallic", Filters button named "Filters, 2 active"; removing a chip updates the URL; a no-match combination → Clear all → URL has no params |
| E1 | R1–R5 | `filters by brand and type through the sheet` | `tests/e2e/catalog.spec.ts` | AC1 and AC4 on iPhone 15 and Pixel 7 |

**Not unit testable:** AC6 (VoiceOver) and the sheet's look, safe areas and motion on a real phone are manual.

## Implementation plan

1. [x] Install `@radix-ui/react-dialog@1.2.0` (exact). Touches `package.json`, `package-lock.json`.
2. [x] Tokens: `--color-overlay` (light and dark), `--sheet-max-height` (85dvh). Touches `src/styles/tokens.css`.
3. [x] Convert shadcn Sheet, taking the current source from the shadcn registry. Keep Root, Trigger, Portal, Overlay, Content (bottom only), Header, Title, Description, Footer and Close. Sibling CSS, tokens only, `data-state` slide and fade animations, safe-area bottom padding, scrollable body, sticky footer. Touches `src/components/ui/sheet.tsx`, `sheet.css`.
4. [x] Filters logic with T1, T5: a `Filters` type, `parseFilterParam`, `serializeFilters`, `lineOptions`, `pruneLines`, `countActive`. Touches `src/features/catalog/filters.ts`, `filters.test.ts`.
5. [x] `searchPaints` takes `filters` and applies them per R2. T2–T4. Touches `src/features/catalog/search.ts`, `search.test.ts`.
6. [x] `HueDots` gains an optional `pressed` set (`aria-pressed`, a check mark, `data-layout="wrap"` for the sheet). T9. Touches `src/components/hue-dots.tsx`, `hue-dots.css`, `hue-dots.test.tsx`.
7. [x] `PaintsFilters` sheet: Filters button (trigger) with active count, sections, draft state, live count, footer. T6–T8. Touches `src/features/catalog/paints-filters.tsx`, `paints-filters.css`, `paints-filters.test.tsx`.
8. [x] Wire the route and screen: `validateSearch` for the four params; the screen passes filters to search, renders the Filters button, filter chips and "Clear all". The route's `onQueryChange` keeps filters while typing, and a new `onFiltersChange` keeps `q`. T10. Touches `src/routes/paints/index.tsx`, `src/features/catalog/paints-screen.tsx`, `paints-screen.css`, `paints-screen.test.tsx`.
9. [x] E1. Touches `tests/e2e/catalog.spec.ts`.
10. [x] Docs. Touches the files listed.
    - **DECISIONS 023:** Sheet on Radix Dialog instead of a vaul Drawer.
    - **DECISIONS 024:** search box and filters combine.
    - **DESIGN_SYSTEM:** §11 Drawer → Sheet; §12 empty state Clear all; §3 overlay token.
    - **UX_FLOWS:** Flow 2 steps 3–5 match the draft and commit behavior and the URL format.
    - **ROADMAP:** none (the item already exists).
11. [x] Verify: `npm run check`, `npm run build`, `npm run test:e2e`, `prettier --check .`, plus screenshots of the open sheet in light and dark through a temporary spec, removed afterwards. Touches nothing.

**Must not change:** `q` behavior from paints-search (parser rules, chips, hue dots on an empty box, URL key); catalog data.

## Risks and open questions

- **Decision needed: `@radix-ui/react-dialog`.** It's the only new package.
- **Two sources for brand and hue (decided, A).** "vallejo" typed plus Citadel ticked shows nothing. The chips explain it, but watch for confusion in beta.
- **Draft and commit can surprise.** Someone who ticks boxes and taps outside loses the changes. That's standard for "Show N" sheets (closing means cancel), but if beta users expect auto-apply, switching is a contained change.
- **Long line lists:** Vallejo has 14 lines and AK 9; with several brands ticked the sheet gets long. The body scrolls and the footer stays visible. Collapsible sections are a possible later refinement.
- **Accessibility:**
  - Native checkboxes styled with `accent-color: var(--color-primary)` keep their native focus and state semantics. In dark mode, near-white Primary on a dark Surface must keep the check visible; I'll verify in the screenshots.
  - The overlay's dimming isn't a boundary, so it doesn't need 3:1; the sheet edge is defined by its background against the overlay.
- **Estimate:** 1.5–2 sessions, assuming the shadcn Sheet converts cleanly.

## Progress log

- 2026-10-07 — Planned. Decided in conversation: Sheet on Radix Dialog instead of the vaul Drawer; search box and filters combine (option A).
- 2026-10-07 — Approved as written, including `@radix-ui/react-dialog`.
- 2026-10-07 — Implementation started in worktree `../grimify-v2-worktrees/story-paints-filters` on `story/paints-filters`.
- 2026-10-07 — Steps 1–11 done. `npm run check` (102 tests in 18 files; catalog valid), `npm run build` (main bundle unchanged at 122 KB gzipped; the sheet code is in the route chunk), `npm run test:e2e` (6 passed: 3 journeys × 2 devices) and `prettier --check .` exit 0. Screenshots of the open sheet (iPhone 15, light and dark) and the combined chip row checked by eye, then the temporary spec was removed. Ticked native checkboxes stay clear in dark mode (white box, dark check). Drift:
  - The Sheet gained a `SheetBody` part (not in shadcn) for the scrolling middle; the close button is 44px with `aria-label="Close"` instead of shadcn's visually hidden text.
  - Tokens beyond step 2: `--duration-medium` (250 ms slide) and `--option-column-min-width` (10rem checkbox columns).
  - `HueDots` also takes a `label` prop, so the sheet's list is named "Hue".
  - A hue filter from the sheet also triggers light-to-dark sorting when no text is typed, matching a typed hue.
  - The paints-search test for the empty state now expects "Clear all" (R6 renames it).
  - T2–T4 use their own fixture catalog, so the paints-search expectations stay untouched.
- 2026-10-07 — Staged. Version 0.3.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/paints-filters`. Manual checks still open: AC6 (VoiceOver) and the sheet's feel, safe areas and motion on a real phone.
- 2026-10-07 — Released. Owner approved the review. Squash-merged 13 commits from `story/paints-filters` into `main` as 0.3.0 (5862a86), tagged `v0.3.0`. Worktree and branch removed.
