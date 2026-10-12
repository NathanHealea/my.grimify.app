---
type: story
slug: glass-nav
status: released
branch: story/glass-nav
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-glass-nav
created: 2026-10-08
approved: 2026-10-08
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.11.0
review_approved: 2026-10-08
pr:                  # set by `wi pr`
tag: v0.11.0
---

# Glass nav bar with one-line items

## Summary

Restyles the floating nav bar before the first deploy. It gets a frosted-glass background: a translucent surface with a background blur, which falls back to today's solid bar when the browser can't blur or the person has asked for reduced transparency. On phones each item puts its icon beside its label on one line, as wider screens already do. Placement stays as DECISIONS 014 set it: floating at the bottom on phones, spanning the screen width between the insets, and floating at the top on tablet and desktop, centered and sized to its content.

## Context

- **Where it lives:** `src/components/app-shell.tsx` renders `<nav aria-label="Main">` with three `Link`s, each an icon plus a `<span>` label. `src/components/app-shell.css` styles it.
- **Phones (< 640px):** `.app-shell__tabs` is fixed to the bottom, inset `--space-3` from the left, right and bottom edges, so it spans the screen width between them. `.app-shell__tab` is `flex-direction: column`, which stacks the icon over the label.
- **640px and up:** the bar is fixed to the top, centered, `width: fit-content`, and items are `flex-direction: row`.
- **Background:** `var(--color-surface)`, solid. Inactive labels use `--color-muted-text` (4.74:1 light / 7.11:1 dark on Surface, DESIGN_SYSTEM §11). The active item is a Primary pill.
- **Decided with the owner on 2026-10-08:**
  - Labels sit beside icons on phones ("not have the word stack").
  - The bar keeps floating on both layouts: bottom on phones, spanning the width between the insets; top on desktop, sized to its content.
  - Frosted glass with about 70% surface opacity and a 16px blur. Inactive labels switch to the full text colour so contrast holds over any content. Solid fallback.
- **Rules that apply:**
  - Tokens only. Stylelint forbids raw colours and `px` outside `tokens.css` (`stylelint.config.js`).
  - DESIGN_SYSTEM §11 records the bar's look and contrast.
  - DECISIONS 014 records its placement.
- **Related:** none open.

## Scope

**In scope**

- Glass background tokens and the bar's glass styling with fallbacks.
- One-line icon and label items on phones.
- Inactive label colour change for contrast.
- An E2E layout check, and docs.

**Out of scope**

- Changing where the bar sits, its height (`--tab-bar-height`), its destinations, or the header.
- Show or hide on scroll.
- Glass anywhere else (header, sheets, toasts).
- Dark mode as a feature (the bar follows the system theme as everything else does).

## Requirements

- **R1** — On every screen width, each nav item shows its icon and label side by side on one line, and no label wraps.
- **R2** — On phones (< 640px) the bar stays fixed at the bottom, inset `--space-3` (plus safe-area insets) from the left, right and bottom edges, spanning the width between them. At 640px and up it stays fixed at the top, centered, sized to its content.
- **R3** — Where the browser supports `backdrop-filter`, the bar's background is the Surface colour at 70% opacity with a 16px blur, so content scrolling behind it shows through blurred. The border and shadow stay. Light and dark themes both use their own Surface.
- **R4** — Where `backdrop-filter` isn't supported, or `prefers-reduced-transparency: reduce` matches, the bar is solid Surface as today.
- **R5** — Accessibility (WCAG 2.1 AA):
  - Inactive labels and icons use `--color-text`.
  - The active pill stays solid Primary with Primary-foreground text.
  - Text contrast stays at least 4.5:1 and the active-pill and focus-ring contrast at least 3:1, measured with the darkest and lightest catalog swatches behind the bar in both themes.
  - Items stay at least 44×44px.
  - The nav stays `<nav aria-label="Main">` with `aria-current="page"` on the active item.
- **R6** — Page content is still never hidden behind the bar (the bottom padding on phones and the header reserve on desktop are unchanged).

## Acceptance criteria

- **AC1** (R1) — Given a 375px-wide phone, when I look at the nav, then each item shows its icon then its label on one line, and "My Paints" doesn't wrap.
- **AC2** (R2) — Given a phone, when I scroll Paints, then the bar floats at the bottom, inset from the edges and spanning the width. Given a desktop window, then it floats at the top, centered, only as wide as its items.
- **AC3** (R3) — Given swatches scrolling behind the bar, when I look at it, then I see them blurred through the bar, and every label is still easy to read.
- **AC4** (R4) — Given "Reduce transparency" on (macOS or iOS Settings → Accessibility → Display) in a browser that reports it, when I open the app, then the bar is solid.
- **AC5** (R5) — Given the darkest and lightest swatches behind the bar, when I measure contrast, then inactive labels are at least 4.5:1 and the active pill at least 3:1, in light and dark mode.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| E1 | R1, R2 | `lays the nav out per screen size` | `tests/e2e/nav.spec.ts` | Both mobile projects: for each tab, icon and label boxes share a row (vertical centres within 2px, icon left of label); label height equals one line; bar's left and right sit `--space-3` from the viewport edges and its bottom is above the viewport bottom. At a 1280px viewport: bar at the top, horizontally centred (left and right gaps within 1px), narrower than the viewport |
| E2 | R3, R4 | `frosts the bar where it can` | `tests/e2e/nav.spec.ts` | Chromium (Pixel 7): computed `backdrop-filter` contains `blur(16px)` and the background colour has alpha 0.7. With `page.emulateMedia({ reducedTransparency: "reduce" })` if Playwright supports it (check the installed version), else via a `prefers-reduced-transparency` style probe: background is opaque and `backdrop-filter` is `none` |
| E3 | R5 | `keeps nav text readable over any swatch` | `tests/e2e/nav.spec.ts` | Light and dark (`emulateMedia({ colorScheme })`): with a solid black and a solid white element placed behind the bar, the computed label colour against the bar's effective colour (glass blended over each) is ≥ 4.5:1, and the active pill vs. that blend ≥ 3:1. Contrast computed in the test with the WCAG formula |
| T1 | R5 | `marks the current page in the nav` (existing app-shell test, kept) | `src/components/app-shell.test.tsx` | `nav` "Main" with three links; `aria-current="page"` on the current one |

**Not unit testable:**
- R1–R4 are layout and paint, which jsdom doesn't compute, so they're covered by Playwright (E1–E3).
- R6 is the existing behaviour: a manual scroll-to-bottom check on a phone and a desktop.
- AC4 on a real device, since Safari doesn't report `prefers-reduced-transparency`: a manual check in Chrome with the OS setting.

## Implementation plan

1. [x] Glass tokens (`--color-glass` light and dark from Surface at 70%, `--glass-blur`) and the bar's glass background with the `@supports` and `prefers-reduced-transparency` fallbacks; inactive items to `--color-text` — touches `src/styles/tokens.css`, `src/components/app-shell.css`, `tests/e2e/nav.spec.ts` — tests E2, E3
2. [x] One-line items on phones (row layout at every width; spacing adjusted so three items fit at 320px) — touches `src/components/app-shell.css`, `tests/e2e/nav.spec.ts` — tests E1, T1
3. [x] Docs:
    - **DESIGN_SYSTEM §11:** look, glass, contrast, one-line items.
    - **DESIGN_SYSTEM tokens table:** the two new tokens.
    - **DECISIONS 039:** glass nav with a solid fallback and full-colour inactive labels.
    - **TESTING:** the nav spec.

    Touches `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `docs/TESTING.md` — tests none (docs only)

**Must not change:**
- The nav's DOM and accessible names.
- `aria-current` styling hook.
- Bar placement and `--tab-bar-height`, plus everything that reserves space for it (`app-shell.css` main padding and header reserve, `toast.css`, `update-prompt.css`).
- DECISIONS 014's placement.

**High-risk steps:** None.

## Risks and open questions

1. **`prefers-reduced-transparency` support.** Chrome and Edge report it; Safari (including iOS) and Firefox don't, as far as I know. I haven't checked current support tables, and the build will check them. Where it isn't reported, people who set "Reduce transparency" still get glass, kept readable by R5's contrast floor.
2. **Safari prefix.** Older Safari needs `-webkit-backdrop-filter`. Stylelint's standard config may flag the prefix (`property-no-vendor-prefix`). If so, keep the prefixed line with a targeted disable comment that names the reason, rather than dropping older iOS.
3. **Width at 320px.** Three one-line items ("Paints", "My Paints", "Settings" with 24px icons) need roughly 300px at the current padding. At 320px minus the insets (296px) they may not fit. Step 2 tightens the item padding and gap (tokens only) so they do. If they still don't, the icon size or label size has to give, and I'll ask before changing either.
4. **Contrast is the gate.** If 70% glass fails R5 over black or white in either theme, the opacity goes up until it passes, and I'll tell you the final value.
5. **Performance.** `backdrop-filter` on a fixed element repaints while scrolling. That's fine on recent phones; low-end Android may stutter. There's no fallback for that beyond the browser's own.
6. **E2E visual checks** run against the production build like the other specs, and Chromium handles E2's glass check. WebKit's support for computed `backdrop-filter` in Playwright is unverified, so E2 may need to be Chromium-only.

## Progress log

- 2026-10-08 — Planned. Decided with the owner: one-line items on phones; keep floating placement (bottom on phones spanning the width, top on desktop sized to content); frosted glass at about 70% with a solid fallback and full-colour inactive labels.
- 2026-10-08 — Plan approved.
- 2026-10-08 — Started on branch story/glass-nav from origin/main.
- 2026-10-08 — Step 1: E3 failed once on iPhone 15 on the first run (cold server), then passed 27 runs including --repeat-each 8; cause not found, no retry added.
- 2026-10-08 — Staged: verification passed; version 0.10.0 → 0.11.0; no changelog file.
- 2026-10-08 — Review approved.
- 2026-10-08 — Released 0.11.0 as v0.11.0.
