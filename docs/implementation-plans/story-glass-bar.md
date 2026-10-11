---
type: story
slug: glass-bar
status: released
branch: story/glass-bar
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-glass-bar
created: 2026-10-09
approved: 2026-10-09
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.13.0
review_approved: 2026-10-09
pr:                  # set by `wi pr`
tag: v0.13.0
---

# Visible phone glass and one glass bar on desktop

## Summary

Makes the frosted glass visible on phones and replaces the desktop's two stacked glass layers (a sticky header with a floating nav pill inside it) with one full-width glass bar. On a phone the nav bar read as solid white even with swatches under it, because 70% Surface over a 16px blur washes the colours out. The glass gets thinner, theme by theme, down to the lowest opacity that keeps text at 4.5:1, plus a saturation boost so colours show through. From 640px the back link, the tabs and the status pills share one sticky glass bar that page content scrolls under.

## Context

The owner tried the app on a phone: "The bar looks solid when colors are under the bar." It's styled as glass (DECISIONS 039): `--color-glass` is Surface at 70% with `--glass-blur` 16px. The blur mixes small swatches with the white gaps between them, and 70% white on top leaves almost nothing visible.

On desktop (from 640px, `src/components/app-shell.css`) the sticky header reserves a strip at the top (`--app-shell-nav-reserve`) and the nav pill floats in it, fixed. Content never scrolls behind the nav, so the nav's glass only ever shows the header. The owner asked for "one cohesive glass effect navbar" on desktop and picked a full-width bar: back link left, tabs centred, status pills right, content scrolling under it, no small collapsing title on desktop (the large page title stays).

The header (DECISIONS 040) shares the glass token, so the thinner glass also reaches the phone header.

Contrast floor, from the WCAG 2.1 contrast formula with the glass blended over pure black and pure white (the method `tests/e2e/nav.spec.ts` already uses):

| Theme | Text | Glass alpha needed for 4.5:1 | Chosen | Ratio at chosen |
|---|---|---|---|---|
| Light (Surface `#fff`) | `#0a0a0a` | at least ~47% | 50% | ~4.9:1 (over black) |
| Dark (Surface `#171717`) | `#fafafa` | at least ~60% | 62% | ~4.8:1 (over white) |

These are my hand calculations (inferred); the e2e tests measure the real rendered values. The active pill and focus rings need 3:1 and clear it with room at these alphas.

## Scope

**In scope**

- Thinner glass per theme and a saturation boost on every glass surface (phone nav, phone header, desktop bar)
- One sticky full-width glass bar from 640px holding the back link, tabs and status pills
- Solid fallbacks for the new bar
- DECISIONS entry amending 039 and 040; DESIGN_SYSTEM §11 and the tokens table; UX_FLOWS page-title line

**Out of scope**

- Changing the DOM order or landmarks (nav "Main", then banner, then main)
- A separate layout for tablet vs. desktop: the existing 640px breakpoint stays the one switch point
- The phone layout (bottom floating nav, sticky header with small title) beyond the glass values

## Requirements

- **R1** — Glass surfaces use Surface at 50% (light) / 62% (dark) with a 16px blur and a 180% saturation boost behind it.
- **R2** — On every glass surface in both themes, over glass blended with black and with white: text is at least 4.5:1, the active pill and focus rings at least 3:1.
- **R3** — From 640px, one sticky glass bar spans the window at the top. The back link sits at the left and the status pills at the right of the content column; the tabs are centred in the bar and share its row. The nav has no background, border, shadow or blur of its own there, and the header has no separate glass.
- **R4** — From 640px, page content scrolls under the bar: nothing is reserved above it, and the bar sits at the top of the window (plus the top safe-area inset).
- **R5** — From 640px the small header title isn't shown. The large page title stays the page's `h1`, and the bar's bottom border still appears once it scrolls under the bar.
- **R6** — At 640px with the back link and both status pills showing, the back link, tabs and pills don't overlap, nothing leaves the screen, there's no sideways scroll, and tab labels stay on one line (pill text may wrap).
- **R7** — Where `backdrop-filter` or `color-mix()` is unsupported, or `prefers-reduced-transparency: reduce` matches, the desktop bar is solid and has no backdrop filter (the phone fallbacks stay as they are).
- **R8** — Below 640px the layout is unchanged: bottom floating nav bar, sticky header with the collapsing small title. The landmarks and their order are unchanged.

## Acceptance criteria

- **AC1** (R1) — Given a phone on the Paints list, when swatches scroll under the nav bar, then their colours show through it.
- **AC2** (R2) — Given either theme, when a black or white area is under any glass surface, then labels, the active pill and focus rings stay readable.
- **AC3** (R3) — Given a desktop window, when I open any screen, then one glass bar across the top holds the back link (where there is one), the three tabs and any status pills, with no pill-shaped nav sitting on a separate header.
- **AC4** (R4) — Given a desktop window, when I scroll the Paints list, then swatches pass under the whole bar and show through it.
- **AC5** (R5) — Given a desktop window, when I scroll past the large title, then no small title appears in the bar and the bar's bottom border shows.
- **AC6** (R6) — Given a 640px window offline with a pending change on a paint page, when I look at the bar, then nothing overlaps or runs off screen.
- **AC7** (R7) — Given reduced transparency, when I open the app on desktop, then the bar is solid.
- **AC8** (R8) — Given a phone, when I open the app, then the nav is at the bottom and the header behaves as before.

## Test plan

Playwright runs as iPhone 15 (WebKit) and Pixel 7 (Chromium); desktop cases set the viewport.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R7 | `frosts the bar where it can` (updated) | `tests/e2e/nav.spec.ts` | Chromium: phone nav `backdrop-filter` has `blur(16px)` and `saturate(1.8)`; background alpha 0.5 light, 0.62 dark; with reduced transparency, `none` and alpha 1 |
| T2 | R2 | `keeps nav text readable over any swatch` (unchanged, re-run) | `tests/e2e/nav.spec.ts` | Phone nav labels at least 4.5:1, pill and ring at least 3:1 at the new alphas, both themes |
| T3 | R2 | `keeps the header title readable`, `keeps the back link's focus ring visible on the glass` (unchanged, re-run) | `tests/e2e/header.spec.ts` | Phone header text 4.5:1 and ring 3:1 at the new alphas |
| T4 | R3 | `merges the header and nav into one bar on desktop` | `tests/e2e/header.spec.ts` | At 1280px and 768px: back link, tabs and pills share a row (vertical centres within 2px); back link left and pills right aligned to the content column; tabs centred in the window; nav background alpha 0, no border, `backdrop-filter` none; header `backdrop-filter` none; the bar spans the window and (Chromium) has the glass blur |
| T5 | R4 | `scrolls content under the desktop bar` | `tests/e2e/header.spec.ts` | At 1280px after scrolling 300px: the bar's top is at 0 and its height is the header height (no reserved strip); the element under a point inside the bar but outside its controls is page content behind it (`elementsFromPoint` lists a `main` descendant) |
| T6 | R5 | `drops the small title on desktop` | `tests/e2e/header.spec.ts` | At 1280px the small title is not visible before or after scrolling; the `h1` is still present; the bar's bottom border colour is transparent at the top and `--color-border` after scrolling 300px |
| T7 | R2 | `keeps the desktop bar readable` | `tests/e2e/header.spec.ts` | At 1280px, both themes: inactive tab labels 4.5:1, active pill and the back link and tab focus rings 3:1, over the bar's glass blended with black and white |
| T8 | R6 | `fits the desktop bar at 640px` | `tests/e2e/header.spec.ts` | At 640px on a paint page, offline, pending text set: back link, nav and each status pill boxes don't intersect; all right edges at most 640; `scrollWidth` at most 640; each tab label on one line |
| T9 | R7 | `makes the desktop bar solid with reduced transparency` | `tests/e2e/header.spec.ts` | Chromium, 1280px, reduced transparency emulated through CDP: bar alpha 1, `backdrop-filter` none |
| T10 | R8 | `lays the nav out per screen size` (updated), `collapses the title and lines the header up` (updated) | `tests/e2e/nav.spec.ts`, `tests/e2e/header.spec.ts` | Phone widths: bottom bar insets unchanged; header still sticky at top 0 after scrolling; small title still fades in. The desktop checks in these two tests move to T4/T6 (top inset and small-title centring no longer apply) |
| T11 | R8 | existing `AppShell` unit tests (unchanged) | `src/components/app-shell.test.tsx` | One "Main" nav before the banner and main; tab names and `aria-current` unchanged |

**Not unit testable:** R1's "colours show through" (AC1, AC4) is a visual judgment; checked by hand on a phone and a desktop browser against `dev.grimify.app` once deployed.

## Implementation plan

1. [x] One glass bar from 640px: wrap the nav and header in a `div.app-shell__bar` (`display: contents` below 640px, so nothing changes on phones); from 640px it's the sticky full-width glass grid, the header joins it through `subgrid`, the nav loses its own glass, border, shadow and fixed position, the nav-reserve strip goes, and the small title is hidden — touches `src/components/app-shell.tsx`, `src/components/app-shell.css`, `tests/e2e/header.spec.ts`, `tests/e2e/nav.spec.ts` — tests T4, T5, T6, T7, T8, T9, T10, T11
2. [x] Thinner glass with a saturation boost: per-theme `--color-glass` alpha and a `--glass-saturate` token, used by every glass rule — touches `src/styles/tokens.css`, `src/components/app-shell.css`, `tests/e2e/nav.spec.ts` — tests T1, T2, T3
3. [x] Docs: DECISIONS 045 amending 039 and 040; DESIGN_SYSTEM §11 (header, nav bar, contrast) and the tokens table; UX_FLOWS page-title line — touches `docs/DECISIONS.md`, `docs/DESIGN_SYSTEM.md`, `docs/UX_FLOWS.md` — tests none (docs only)

**Must not change:** the landmarks ("Main" `nav`, `banner`, `main`) and their DOM order; tab routes, labels and `aria-current`; the `PageTitle` `h1` and tab titles; the phone layout apart from glass values.

**High-risk steps:** None.

## Risks and open questions

- **Blocking: no `dev` branch yet.** `base_branch` is `dev`, and `wi start` branches from `origin/dev`, which doesn't exist until the environment setup from task-deploy-environments is pushed (push `main` and `v0.12.3`, create and push `dev` and `stage`, record the dev and stage Convex deployments). That needs the owner's go-ahead before build.
- **The phone glass is only modestly thinner.** Light mode can drop to 50%, dark only to 62%, because white text needs a dark enough backdrop. The saturation boost does most of the visible work. If it still reads as solid on the phone, the next lever is a smaller blur, not a lower alpha.
- **Focus order on desktop.** The DOM keeps the nav before the header, so Tab reaches the tabs before the back link that sits to their left. Same as today's desktop order, but it's now one row; flagged for the a11y review against SC 2.4.3.
- **`display: contents` on the wrapper.** It has no role, so the old Safari bug that dropped roles from `display: contents` elements doesn't reach the `nav` or `header` inside it. The sticky phone header inside it needs checking in WebKit (T10).
- **`subgrid`** needs Safari 16, Chrome 117, Firefox 71. Older browsers lay the bar out in one column; acceptable, not tested.
- **Large text at 640px.** With large system text the pills wrap inside their column and the bar grows taller; the tabs' one-line rule (DECISIONS 039) may not hold at extreme sizes. T8 covers default text only.
- **Cached app.** The installed PWA may show the old build until it updates; check the phone after the update prompt.
- **Breakpoint.** "Desktop" is taken as the existing 640px switch point, so tablets get the bar too (default; say if desktop should start later).

## Progress log

- 2026-10-09 — Planned.
- 2026-10-09 — Plan approved.
- 2026-10-09 — Started on branch story/glass-bar from origin/dev.
- 2026-10-09 — Step 1 done. T4 checks the status-pill group against the tabs' row (both pills stack at 768px, allowed by R6) and T5 allows the bar's 1px border; T4 also checks the large title against the content column.
- 2026-10-09 — All steps done; full e2e suite 36 passed, 4 skipped (Chromium-only on WebKit).
- 2026-10-09 — Staged: verification passed; version 0.12.3 → 0.13.0; no changelog file.
- 2026-10-09 — Review approved.
- 2026-10-09 — Released 0.13.0 as v0.13.0.
