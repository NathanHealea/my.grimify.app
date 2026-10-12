---
type: story
slug: large-titles
status: released
branch: story/large-titles
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-large-titles
created: 2026-10-08
approved: 2026-10-08
commit_type:         # optional override for the merge commit type (default: story=feat, bug=fix, task=chore)
version: 0.12.0
review_approved: 2026-10-08
pr:                  # set by `wi pr`
tag: v0.12.0
---

# Large page titles

## Summary

Gives every screen an iOS-style large title, as in the owner-approved preview (https://claude.ai/artifact/LdQBSMrk3XPE7B899L4JVf). The page opens with its name in large bold type at the top of the content. As that title scrolls under the sticky header, a small copy fades into the header, so the space goes back to content. The header becomes frosted glass to match the nav bar. On wide screens the title and the header's contents line up with the centered content column instead of sitting at the far left. The browser tab and app switcher name the page too, for example "Mephiston Red · Grimify".

## Context

- **Today:**
  - `src/components/app-shell.tsx` renders a sticky `<header>` with an optional back link (`staticData.back`), an `h1` from `staticData.title` (Paints, My Paints, Settings), and the Offline and waiting-to-sync status pills.
  - The header spans the window, so on desktop the title sits at the far left while `<main>` is a centered 1024px column (`--content-max-width`).
  - The paint detail page (`src/features/catalog/paint-detail.tsx`) has no header title. It shows "‹ Paints", and its own `h1` (`.paint-detail__name`) is in the content.
  - The tab title is always "Grimify" (`index.html`).
- **Decided with the owner on 2026-10-08:**
  - Use the large iOS titles as proposed, everywhere (phones and desktop).
  - On desktop, the title stays within the page's max width.
  - This replaces the earlier header-alignment plan, which was dropped before approval.
- **Depends on `story-glass-nav`** (approved, build first). This item reuses its `--color-glass` and `--glass-blur` tokens and solid fallback for the header.
- **Code to reuse:**
  - `src/test/intersection-observer.ts` has a fake `IntersectionObserver` with `triggerIntersection()` for unit tests.
  - Route `staticData` (`title`, `back`) is typed in the router setup.
- **WCAG 2.4.2 Page Titled (Level A):** a tab title per page fixes the current "Grimify" everywhere.

## Scope

**In scope**

- A shared large-title component for screens, and the shell's compact-title behaviour.
- The glass header, aligned with the content column on wide screens.
- The tab title per page.
- Paints, My Paints and Settings take their large title from `staticData.title`. Paint detail uses the paint's name, as does the "This paint isn't in the catalog" state.
- Unit and Playwright tests, and docs.

**Out of scope**

- The preview's subtitle line under the Paints title ("2,837 paints from 6 brands"). It's new content; say if you want it, and it can go in this item.
- A search box or actions inside the header.
- Changing the nav bar (story-glass-nav).
- Pull-to-refresh or other iOS gestures.

## Requirements

- **R1** — Every screen shows its title as the page's only `h1`, in large type (a new `--text-display` token, 34px/40px, weight 800, slight negative tracking), at the top of the content:
  - **Paints, My Paints, Settings:** the route title.
  - **Paint detail:** the paint's name, below the swatch as today.
  - **Missing paint:** "This paint isn't in the catalog".
- **R2** — The sticky header keeps its height, its back link and its status pills. It shows a small copy of the title (16px, semibold), hidden while the large title is visible and fading in (opacity, 180ms) once the large title has scrolled under the header. It hides again when you scroll back. With `prefers-reduced-motion`, it switches without a fade.
- **R3** — The small header title is `aria-hidden="true"`, so screen readers hear the title once, as the `h1`.
- **R4** — The header uses the glass treatment from story-glass-nav (`--color-glass`, `--glass-blur`, the same solid fallback). Its bottom border shows together with the small title, once the large title has scrolled under the header (it's transparent at the top).
- **R5** — At 640px and up, the header's contents (back link, small title, status pills) and the large title line up with the content column's edges at any window width. The header's background still spans the window.
- **R6** — The document title is "<page title> · Grimify". On a paint's page it's "<paint name> · Grimify", on a missing paint "Paint not found · Grimify", and "Grimify" while the title isn't known yet.
- **R7** — Accessibility (WCAG 2.1 AA):
  - The large title reflows at 320px and 200% text (wrapping, never clipped or overlapped).
  - Contrast of the small title on glass is at least 4.5:1 over the darkest and lightest swatch, light and dark, using the same check as story-glass-nav E3.
  - Focus order is unchanged.
  - The back link keeps its name.

## Acceptance criteria

- **AC1** (R1, R2) — Given Paints on a phone, when it opens, then "Paints" is large above the search box. When I scroll, a small "Paints" fades into the header. When I scroll back up, it fades out.
- **AC2** (R1, R2) — Given a paint page, when I scroll past the swatch and name, then the header shows "‹ Paints" and the paint's name.
- **AC3** (R3) — Given VoiceOver, when I open Settings, then "Settings, heading level 1" is read once.
- **AC4** (R5) — Given a 1440px window, when I look at Paints, then the large title, the header's back-link column and the search box share a left edge, the status pills end at the content's right edge, and the small header title is centred on the content column.
- **AC5** (R6) — Given I open Mephiston Red, when I look at the browser tab, then it reads "Mephiston Red · Grimify".
- **AC6** (R4) — Given swatches scrolling under the header, when I look at it, then they show through blurred, and the title stays readable.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R3 | `renders one large title and a hidden copy in the header` | `src/components/app-shell.test.tsx` | On `/settings`: exactly one `h1` named "Settings" in `main`; the header's small title has text "Settings" and `aria-hidden="true"`; no `h1` in the header |
| T2 | R2 | `shows the small title once the large one scrolls away` | `src/components/app-shell.test.tsx` | The header carries `data-scrolled="false"` initially; after `triggerIntersection` reports the large title not intersecting → `"true"`; intersecting again → `"false"` |
| T3 | R1, R6 | `names the page in the tab` | `src/components/page-title.test.tsx` | `PageTitle` with "Mephiston Red" sets `document.title` to "Mephiston Red · Grimify"; on unmount it returns to "Grimify"; a title change updates it |
| T4 | R1, R6 | `titles the paint page with the paint's name` | `src/features/catalog/paint-detail.test.tsx` | The paint page's `h1` is the paint's name via the large-title component; the tab title is "<name> · Grimify"; the missing paint → "Paint not found · Grimify" |
| E1 | R2, R4, R5 | `collapses the title and lines the header up` | `tests/e2e/header.spec.ts` | Pixel 7: the small title's computed opacity is 0 at the top, 1 after scrolling 300px. 1440px and 768px: the large title's, the header's first column's and the search box's left edges match the content column within 1px, the status column's right edge matches it, and the small title is centred on the column within 2px; the header box spans the viewport. Chromium: the header's `backdrop-filter` has `blur(16px)` |
| E2 | R7 | `keeps the header title readable` | `tests/e2e/header.spec.ts` | Same method as story-glass-nav E3: the small title colour vs. glass blended over black and over white ≥ 4.5:1, light and dark |
| E3 | R1, R6 | existing specs updated | `tests/e2e/offline.spec.ts`, `catalog.spec.ts` | Specs that read the header `h1` (e.g. "Mephiston Red" level-1 heading) still pass; adjust selectors only where the heading moved from the header to `main` |

**Not unit testable:**
- R7 reflow at 200% text: a manual check at 320px with browser zoom.
- AC3 on VoiceOver: a manual check.

## Implementation plan

1. [x] `PageTitle` component: renders the large `h1`, sets `document.title`, and registers the title and its element with the shell through a small context; plus the `--text-display` tokens — touches `src/components/page-title.tsx`, `src/components/page-title.css`, `src/components/page-title.test.tsx`, `src/styles/tokens.css` — tests T3
2. [x] Shell header: the small `aria-hidden` title from the context, `data-scrolled` driven by an `IntersectionObserver` on the large title, the fade, the glass background and conditional border, and column alignment at 640px and up; list routes render `PageTitle` from `staticData.title` — touches `src/components/app-shell.tsx`, `src/components/app-shell.css`, `src/components/app-shell.test.tsx` — tests T1, T2
3. [x] Paint detail uses `PageTitle` for its name and its missing state — touches `src/features/catalog/paint-detail.tsx`, `src/features/catalog/paint-detail.css`, `src/features/catalog/paint-detail.test.tsx` — tests T4
4. [x] Playwright header spec, and existing specs adjusted where the `h1` moved — touches `tests/e2e/header.spec.ts`, `tests/e2e/offline.spec.ts`, `tests/e2e/catalog.spec.ts` — tests E1, E2, E3
5. [x] Docs:
    - **DESIGN_SYSTEM:** §4 the display size, §11 the header and large title.
    - **UX_FLOWS:** screen titles.
    - **DECISIONS 040:** large titles with a collapsing header.
    - **TESTING.**

    Touches `docs/DESIGN_SYSTEM.md`, `docs/UX_FLOWS.md`, `docs/DECISIONS.md`, `docs/TESTING.md` — tests none (docs only)

**Must not change:**
- Route paths and search params.
- The `back` link behaviour.
- The status pills' text and regions.
- Header height and the nav-bar reserve.
- `<main>`'s column.
- The nav bar.

**High-risk steps:** None.

## Risks and open questions

1. **Build order.** This needs story-glass-nav's tokens. Build glass-nav first; this item's branch starts from it once it's released. If you'd rather build this first, the header gets its own glass tokens and glass-nav reuses them.
2. **Subtitle.** The preview showed "2,837 paints from 6 brands" under Paints. It's out of scope unless you want it.
3. **The header's `h1` moves into `main`.** Any test or style that finds the title in the header changes. Step 4 sweeps the E2E specs, and the unit tests in `paints-screen.test.tsx` and `my-paints-screen.test.tsx` may need selector updates. The behaviour they test stays the same.
4. **Status pills and the small title on narrow phones.** With "Offline" and "3 changes waiting to sync" both showing, the small title may have little room at 320px. It truncates with an ellipsis (it's `aria-hidden`, and the `h1` carries the full name). A manual check at 320px.
5. **Desktop large title.** At 34px on a 1024px column it reads as a page heading, as in the preview. If it feels too big on desktop, the token can step down at 640px and up. That's your call after seeing it.

## Progress log

- 2026-10-08 — Planned. The owner chose large iOS-style titles everywhere, from the preview, with the desktop title inside the content's max width. Replaces the dropped header-alignment draft.
- 2026-10-08 — Plan approved.
- 2026-10-08 — Started on branch story/large-titles from origin/main.
- 2026-10-08 — E1/AC4 reworded: the small title is centred, so it's checked as centred on the content column, with the header's outer columns aligned to the column edges.
- 2026-10-08 — R4 reworded: the header border appears with the small title (tied to the large title), not on any scroll.
- 2026-10-08 — Staged: verification passed; version 0.11.0 → 0.12.0; no changelog file.
- 2026-10-08 — Review approved.
- 2026-10-08 — Released 0.12.0 as v0.12.0.
