---
type: bug
slug: title-row-glass
status: staged
branch: bug/title-row-glass
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/bug-title-row-glass
created: 2026-10-10
approved: 2026-10-10
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.14.1
review_approved: 2026-10-11
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the merge commit
---

# Desktop title row glass differs from the bar's

## Summary

From 640px the small page title row under the desktop bar diffuses the page behind it differently from the bar row above it (the back link and nav pill line), so the two read as different glass where they meet. The title row sits inside the bar, as a descendant of the header, while the bar's glass is a `::before` layer behind its items. This makes the title row a sibling of the navigation row, each carrying the same glass on itself, so both are built the same way.

## Context

Released in v0.14.0 by story-bar-title-row (DECISIONS 046). From 640px, `src/components/app-shell.tsx` renders:

```
div.app-shell__bar            sticky, grid, padding; glass on ::before (z-index -1)
  nav.app-shell__tabs
  header.app-shell__header    subgrid, no surface
    p.app-shell__title        absolute, top: 100%; its own glass
```

The `::before` layer exists only because the title row is a descendant: a `backdrop-filter` on the bar itself would make the bar the title row's backdrop root (`src/components/app-shell.css:244-246`). The two glass surfaces are built differently (a pseudo-element at `z-index: -1` inside the bar's stacking context versus an absolutely positioned descendant of a static header), and the owner sees a different diffusion on the title line than on the link-pill line.

**Reproduce:** 1280px window, /paints, scroll 300px so the title row shows over the swatches. **Observed:** the title row's blur and tint read differently from the bar row's. **Expected:** one continuous glass look across both rows.

Root cause is inferred, not proven: both surfaces compute the same `background-color` and `backdrop-filter`, so the difference comes from where each sits in the tree, not from the values. The owner asked for the structural fix: make the title row a sibling of the navigation row.

Phones are not affected: there the small title is the middle column of the sticky header, which is its own glass surface.

## Scope

**In scope**

- From 640px: a sticky wrapper (`.app-shell__bar`) holding two sibling rows, the navigation row (nav + header) and the title row, with one glass layer (the wrapper's `::before`) behind both (R6; the first version gave each row its own glass)
- The desktop title row becomes its own element outside the header; the phone keeps its small title in the header
- Updating the desktop e2e tests and the `AppShell` unit test to the new structure
- DECISIONS 046 consequence line and DESIGN_SYSTEM §11 desktop line updated to describe the sibling rows

**Out of scope**

- Glass tokens (`--color-glass`, `--glass-blur`, `--glass-saturate`) and their values
- The phone header and phone nav
- Title row timing, position, size, border and fade (R3–R7 of story-bar-title-row stay as they are)

## Requirements

- **R1** — From 640px, the title row and the navigation row (back link, tabs, status pills) are siblings: same parent, neither contains the other.
- ~~**R2** — From 640px, the navigation row and the title row each carry the glass on the element itself, with the same `background-color` and `backdrop-filter`, and no ancestor of either has a `backdrop-filter`.~~ Replaced by R6: two glass layers still showed a faint line where they meet (owner's screenshot, 2026-10-10).
- **R3** — Everything story-bar-title-row guarantees still holds: the title row sits flush under the navigation row, spans the window, centres the title, fades in only once the large title has scrolled under the bar, doesn't move content or change the bar's height, carries the bottom line, is `aria-hidden`, lets taps through, stays 4.5:1 in both themes, and is solid with reduced transparency or without blur support.
- **R4** — Below 640px nothing changes: the small title is in the header's middle column, and no desktop title row is rendered visibly or announced.
- **R5** — Landmarks keep their DOM order (banner and navigation before main), and there is still exactly one `h1`.
- **R6** — From 640px, one glass layer sits behind both rows: it covers the navigation row, and once the title row shows it extends down over the title row too, sliding over `--duration-title` while the title text fades in. Neither row has a glass background or `backdrop-filter` of its own, no ancestor of either row has a `backdrop-filter`, and no line shows between the rows. With reduced transparency or without blur support the layer is solid.

## Acceptance criteria

- **AC1** (R1, R6) — Given a 1280px window on /paints scrolled so the title row shows over the swatches, when I look where the two rows meet, then the swatch colour diffuses the same way through both.
- **AC2** (R3) — Given a desktop window, when I scroll past the large title and back, then the title row fades in and out under the bar as before, and the list doesn't jump.
- **AC3** (R4) — Given a phone, when I scroll past the large title, then the small title fades into the header as before.
- **AC4** (R5) — Given a screen reader, when I list landmarks and headings, then I get banner, navigation and main in that order and one `h1`.

## Test plan

Playwright (iPhone 15 WebKit, Pixel 7 Chromium; desktop cases set the viewport) and Vitest + Testing Library, as in the existing specs. In `tests/e2e/header.spec.ts` the desktop `smallTitle` locator moves to `.app-shell__title-row` (it's no longer inside the banner), and every `bar(page), "::before"` glass read moves to the navigation row (`.app-shell__bar-row`).

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `makes the title row a sibling of the nav row` (regression, fails today) | `tests/e2e/header.spec.ts` | Both engines, 1280px: `.app-shell__title-row.parentElement === .app-shell__bar-row.parentElement`; neither `contains()` the other; the banner doesn't contain the title row |
| ~~T2~~ (replaced by T8) | R2 | `puts the title row on the bar's glass` (updated) | `tests/e2e/header.spec.ts` | Both engines, 1280px after scrolling: nav row and title row `background-color` equal, `backdrop-filter` equal and containing `blur(16px)`; nav row `::before` has `content: none`; no ancestor of either row has a backdrop filter |
| ~~T3~~ (replaced by T9) | R2, R3 | `makes the title row solid with reduced transparency`, `makes the desktop bar solid with reduced transparency` (updated) | `tests/e2e/header.spec.ts` | Chromium CDP reduced transparency: both rows alpha 1, `backdrop-filter` none |
| T8 | R6 | `puts both rows on one glass layer` (replaces T2) | `tests/e2e/header.spec.ts` | Both engines, 1280px: the bar's `::before` has the glass alpha and `blur(16px)`; nav row and title row backgrounds transparent and `backdrop-filter` none; no ancestor of either row has a backdrop filter; at the top the layer's bottom is within 1px of the nav row's bottom; after scrolling, within 1px of the title row's bottom |
| T9 | R6 | `makes the one glass layer solid with reduced transparency` (replaces T3) | `tests/e2e/header.spec.ts` | Chromium CDP reduced transparency: the bar's `::before` alpha 1, `backdrop-filter` none |
| T4 | R3 | existing `spaces the desktop bar`, `shows the title along the bottom of the desktop bar`, `doesn't move content when the title row appears`, `draws the bar's line under the title row`, `lets taps through the title row`, `keeps the desktop title readable`, `keeps the desktop bar readable`, `merges the header and nav into one bar on desktop`, `scrolls content under the desktop bar`, `fits the desktop bar at 640px` | `tests/e2e/header.spec.ts` | Still pass with the new locators; padding assertions read the navigation row |
| T5 | R4 | existing phone tests (`collapses the title and lines the header up`, `switches the phone title as the large one slides under the header`, `keeps the header title readable`, back-link tests) plus `hides the desktop title row on phones` | `tests/e2e/header.spec.ts` | Phone: header's `.app-shell__title` behaves as before; `.app-shell__title-row` is not visible (computed `display: none`) |
| T6 | R1, R4, R5 | `renders one large title and hidden copies for the header and the title row` (updated), `shows the small title once the large one scrolls away` (updated) | `src/components/app-shell.test.tsx` | One `h1`, in `main`; header's `.app-shell__title` and `.app-shell__title-row` both have the title text and `aria-hidden="true"`; the title row is outside the banner and a sibling of `.app-shell__bar-row`; `data-scrolled` toggles on both the header and the title row with the observer |
| T7 | R5 | existing landmark-order tests | `tests/e2e/nav.spec.ts`, `src/components/app-shell.test.tsx` | Banner and navigation precede main |

**Not unit testable:** AC1's "diffuses the same way" is a visual check by the owner at 1280px on dev.grimify.app over the swatch column, in WebKit (Safari) and Chromium, light and dark. T1, T8 and T9 prove the structure and the single layer, not the rendered pixels.

## Implementation plan

1. [x] Split the desktop bar into sibling rows: wrap nav + header in `.app-shell__bar-row` (`display: contents` on phones; from 640px the grid, padding and glass move from `.app-shell__bar` and its `::before` onto it); `.app-shell__bar` becomes a surface-less sticky wrapper; render `p.app-shell__title-row` (`aria-hidden`, `data-scrolled`) after the row inside the wrapper, `display: none` on phones and the absolutely positioned glass strip from 640px; hide the header's `.app-shell__title` from 640px; drop the `::before` rule and its comment — touches `src/components/app-shell.tsx`, `src/components/app-shell.css`, `src/components/app-shell.test.tsx`, `tests/e2e/header.spec.ts` — tests T1, T2, T3, T4, T5, T6, T7
2. [x] Docs: DECISIONS 046 decision and trade-off lines name the two sibling rows (no `::before` layer); DESIGN_SYSTEM §11 desktop line notes the title row is a sibling of the navigation row — touches `docs/DECISIONS.md`, `docs/DESIGN_SYSTEM.md` — tests none (docs only)
3. [x] One glass layer behind both rows: the bar's `::before` carries the glass and grows by the title row's height when `data-scrolled` (on the bar) is true, transitioning `bottom` over `--duration-title`; the nav row and title row lose their own glass; the title row gets a fixed height so the layer can match it; readability and reduced-transparency tests read the layer — touches `src/components/app-shell.tsx`, `src/components/app-shell.css`, `src/components/app-shell.test.tsx`, `tests/e2e/header.spec.ts` — tests T1, T4, T5, T6, T7, T8, T9
4. [x] Docs: DECISIONS 046 and DESIGN_SYSTEM §11 describe one glass layer behind both rows with the slide-down reveal — touches `docs/DECISIONS.md`, `docs/DESIGN_SYSTEM.md` — tests none (docs only)

**Must not change:** landmarks and their DOM order; tab routes, labels and `aria-current`; the `PageTitle` `h1`; glass tokens; the phone header and nav; the observer's switch point (it reads the wrapper's height, which still equals the navigation row's since the title row is out of flow).

**High-risk steps:** None.

## Risks and open questions

- **Resolved 2026-10-10: the fix did not change what the owner saw.** Sibling rows still showed a faint line at the seam; replaced by one shared layer (R6, steps 3–4).
- **Was: the fix may not change what the owner sees.** The root cause is inferred. If the difference comes from the blur sampling the neighbouring glass at the shared edge (each row's blur reaches 16px past its edge into the other row), sibling rows will still differ near the seam. If AC1 fails on dev.grimify.app, the next option is one glass layer behind both rows (sized to the title row while it shows), which DECISIONS 046 rejected only for the version that moved content.
- **Two copies of the title text.** The phone's header title and the desktop title row both render the page title, both `aria-hidden`; only one is displayed at a time. Screen readers still get only the `h1`.
- **The wrapper is still a stacking context** (sticky with `z-index`), so both rows share it. That's intended: they now sit at the same level inside it, which is the point of the change.
- **The reveal is a slide, not a fade.** One layer can't fade only its lower part, so the glass slides down over the title area while the text fades (owner agreed 2026-10-10). Animating `bottom` relayouts the pseudo-element each frame for 180ms; acceptable for one small layer.
- **Selector churn in tests.** Ten desktop tests change locators; T4 keeps their assertions identical so the behaviour contract is unchanged.

## Progress log

- 2026-10-10 — Planned.
- 2026-10-10 — Plan approved.
- 2026-10-10 — Started on branch bug/title-row-glass from origin/dev.
- 2026-10-10 — Built: title row is a sibling of the nav row; user's navbar padding edit committed first (b38e4f8); full e2e suite green.
- 2026-10-10 — Revised: owner's screenshot shows a faint line between the two glass rows; R2 replaced by R6 (one glass layer on the bar's ::before, sliding down over the title row); added steps 3-4 and tests T8-T9. Owner approved the slide-down reveal.
- 2026-10-10 — Built steps 3-4: one glass layer on the bar's ::before behind both rows; full e2e suite green (56 passed, 4 skipped).
- 2026-10-10 — Review: security and a11y/privacy clean; code review 3 LOW (redundant padding-block in owner's edit, redundant data-scrolled on title row, stale doc lines). Fixed the stale doc lines.
- 2026-10-11 — Test audit: 7/7 mutations caught; two survivors (layer z-index, slide transition) closed with new T8 asserts. Left: no-blur fallback untested (manual), T9 Chromium only.
- 2026-10-11 — Staged: verification passed; version 0.14.0 → 0.14.1; no changelog file.
- 2026-10-11 — Review approved.
