---
type: story
slug: floating-nav-bar
status: released
branch: story/floating-nav-bar
worktree_path: ../grimify-v2-worktrees/story-floating-nav-bar
created: 2026-10-06
approved: 2026-10-06
version: 0.1.0
tag: v0.1.0
merge_commit: 405267e (squash of story/floating-nav-bar)
---

# Floating nav bar

## Summary

Replace the scaffold's edge-to-edge bottom tab bar with the floating nav bar decided in DECISIONS 014: one `<nav aria-label="Main">` that floats at the bottom of the screen on phones and at the top, centered, on tablet and desktop, with a Primary-filled pill marking the current screen. Every later screen sits inside this shell, so the layout, DOM order and focus behavior need to be settled before the Paints tab is built.

## Context

ROADMAP NOW item 2. The scaffold (`task-project-scaffold`, released as v0.0.1) built `AppShell` with a sticky header, `<main>`, and a fixed, full-width bottom tab bar that comes **after** `<main>` in the DOM. The active tab is shown with semibold `--color-text` via `[data-status="active"]`.

DECISIONS 014 (2026-10-06) and DESIGN_SYSTEM §11 now specify:

- one floating bar at every breakpoint: bottom below 640px, top-centered at 640px and up
- Surface background, border, `--shadow-md` (border only in dark mode), `--radius-pill`, height `--tab-bar-height`
- active item: `aria-current="page"` and a `--color-primary` pill with `--color-primary-foreground` icon and label; inactive items in `--color-muted-text`
- the nav comes before `<main>` in the DOM; only CSS moves it
- content is never hidden behind the bar; on tablet and desktop the screen header sits below it

Code: `src/components/app-shell.tsx`, `app-shell.css`, `app-shell.test.tsx`; tokens in `src/styles/tokens.css`. No blocking TBDs: the pill radius is *Proposed*, not TBD, and no other open marker in DESIGN_SYSTEM applies to this component.

## Scope

**In scope**

- Move the `<nav>` before the header and `<main>` in `AppShell`
- Floating bar styles for mobile (< 640px) and tablet/desktop (≥ 640px)
- Primary-filled active pill keyed on `aria-current="page"`
- Header and `main` spacing so nothing sits under the bar at either breakpoint
- Focus ring that stays visible on the active pill in light and dark mode
- `--z-tab-bar` raised above `--z-header`
- DESIGN_SYSTEM §6a and §11 updates for the choices below

**Out of scope**

- Skip link (DECISIONS 014 defers it until testing shows a need)
- Show/hide on scroll (§11: not in MVP)
- Hover styles for inactive items (not specified in §11; flagged below)
- Extracting the nav into its own component (it stays in `AppShell`; it is ~20 lines of TSX)
- Renaming `--tab-bar-height` / `--z-tab-bar` or the `app-shell__tab*` classes (§11 already refers to `--tab-bar-height`; renaming is churn)
- The outline-pill fallback in §11 (only if the filled pill is later found to compete with swatches)
- Paint detail routes and how the Paints item highlights on `/paints/$paintId` (detail item)

## Requirements

- **R1** — The DOM order inside the shell is: the `Main` navigation landmark, then the header (banner), then `<main>`, at every breakpoint. There is exactly one `Main` navigation.
- **R2** — Below 640px the bar is fixed to the bottom, inset `--space-3` from the left, right and bottom edges (plus the bottom, left and right safe-area insets), spans the width between the insets, and its three items share that width equally.
- **R3** — At 640px and up the bar is fixed to the top, inset `--space-3` below the top edge (plus the top safe-area inset), horizontally centered, sized to its content, and never wider than `--content-max-width` or the viewport minus the side insets. The screen header and its title sit fully below the bar.
- **R4** — The bar has a Surface background, a 1px Border, `--radius-pill` corners and `--shadow-md` in light mode; in dark mode it has the border and no shadow.
- **R5** — Each item shows a 24px decorative icon and a visible text label and is at least 44×44px. The current item has `aria-current="page"` and a `--color-primary` pill with icon and label in `--color-primary-foreground`; other items are `--color-muted-text` with no background. The visual active state is driven by `aria-current`, so the look and the announced state can't disagree.
- **R6** — Page content is never covered by the bar: on mobile the last line of `<main>` can scroll fully above the bar; on tablet and desktop content scrolls under the header, never between the bar and the screen top in view.
- **R7** — Keyboard focus on any item, including the active pill, shows a ring with at least 3:1 contrast against what is next to it, in light and dark mode.

## Acceptance criteria

- **AC1** (R1) — Given any screen, when I Tab from the top of the page, then the first three focus stops are Paints, My Paints, Settings, at every window width.
- **AC2** (R2, R4, R5) — Given a phone-width window (e.g., 375px) in light mode, when I open `/paints`, then a rounded, shadowed bar floats 12px above the bottom edge and 12px from each side, with the Paints item in a dark filled pill and the other two items in gray.
- **AC3** (R2) — Given a 320px-wide window, when I open any screen, then all three labels are fully visible with no horizontal scrolling.
- **AC4** (R3, R6) — Given a window 640px or wider, when I open `/settings` and scroll, then the bar is centered 12px below the top edge, the "Settings" title sits below it, and no page content shows between the bar and the top of the window.
- **AC5** (R2, R6) — Given an installed PWA on an iPhone with a home indicator, when I scroll a screen to the end, then the bar sits above the home indicator and the last line of content is fully visible above the bar.
- **AC6** (R4) — Given dark mode, when I open any screen, then the bar has a visible border and no shadow, and the active pill is near-white with a near-black icon and label.
- **AC7** (R7) — Given light mode and then dark mode, when I Tab onto the active item, then a ring is visible around the outside of the pill.
- **AC8** (R5) — Given VoiceOver, when I move through the nav, then each item is announced by its label and the current one as "current page"; icons are not announced.

## Test plan

Unit tests stay colocated in `src/components/app-shell.test.tsx` and use the existing `renderRoute` helper. The three existing AppShell tests (labelled links, `aria-current` on only the current tab, hidden icons) keep covering R5's semantics and must still pass unchanged.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `places the Main navigation before the header and main` | `src/components/app-shell.test.tsx` | `nav.compareDocumentPosition(banner)` and `nav.compareDocumentPosition(main)` both include `DOCUMENT_POSITION_FOLLOWING`; banner precedes main |
| T2 | R1 | `renders exactly one Main navigation` | `src/components/app-shell.test.tsx` | `getAllByRole("navigation", { name: "Main" })` has length 1 |
| T3 | R1, R5 | `puts the tab links first in focus order` | `src/components/app-shell.test.tsx` | `userEvent.tab()` three times from `document.body` focuses Paints, My Paints, Settings in that order — **only if `@testing-library/user-event` is already installed; it is not, so this row is dropped unless you approve adding it** (T1 covers the DOM order it depends on) |

**Not unit testable:**

- R2, R3, R4, R6: layout, breakpoints, shadows and safe areas are CSS that jsdom doesn't lay out. Verified by hand per AC2–AC6 in a desktop browser (responsive mode at 320, 375, 640 and 1280px, light and dark) and on an iPhone in standalone mode. Stylelint enforces tokens-only values in `app-shell.css`.
- R5 visual pill and R7 focus ring: manual per AC2, AC6, AC7. Contrast figures are worked out below under step 3.

## Implementation plan

1. [x] Move `<nav>` above `<header>` in `AppShell`; no other TSX change. Write T1 and T2. Touches `src/components/app-shell.tsx`, `src/components/app-shell.test.tsx`.
2. [x] Raise `--z-tab-bar` from 10 to 20 so the bar, now earlier in the DOM, paints above the sticky header where they overlap on tablet and desktop. Touches `src/styles/tokens.css`.
3. [x] Restyle the bar and items in `app-shell.css`. Touches `src/components/app-shell.css`.
    - **Bar, mobile (default):** `position: fixed`; `bottom: calc(var(--space-3) + env(safe-area-inset-bottom))`; left and right `calc(var(--space-3) + env(safe-area-inset-left|right))`; Surface background, border, `--radius-pill`, `--shadow-md`; padding `--space-1`. Drop the old full-width background, border-top and safe-area padding.
    - **List:** `min-height: var(--tab-bar-height)` (not `height`, so larger text grows the bar instead of clipping it); items `flex: 1`.
    - **Item:** icon stacked over label on mobile, row layout (icon beside label, `--space-2` gap, `--space-4` side padding) at ≥ 640px; `min-width` and `min-height` `--touch-target`; `--radius-pill`; inactive color `--color-muted-text`.
    - **Active:** `&[aria-current="page"]` sets `--color-primary` background and `--color-primary-foreground` color (replaces the `[data-status="active"]` rule).
    - **Focus:** use the global positive `--focus-ring-offset` instead of the current negative one, so the ring sits outside the pill on the Surface. On the pill itself the dark-mode ring would fail: `#A3A3A3` on `#FAFAFA` is about 2.4:1. Outside it's `#737373` on `#FFFFFF` (4.74:1) and `#A3A3A3` on `#171717` (7.1:1). Bar padding `--space-1` (4px) leaves exactly room for a 2px ring at a 2px offset.
    - **Dark mode:** `@media (prefers-color-scheme: dark)` sets `box-shadow: none` on the bar (DESIGN_SYSTEM §7). Kept local rather than overriding `--shadow-md` globally, since that would change every later popover in one unrelated edit.
    - **≥ 640px:** bar moves to `top: calc(var(--space-3) + env(safe-area-inset-top))`, `bottom: auto`; centered with `inset-inline: 0`, `margin-inline: auto`, `width: fit-content`, `max-width: min(var(--content-max-width), 100% - 2 × --space-3)`.
4. [x] Keep content clear of the bar. Touches `src/components/app-shell.css`.
    - **Mobile:** `main` bottom padding becomes `--tab-bar-height` + bar padding (2 × `--space-1`) + `--space-3` inset + safe-area bottom + `--space-4`.
    - **≥ 640px:** the sticky header (still `top: 0`) grows its top padding by the bar's footprint (safe-area top + `--space-3` + bar height + `--space-3`), so its background covers the strip the bar floats in and content never shows above the header. `main` drops the extra bottom padding back to `--space-4`.
5. [x] Docs. Touches `docs/DESIGN_SYSTEM.md`.
    - **§6a:** `--z-tab-bar` 20 (*Proposed*), above `--z-header`.
    - **§11 Behavior:** on tablet and desktop the header reserves the bar's strip (rather than `main` being padded); the focus ring sits outside the pill because the dark ring fails on the pill; the active look is keyed on `aria-current`.
6. [x] Verify: `npm run check`, `npm run build`, `prettier --check .`, then the manual pass at 320, 375, 640 and 1280px in light and dark. Touches nothing.

**Must not change:** route paths, the link labels and order, the `Main` landmark name, the header's `<h1>` from route `staticData`, and token names.

## Risks and open questions

- **Decision needed: `@testing-library/user-event`.** A real Tab-order test (T3) needs it, and it isn't installed. My recommendation is to skip it: T1 asserts the DOM order that focus order follows, and AC1 checks it by hand. Say so if you want the dependency added.
- **Decided by default: header reserves the bar's strip on tablet and desktop.** The alternative, a sticky header at `top: <bar offset>`, leaves a gap above it where content scrolls past around the floating bar. DESIGN_SYSTEM §11 says `main` is padded on the bar's side; the doc gets updated to match.
- **Decided by default: no hover style for inactive items.** §11 doesn't specify one. Desktop users may expect it. Easy to add later as `@media (hover: hover)` → `--color-text`.
- **Accessibility, not a blocker:** the bar's own outline is Border on Surface (1.26:1 light). SC 1.4.11 doesn't apply to the container because each link is identified by its text label, not by the bar's edge, and the shadow adds separation in light mode. In dark mode, Border `#262626` on Background `#0A0A0A` is about 1.3:1, so the bar's edge is faint. Acceptable under AA, flagged in case it looks wrong on a device.
- **Accessibility, mobile focus order:** the nav is read and focused before content even though it sits at the bottom on phones (DECISIONS 014 trade-off). Landmarks satisfy SC 2.4.1 Bypass Blocks; a skip link stays deferred.
- **Unverified:** that TanStack `Link` drops `aria-current` cleanly on inactive links (the existing "marks only the current tab" test says yes for the three top-level routes).
- **Estimate:** 0.5–1 session, assuming no surprises in iOS safe-area behavior. The manual iPhone check depends on you having a device or the Simulator.

## Progress log

- 2026-10-06 — Planned.
- 2026-10-06 — Approved as written; `@testing-library/user-event` not added, so T3 is dropped and AC1 covers Tab order by hand.
- 2026-10-06 — Implementation started in worktree `../grimify-v2-worktrees/story-floating-nav-bar` on `story/floating-nav-bar`.
- 2026-10-06 — Steps 1–6 done. T1 was confirmed to fail against the old DOM order before passing. `npm run check` (28 tests in 5 files), `npm run build` and `prettier --check .` exit 0. Drift: steps 3 and 4 share one commit because they edit the same rules in `app-shell.css` and neither is coherent alone. The bar's total height (padding and border included) is `--tab-bar-height`, so items are 46px tall; the stacked icon and label on mobile have no gap to fit. Stylelint required `width >= 640px` range notation and the `inset` shorthand. Not yet verified: AC1–AC8 by hand; no dev server was started (owner starts them).
- 2026-10-06 — Staged. `npm run check` (28 tests in 5 files), `npm run build` and `prettier --check .` exit 0. Self-review fix: a `--space-1` gap between items, because flush items let a focus ring overlap the neighboring active pill (R7). Version 0.1.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/floating-nav-bar`. AC1–AC8 still need a manual check.
- 2026-10-06 — Released. Owner approved the review after a local browser check. Squash-merged 9 commits from `story/floating-nav-bar` into `main` as 0.1.0 (405267e), tagged `v0.1.0`. Worktree and branch removed. AC5 (installed iOS standalone) deferred to the PWA item, since the app has no manifest yet.
