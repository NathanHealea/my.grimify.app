---
type: story
slug: nav-icons-only
status: in-progress
branch: story/nav-icons-only
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-nav-icons-only
created: 2026-10-13
approved: 2026-10-13
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version:             # set by `wi stage`
review_approved:     # set by `wi accept`
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Icon-only nav on phones

## Summary

On phones (under 640px) the floating bottom nav shows only its four icons, each in a 44px target, instead of icon plus label. The labels stay in the page for screen readers, so each tab keeps its name. Tablets and desktops keep icons with labels. This replaces DECISIONS 050, which hid the icons under 360px and kept the labels.

## Context

- `src/components/app-shell.tsx`: each tab is a `Link.app-shell__tab` holding an `aria-hidden` lucide icon and a `<span>` label. The span gives the link its accessible name.
- `src/components/app-shell.css`: the phone nav is a fixed glass pill. Under 360px (`@media (width < 360px)`) the icons hide (DECISIONS 050). From 640px the nav joins the top glass bar.
- `tests/e2e/nav.spec.ts`: `expectOneLineItems` checks the 44px targets, one-line labels, and the icon beside the label (icons hidden under 360px). It also checks the inactive label colours for 4.5:1 contrast over the glass blended with black and white.
- The owner asked for icons only on mobile on 2026-10-13. A separate glass change was dropped from the request.

## Scope

**In scope**

- Icons only under 640px, with the labels visually hidden but kept as the links' accessible names.
- Removing the under-360px rule.
- Tests and docs (DESIGN_SYSTEM, the app-shell feature doc, a DECISIONS entry replacing 050).

**Out of scope**

- The nav's glass, colours or height.
- Tooltips or long-press labels.
- Tablet and desktop layouts (640px and up).

## Requirements

- **R1** — Under 640px, each nav tab shows its 24px icon and no visible label, and all four fit on one row at 320px with 44×44px targets.
- **R2** — Each tab's accessible name stays its label ("Paints", "My Paints", "Palettes", "Settings"), and the icons stay hidden from assistive tech.
- **R3** — From 640px, tabs show icon and label as before.
- **R4** — WCAG 2.1 AA: inactive icons keep at least 3:1 against the glass over black and over white (1.4.11), the active tab keeps its pill, and the focus ring is unchanged.

## Acceptance criteria

- **AC1** (R1) — Given a 320px phone, when the app opens, then the bottom nav shows four icons and no label text, each tab at least 44×44px, and nothing overflows the bar.
- **AC2** (R2) — Given a screen reader, when it reaches the nav, then it reads the tabs as "Paints", "My Paints", "Palettes" and "Settings" links.
- **AC3** (R3) — Given a 1024px window, then each tab shows its icon and label.
- **AC4** (R4) — Given light or dark mode, then the inactive icons have at least 3:1 contrast over the glass blended with black and white.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R2 | `names each tab by its label` | `src/components/app-shell.test.tsx` | Four links in nav "Main" named Paints, My Paints, Palettes, Settings; icons `aria-hidden` (existing test kept) |
| T2 | R1, R3 | `expectOneLineItems` per width | `tests/e2e/nav.spec.ts` | Under 640px: icon 24px and visible, label visually hidden (zero-size box or clipped), target ≥44×44, no overflow at 320px. From 640px: unchanged checks (icon left of label, one row) |
| T3 | R4 | contrast over black/white | `tests/e2e/nav.spec.ts` | On phones, inactive icon colour ≥3:1 over the glass blended with black and white, in light and dark; pill check unchanged |

**Not unit testable:** R1 layout and R4 contrast need real layout (jsdom has none), so they're in Playwright, which runs separately from `npm run check`. Check on an iPhone that the icons are recognisable and the pill reads clearly.

## Implementation plan

1. [x] Hide the tab labels visually under 640px and drop the under-360px icon rule; update the nav E2E checks — touches `src/components/app-shell.tsx`, `src/components/app-shell.css`, `src/components/app-shell.test.tsx`, `tests/e2e/nav.spec.ts` — tests T1, T2, T3
2. [x] Update docs — touches `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `docs/features/app-shell-ui.md` — tests none (docs only)

**Must not change:**
- the tabs, their routes and order;
- `aria-current` and the pill;
- the glass;
- the bar height and its reserved space;
- the 640px-and-up layout.

**High-risk steps:** None.

## Risks and open questions

- **Recognising the icons:** icon-only tabs rely on people knowing four icons: Palette for Paints, Library for My Paints, SwatchBook for Palettes, a gear for Settings. The text labels are gone on phones. That's a usability cost, not a WCAG 2.1 AA failure, since every link keeps its name. It's recorded in the DECISIONS entry.
- **Label in Name (2.5.3)** doesn't apply when there's no visible label. Voice-control users must know the tab names; the names stay the same as before.
- **E2E runs separately** from `npm run check` and needs Playwright browsers. If it can't run here, R1 and R4 are checked by hand on a phone.

## Progress log

- 2026-10-13 — Planned.
- 2026-10-13 — Plan approved.
- 2026-10-13 — Started on branch story/nav-icons-only from origin/dev.
- 2026-10-13 — Step 1 also touches src/styles/tokens.css (--visually-hidden-size) because stylelint allows px only in tokens. nav.spec.ts ran locally: 7 passed, 1 skipped on iPhone 15 and Pixel 7; a first parallel run hit a one-off WebKit canvas InvalidStateError in computedColor that didn't recur (also passes on dev).
