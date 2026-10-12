---
type: story
slug: bar-title-row
status: released
branch: story/bar-title-row
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-bar-title-row
created: 2026-10-09
approved: 2026-10-09
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.14.0
review_approved: 2026-10-09
pr:                  # set by `wi pr`
tag: v0.14.0
---

# Plain glass phone nav and a title row in the desktop bar

## Summary

Brings the phone's bottom nav bar and the desktop bar to the same plain glass, gives the desktop bar more breathing room, and brings the small page title back on desktop as a row along the bottom of the bar once the large title has scrolled under it. On dev.grimify.app the owner saw swatch colour glow through the desktop bar but not the phone's bottom bar, which still had its own outline and shadow; and the desktop bar felt tight and lost its page title on scroll.

## Context

Released in v0.13.0 (story-glass-bar, DECISIONS 045): every glass surface uses `--color-glass` (50% light, 62% dark) with blur and saturation. From 640px the nav and header are one sticky glass bar (`.app-shell__bar`, `src/components/app-shell.css`) and the small title is hidden.

What the owner asked for after trying dev.grimify.app:
- "On mobile the top navbar and floating bottom navbar should have the same glass effect as the top navigation bar," with a desktop screenshot showing a swatch glowing through the bar. Screenshots show the glass values are identical; the phone's bottom bar differs by its `1px` outline and `--shadow-md`, and by the solid active pill sitting over the swatch column. Agreed: drop the outline and shadow, keep the solid pill (its label must stay 4.5:1 over any swatch).
- "On desktop add more spacing to the top navbar, then when the title is under the navbar, add it to the bottom of the navbar."

The small title already exists (`.app-shell__title`, `aria-hidden`, shown when `data-scrolled="true"` from an `IntersectionObserver` on the large title). The observer's `rootMargin` uses the header's height (`app-shell.tsx:49`); on desktop the bar is taller than the header once it has padding.

## Scope

**In scope**

- Phone bottom nav: no outline, no shadow
- Desktop bar: `--space-3` above and below its row
- Desktop small title: a row along the bottom of the bar, same glass, fading in once the large title has scrolled under the bar, overlaying the content instead of pushing it down
- The bar's bottom border moves to the bottom of the title row on desktop
- DECISIONS 046 amending 045; DESIGN_SYSTEM §11; UX_FLOWS page-title line

**Out of scope**

- The active pill stays a solid Primary fill
- The phone header (already the same glass, with its back link and small title)
- A back button on more screens: the owner asked for "a back button" on mobile; phones already show one on paint pages. Waiting on which screen they meant (see Risks)

## Requirements

- **R1** — Below 640px, the nav bar has no border and no shadow, in both themes; its glass, shape, position and active pill are unchanged.
- **R2** — From 640px, the bar has `--space-3` of space above and below its row of back link, tabs and status pills (plus the top safe-area inset above).
- **R3** — From 640px, once the large title has scrolled under the bar, a small copy of the page title shows in a row along the bottom of the bar, centred in the window, on the same glass; it fades in and out as on phones and is hidden while the large title is visible.
- **R4** — The title row appearing or disappearing doesn't move the page content or change the bar's own height.
- **R5** — From 640px, the bar shows no bottom border while the large title is visible; once the title row shows, a `--color-border` line sits at the title row's bottom edge.
- **R6** — The title row is `aria-hidden`, ignores taps (a tap on it reaches the content under it), and with reduced transparency or without blur support it's solid like the bar.
- **R7** — The title row's text is at least 4.5:1 over its glass blended with black and with white, in both themes.
- **R8** — Everything else from 045 holds: one row with tabs centred, content under the bar, phone layout, landmarks and DOM order.

## Acceptance criteria

- **AC1** (R1) — Given a phone, when I scroll the Paints list, then the bottom bar has no outline or shadow and colour shows through it where it isn't covered by the active pill.
- **AC2** (R2) — Given a desktop window, when I look at the bar, then the tabs have visible room above and below.
- **AC3** (R3, R5) — Given a desktop window on Paints, when I scroll past the large title, then "Paints" fades in along the bottom of the bar with a line under it.
- **AC4** (R4) — Given a desktop window, when the title row appears, then the list doesn't jump.
- **AC5** (R6) — Given the title row is showing, when I click on it, then the paint row under it gets the click.
- **AC6** (R7) — Given dark or light mode, when a black or white area is under the title row, then the title stays readable.
- **AC7** (R8) — Given a phone, when I use the app, then the header and bottom bar behave as before apart from the outline and shadow.

## Test plan

Playwright (iPhone 15 WebKit, Pixel 7 Chromium); desktop cases set the viewport. Helpers as in the existing specs.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `keeps the phone bar plain glass` | `tests/e2e/nav.spec.ts` | Phone width, light and dark: nav border widths all `0px`, `box-shadow` `none`; background alpha still the glass (0.5 / 0.62) and active pill still filled |
| T2 | R2 | `spaces the desktop bar` | `tests/e2e/header.spec.ts` | At 1280px and 768px: top of the first tab minus top of the bar is at least 12px + tab padding, and bar bottom (excluding the title row) minus tab bottom at least 12px; measured as the bar's computed `padding-top`/`padding-bottom` = 12px |
| T3 | R3 | `shows the title along the bottom of the desktop bar` (replaces `drops the small title on desktop`) | `tests/e2e/header.spec.ts` | At 1280px on /paints: small title opacity 0 at the top; after scrolling 300px opacity 1, text "Paints", its top within 1px of the bar's bottom edge, its centre within 2px of the window centre, its box spanning the window; scrolling back fades it out |
| T4 | R4 | `doesn't move content when the title row appears` | `tests/e2e/header.spec.ts` | At 1280px: the bar's height and the document offset (`rect.top + scrollY`) of the first paint row are the same before and after the title row turns on (scroll to just before and just after the switch point) |
| T5 | R5 | `draws the bar's line under the title row` | `tests/e2e/header.spec.ts` | At 1280px: at the top the bar's and title row's bottom borders are transparent; after scrolling the title row's bottom border is `--color-border` and the bar's own stays transparent |
| T6 | R6 | `lets taps through the title row` | `tests/e2e/header.spec.ts` | At 1280px after scrolling: the title is `aria-hidden`; `elementFromPoint` at the title row's centre is inside `main` |
| T7 | R3, R6 | `puts the title row on the bar's glass`, `makes the title row solid with reduced transparency` | `tests/e2e/header.spec.ts` | Both engines, 1280px: title row alpha equals the bar's glass, it has the blur, and no ancestor has a backdrop filter. Chromium only, CDP reduced transparency: title row background alpha 1, `backdrop-filter` none |
| T8 | R7 | `keeps the desktop title readable` | `tests/e2e/header.spec.ts` | At 1280px after scrolling, light and dark: title text at least 4.5:1 over the title row's glass blended with black and white |
| T9 | R8 | existing `merges the header and nav into one bar on desktop`, `scrolls content under the desktop bar`, `fits the desktop bar at 640px`, `keeps the desktop bar readable`, phone tests and `AppShell` unit tests | `tests/e2e/header.spec.ts`, `tests/e2e/nav.spec.ts`, `src/components/app-shell.test.tsx` | Still pass; T5-of-045's "no strip reserved" check is updated to allow the bar's padding (bar height = header height + 2 × 12px + border) |

**Not unit testable:** AC1's "colour shows through" is a visual check on a phone at dev.grimify.app.

## Implementation plan

1. [x] Desktop title row and spacing: from 640px the bar gets `--space-3` block padding; the small title is shown again, positioned below the bar's row as a full-width glass strip (absolutely positioned against the sticky bar, so it overlays content), carrying the bottom border; the bar's own border goes on desktop; the observer's `rootMargin` uses the bar's height when it has one — touches `src/components/app-shell.tsx`, `src/components/app-shell.css`, `tests/e2e/header.spec.ts` — tests T2, T3, T4, T5, T6, T7, T8, T9
2. [x] Plain glass phone nav: remove the nav's border and shadow below 640px (and the now-unused dark-mode shadow rule) — touches `src/components/app-shell.css`, `tests/e2e/nav.spec.ts` — tests T1, T9
3. [x] Docs: DECISIONS 046 amending 045; DESIGN_SYSTEM §11 (header, nav bar look, behaviour); UX_FLOWS page-title line — touches `docs/DECISIONS.md`, `docs/DESIGN_SYSTEM.md`, `docs/UX_FLOWS.md` — tests none (docs only)

**Must not change:** landmarks and their DOM order; tab routes, labels and `aria-current`; the `PageTitle` `h1`; glass tokens; the phone header.

**High-risk steps:** None.

## Risks and open questions

- **Open (not blocking): the back button.** The owner asked to "add a back button" on mobile. Paint pages already have one; the tab screens have nowhere to go back to. Waiting on which screen they meant; if it needs work, it's its own item.
- **Faint phone bar edge.** Without the outline and shadow, the bottom bar's edge on a plain screen is only the tint change (agreed with the owner).
- **The title row covers content.** About 40px of the list sits under the glass title row while it shows. Keyboard focus moving into that strip can be partly hidden (WCAG 2.2 SC 2.4.11, beyond AA; already true of the bar). Flagged, not fixed here.
- **Observer margin across a resize.** The `rootMargin` is measured when the large title mounts; resizing across 640px without navigating keeps the old margin, so the title switches a little early or late until the next page. Same limitation as today.
- **Two glass layers.** The title row is a separate element with its own blur, directly under the bar. Their edges should meet without a visible seam; checked by eye on dev.grimify.app.
- **Spacing default.** "More spacing" is taken as `--space-3` (12px) above and below the row, making the bar about 80px; easy to change.

## Progress log

- 2026-10-09 — Planned.
- 2026-10-09 — Plan approved.
- 2026-10-09 — Started on branch story/bar-title-row from origin/dev.
- 2026-10-09 — Staged: verification passed; version 0.13.0 → 0.14.0; no changelog file.
- 2026-10-09 — Review approved.
- 2026-10-09 — Released 0.14.0 as v0.14.0.
