# Design System

> Status: **Draft v0.2.** Direction: clean & neutral.
> Decided: shadcn/ui components restyled with **plain CSS files** (one `.css` per component, no Tailwind, no styles in TSX), design tokens as CSS custom properties in `src/styles/tokens.css`, mobile-first, PWA conventions. See CODE_STYLE.md §5a.
> Values marked *Proposed* are sensible defaults (shadcn's "neutral" theme) that can be replaced once the brand look is chosen.

## 0. Styling Architecture

```text
src/styles/tokens.css   → all design tokens (the only place raw values live)
src/styles/base.css     → reset, html/body, headings, focus defaults
src/styles/index.css    → @import tokens + base; imported once in main.tsx
<component>.css         → styles for exactly one component, imported by its .tsx
```
Component variants use `data-*` attributes (e.g., `data-variant`, `data-size`, `data-state` from Radix), never class maps in TSX.

---

## 1. Design Direction

Style:
**Clean & neutral.** A minimal, modern utility app.

Mood:
Calm, precise, uncluttered. Like a well-organized paint rack: the colors are the decoration, the interface stays quiet.

Design Principles:
- **Paint is the hero.** UI chrome stays neutral (grays) so swatch colors read accurately and aren't distorted by nearby brand colors.
- **One-handed mobile use.** Primary actions sit in the bottom half of the screen.
- **Fast over fancy.** Instant search, minimal animation, no blocking spinners for local data.
- **Honest color.** Always note that on-screen swatches are approximations.

---

## 2. Brand

Brand Name:
**TBD** (see PRD open questions)

Logo:
**TBD**, awaiting artwork (GitHub issue #3). Needs a square app icon (192px, 512px, 512px maskable, 180px apple-touch-icon). The PWA shipped without icons: until they exist, Chrome won't offer install and iOS uses a page screenshot.

Brand Voice:
Friendly and concise; standard paint terms only (base, layer, shade, contrast). Short labels, no exclamation marks.

---

## 3. Color Palette

Based on the shadcn "neutral" theme, defined as CSS custom properties in `src/styles/tokens.css` (`--color-primary`, `--color-background`, …; dark values under `@media (prefers-color-scheme: dark)`):

| Token | Light | Dark |
|---|---|---|
| Primary | `#171717` | `#FAFAFA` |
| Secondary | `#F5F5F5` | `#262626` |
| Background | `#FFFFFF` | `#0A0A0A` |
| Surface (card) | `#FFFFFF` | `#171717` |
| Text | `#0A0A0A` | `#FAFAFA` |
| Muted Text | `#737373` | `#A3A3A3` |
| Border | `#E5E5E5` | `#262626` |
| Input border | `#8A8A8A` | `#666666` |
| Swatch edge | `rgb(0 0 0 / 10%)` | `rgb(255 255 255 / 10%)` |
| Overlay (sheet backdrop) | `rgb(0 0 0 / 50%)` | `rgb(0 0 0 / 70%)` |
| Swatch ink (dark / light) | `#0A0A0A` / `#FAFAFA` | same: follows the paint, not the theme |
| Success | `#16A34A` | `#22C55E` |
| Warning | `#D97706` | `#F59E0B` |
| Error | `#DC2626` | `#EF4444` |
| Accent (brand) | none: Primary is the accent | none |
| Primary foreground *(Proposed)* | `#FAFAFA` | `#171717` |
| Primary hover *(Proposed)* | Primary mixed 90% with Background | same |
| Secondary hover *(Proposed)* | Secondary mixed 80% with Background | same |
| Focus ring *(Proposed)* | `#737373` | `#A3A3A3` |
| Error foreground *(Proposed)* | `#FFFFFF` | `#0A0A0A` |

Token names: `--color-primary`, `--color-primary-foreground`, `--color-primary-hover`, `--color-secondary`, `--color-secondary-hover`, `--color-background`, `--color-surface`, `--color-text`, `--color-muted-text`, `--color-border`, `--color-input-border`, `--color-swatch-edge`, `--color-swatch-ink-dark`, `--color-swatch-ink-light`, `--color-ring`, `--color-success`, `--color-warning`, `--color-error`, `--color-error-foreground`.

Contrast notes (WCAG 2.1 AA):
- The light focus ring is `#737373` (4.74:1 on white), not shadcn's `#A3A3A3` (2.52:1, under the 3:1 non-text minimum in SC 1.4.11).
- Error foreground is near-black in dark mode: white on `#EF4444` is 3.76:1, under 4.5:1 for text.
- **Open:** Muted Text on Secondary is 4.35:1, under 4.5:1. Don't put muted text on Secondary surfaces until this is resolved.
- Border on Background is 1.26:1, so `--color-border` is decorative only (cards, dividers, the line under the header and desktop bar). Form controls use `--color-input-border`: `#8A8A8A` is 3.45:1 on Background and 3.17:1 on Secondary; `#666666` is 3.45:1 on Background and 3.12:1 on Surface (SC 1.4.11, DECISIONS 019).

Rules:
- No brand accent hue. Interactive emphasis uses Primary (near-black / near-white), so no UI color competes with paint swatches.
- Status colors (success/warning/error) are only used for status, never decoration.
- Only use tokens (`var(--color-primary)`, `var(--color-muted-text)`…), never raw hex in component CSS. Paint swatches get the paint's hex through the `--swatch-color` custom property set on the element; `paint-swatch.css` uses `background: var(--swatch-color)`.
- Dark mode: follows system preference (`prefers-color-scheme`) in MVP; a manual toggle is in ROADMAP NEXT.
- `theme-color` meta tag matches Background.

---

## 4. Typography

Font Family:
System font stack (no web-font download; good for offline and speed)
`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

Heading Font:
Same as body (no display font; keeps the clean look and works offline)

| Style | Size / Weight / Line Height |
|---|---|
| Display (page title) | 34px / 800 / 40px, `-0.02em` tracking |
| H1 | 24px / 700 / 32px |
| H2 | 20px / 600 / 28px |
| H3 | 16px / 600 / 24px |
| Body | 16px / 400 / 24px (inputs must be ≥16px to prevent iOS zoom) |
| Small | 13px / 400 / 18px |

Token names *(Proposed)*: `--font-sans`; `--text-display|h1|h2|h3|body|small`; `--leading-display|h1|h2|h3|body|small`; `--weight-regular|semibold|bold|heavy`; `--tracking-display`. The display size is used only by `PageTitle`, the screen's one `h1`.

---

## 5. Spacing

Base Unit: 4px
Tokens: `--space-1` (4px), `--space-2` (8px), `--space-3` (12px), `--space-4` (16px), `--space-6` (24px), `--space-8` (32px), `--space-12` (48px), `--space-16` (64px), `--space-24` (96px)
Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96px
Page horizontal padding on mobile: 16px

---

## 6. Border Radius

Tokens: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`
- Small: 6px (badges)
- Medium: 8px (inputs, buttons)
- Large: 12px (cards, sheets)
- Pill: 9999px (chips, filter toggles)
- Swatch: rounded square, `--radius-md`. Circles are reserved for hue dots, so a filter never looks like a paint (DECISIONS 020)

---

## 6a. Sizing, Layering and Motion *(Proposed)*

| Token | Value | Use |
|---|---|---|
| `--border-width` | 1px | all borders |
| `--focus-ring-width` / `--focus-ring-offset` | 2px / 2px | global `:focus-visible` in `base.css` |
| `--touch-target` / `--touch-target-sm` | 44px / 36px | control heights (see §8) |
| `--header-height` / `--tab-bar-height` | 56px / 56px | app shell |
| `--swatch-size` / `--row-min-height` | 40px / 56px | paint rows (§10) |
| `--icon-size-sm` | 14px | swatch type marker, chip icons |
| `--content-max-width` | 1024px | centered content on wide screens (§14) |
| `--z-header` / `--z-tab-bar` / `--z-sheet` / `--z-toast` | 10 / 20 / 50 / 100 | stacking order; from 640px the nav sits above the header inside the bar so it gets the taps |
| `--duration-fast` / `--easing-standard` | 150ms / ease-out | hover and state transitions |
| `--opacity-disabled` | 0.5 | disabled controls |
| `--color-glass` / `--glass-blur` / `--glass-saturate` | Surface at 50% (62% dark) / 16px / 180% | frosted bars (§11, DECISIONS 039, 045) |

---

## 7. Shadows

- Small `--shadow-sm`: cards at rest (`0 1px 2px rgb(0 0 0 / 0.05)`)
- Medium `--shadow-md`: popovers, dropdowns (`0 4px 6px -1px rgb(0 0 0 / 0.1)`)
- Large `--shadow-lg`: bottom sheets, dialogs (`0 10px 15px -3px rgb(0 0 0 / 0.1)`)
In dark mode, rely on borders rather than shadows.

---

## 8. Buttons

Use shadcn `<Button>` variants only.
- Primary: `default` variant. One per screen at most.
- Secondary: `secondary` or `outline`
- Danger: `destructive` (e.g., Delete account)
- Disabled: built-in disabled styles; keep the label visible
- Loading: show a spinner icon and keep the button width; disable while pending
- Minimum touch target: 44×44px (`--touch-target`). Exception: the `sm` size (36px, `--touch-target-sm`) is allowed for secondary controls only.

Own/Want/Favorite toggles: 44px circular icon buttons, `--space-2` apart, Own = `Plus`, Want = `Bookmark`, Favorite = `Heart` (DECISIONS 034), with `aria-pressed` and names like "Mark Mephiston Red as owned" / "… as wanted" / "… as favorite". No tooltips or visible labels. Off: outlined in `--color-input-border` (3:1). On: filled with Primary, icon in Primary foreground (the bookmark and heart themselves also fill). They're always siblings of a row's link, never inside it.

---

## 9. Inputs

Use shadcn `<Input>` and `<Select>`. Search uses `<Input type="search">` with suggestion chips below it, not `<Command>`.
- Default: `--color-input-border`, 16px text at every width (shadcn's desktop 14px is dropped)
- Focus: visible ring (`outline: 2px solid var(--color-ring)` on `:focus-visible`)
- Error: destructive border plus a message below
- Disabled: reduced opacity, `cursor-not-allowed`
- Placeholder: muted text. The search box placeholder reads "Search 2,000+ paints…" (live count)

---

## 10. Cards

- Padding `--space-3`–`--space-4`, `1px solid var(--color-border)`, `--radius-lg`, `--shadow-sm`
- **Paint row (list item):** swatch (40px) · name (bold) · brand · line/type (muted) · Own/Want toggles on the right. Row height ≥ 56px.
- **Paint detail:**
  - Hero swatch: full width, `--swatch-hero-height` (160px), `--radius-lg`, type marker at 24px, with "Colors are approximate." under it.
  - Facts: name as the page's only `<h1>`; "Brand · Line · Type · Finish" (muted); Discontinued badge; "Also known as …".
  - Hex: an outlined button named "Copy hex #…" that announces "Copied #…" in a status region.
  - Equivalents (`<h2>`): a "Show all types" checkbox and the family note for metallic, wash and tint paints. Then an `<h3>` per brand with up to 3 linked rows and match labels. A brand with no close match is muted (`--opacity-muted`) under "No close match in [Brand]".
- **Paint row:** the whole row links to its detail and keeps a ≥ 56px height and an inset focus ring

### Hue dots
A horizontal, scrollable row of 13 small circles (12 hues + neutral) under the empty search box. Each has a text label below it (don't rely on color alone).

### Search chips
Detected brand / hue / hex appear as removable pill chips under the search box (`Brand: Vallejo ×`); the whole chip is the button, named "Remove Brand: Vallejo". Suggestion chips (outlined) complete a partly typed brand or hue.

### Swatch component (`<PaintSwatch>`)
- Background = paint hex
- Rounded square, `--swatch-size` in rows, `--space-12` for the hex search preview
- 1px inner edge, `--color-swatch-edge`, so pale and dark paints stay visible on any background
- Ink on top of a swatch (the type marker) is black or white by WCAG relative luminance, switching at 0.18
- Metallic (sparkles), wash/shade/ink (droplet) and contrast/speedpaint (layers) get a small corner marker, since hex can't represent them. The swatch is decorative (`aria-hidden`); the type is always in the row text

### Paint row (`<PaintRow>`)
- Swatch · name (semibold) · "Brand · Line · Type" (muted) · match label or "Discontinued" on the right
- Own/Want toggles sit to the right of the row's link (`actions` slot); owned equivalents add "You own this" under the meta line
- Selection variant (`selection` prop, Select mode): the row is a `<label>` for a native checkbox named "Select <paint name>" in place of the link, with no `actions`. The checkbox sits before the swatch at `--icon-size`, tinted with `accent-color: var(--color-primary)`; the whole ≥ 56px row is the tap target and keeps the inset focus ring. Disabled rows (`data-disabled`) use `--opacity-disabled` and a not-allowed cursor

### Palette paint row
- Swatch · name · brand, linking to the paint, then a ghost icon button (✕, `size="icon"`, 44×44px) named "Remove <paint name> from palette". An unknown paint's name stretches so the button stays at the row's end

---

## 11. Navigation

Large title (DECISIONS 040):
Each screen's title is a `PageTitle`: its one `h1`, in display type at the top of `<main>` (route `staticData.title`, or the paint's name on a paint's page). It also sets the tab title "<title> · Grimify". It wraps rather than clipping at 320px and with large text.

Header:
Sticky bar in three columns: back link | small title | status pills. When space runs short the small title gives way first; the back link keeps its width and the status pills wrap rather than leave the screen. The small title is a 16px semibold copy of the page title, centred, truncated with an ellipsis when space runs out, `aria-hidden` (the `h1` is the accessible title), and ignores taps. It's hidden while the large title is visible and fades in (`--duration-title`, 180ms) once the large title has scrolled under the header (`data-scrolled="true"`, an `IntersectionObserver`). On phones the header uses the nav's glass (`--color-glass`, blur and saturation, same solid fallbacks; solid `--color-background` otherwise). Its bottom border shows together with the small title, once the large title has scrolled under it. The back link's focus ring uses `--color-text`, as the nav's does, since the grey ring falls under 3:1 on glass. From 640px the header joins the nav in one glass bar (below), and the small title becomes a strip under that bar (DECISIONS 046). Respect `env(safe-area-inset-top)`. Detail screens show a back button (`staticData.back`): chevron plus the parent's name, named "Back to Paints". It goes back when the previous history entry is in the app, otherwise it opens the parent. Installed iOS apps have no browser back button, so this is the only way back there.

Navigation bar:
One nav bar on every screen and every breakpoint: floating at the bottom on phones, part of the top glass bar from 640px. Four destinations:
1. **Paints** (catalog + smart search: name, hex, brand, hue)
2. **My Paints** (owned / wishlist)
3. **Palettes** (named color palettes; `SwatchBook` icon)
4. **Settings** (account, theme, about)

Position by breakpoint (§14):
- Mobile (< 640px): fixed to the bottom of the screen, inset `--space-3` from the left, right and bottom edges, plus `env(safe-area-inset-bottom)`. Spans the width between the insets.
- Tablet and desktop (≥ 640px, DECISIONS 045): part of one sticky full-width glass bar at the top (`.app-shell__bar`). It holds the navigation row (`.app-shell__bar-row`) and the title strip as siblings, with one glass layer (the bar's `::before`) behind both; neither row has a surface of its own. The navigation row has three columns: back link | tabs | status pills. The tabs are centred in the window and sized to their content; the back link and pills line up with the content column (`--content-max-width`) while the glass spans the window. The nav and header have no background, border, shadow or blur of their own there. The header spans the row through `subgrid` and the nav sits above it in the middle column. With both status pills in a narrow window they stack in their column and the bar grows taller. The bar has `--space-3` above and below its row. Once the large title has scrolled under the bar, the small title fades in as a full-width glass strip along the bar's bottom edge, centred, with the bar's `--color-border` line under it (the bar itself has no bottom border here). The strip is its own element, a sibling of the navigation row rather than part of the header. As it fades in, the bar's glass layer slides down over it (`--duration-title`), so both rows sit on one glass with no line between them. It's absolutely positioned against the sticky bar, so it overlays the content instead of moving it; it's `aria-hidden` and ignores taps (DECISIONS 046). Respects `env(safe-area-inset-top)`.

Look:
- On phones, "floating" means detached from the screen edges: inset, `--radius-pill`, and no outline or shadow, so it's the same plain glass as the desktop bar (DECISIONS 046). On a plain screen its edge is only the tint change.
- Frosted glass (DECISIONS 039, 045): `--color-glass` background with `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))`; the desktop bar uses the same glass. Solid Surface (Background for the desktop bar) where `backdrop-filter` isn't supported or `prefers-reduced-transparency: reduce` matches (Chrome reports it; Safari doesn't, and there the glass stays, kept readable by the contrast floor below).
- Height `--tab-bar-height`. Each item shows a 24px icon (`--icon-size-tab`) beside a visible text label on one line (`--space-1` apart on phones, `--space-2` from 640px). Under 360px the icons are hidden and the labels carry the tabs alone, because four items with icons overflow a 320px bar (DECISIONS 050). From 640px each item has `--space-4` padding on each side, dropping to `--space-2` below 768px so the tabs, back link and both status pills fit at 640px. Items size by their content and share the spare width, so all four fit on one line at 320px. With large system text a label wraps instead of staying on one line. Known limit: at 200% text the items don't fit on narrow phones (with three items, Chrome's bar overflowed by about 64px at 320px and 24px at 360px; not re-measured with four), and wrapped labels make the bar taller than the space reserved for it. Items are at least 44×44px.
- Active item: `aria-current="page"` and a filled pill: `--color-primary` background, `--radius-pill`, icon and label in `--color-primary-foreground`. Inactive items: `--color-text` on the bar, no background (muted grey falls under 4.5:1 on glass over a dark swatch). The active style is keyed on `[aria-current="page"]`, not a router class or data attribute, so the look and the announced state can't disagree.
- Focus ring: drawn outside the item with the global positive offset, so it sits on the glass. Nav items use `--color-text` for the ring instead of `--color-ring`, since the grey ring falls under 3:1 on glass over dark content. The bar's `--space-1` padding leaves room for the ring.
- Contrast (SC 1.4.11, 1.4.3): pill vs. Surface 17.9:1 light / 17.2:1 dark; label on pill 17.2:1. On glass, measured against the glass blended over black and over white (`tests/e2e/nav.spec.ts`, and `tests/e2e/header.spec.ts` for the desktop bar): inactive labels at least 4.5:1, the pill and the focus ring at least 3:1, in both themes. The glass needs both `backdrop-filter` and `color-mix()`; without either the bar is solid. Don't use a Secondary background as the marker (1.09:1 on Surface).
- Fallback if the filled pill competes with swatches: an outline pill (Primary border, no fill, Primary text), which still passes 3:1.

Behavior:
- Page content is never hidden behind the bar. On mobile, `main` is padded at the bottom by the bar height, its inset and the bottom safe-area inset. On tablet and desktop the bar is sticky in the page flow, so `main` starts below it and content scrolls under its glass.
- The bar is a `<nav aria-label="Main">` that comes before `<main>` in the DOM at every breakpoint, so keyboard focus order matches the desktop layout. Moving it to the bottom on mobile is CSS only.
- No show/hide on scroll in MVP *(Proposed)*.

Sidebar:
None at any breakpoint.

Segmented control (My Paints):
Two links in a Secondary pill track inside a `nav` named "Collection"; the active one is the same Primary-filled pill as the nav bar's current item, with `aria-current="page"`. Each is at least 44px tall and shows its count as text ("Owned (2)").

Filters open in a bottom sheet: shadcn `Sheet` (`side="bottom"`) on Radix Dialog, not the vaul-based `Drawer` (DECISIONS 023). It's a modal dialog: focus trap, Escape, focus returns to the trigger. There's no swipe-to-dismiss. Max height `--sheet-max-height`, `--radius-lg` top corners, `--color-overlay` backdrop, a scrolling body with header and footer fixed, and bottom safe-area padding. The sheet edits a draft; the primary "Show N paints" commits it, and any other close discards it.

Sheet options (Show only, brand, line, type) are outline-button boxes: `--touch-target` tall, `--space-4` side padding, `--radius-md`, a `--color-input-border` edge, `--space-2` apart, the whole box is the hit area. The native checkbox or radio stays visible inside as the non-color checked cue; checked adds a Primary edge and Secondary fill, and the focus ring wraps the whole box. Hue dots keep their own style.

The Add to palette sheet lists palettes as full-width plain buttons, `--row-min-height` tall with a `--color-border` line under each: the name (semibold) over "n paints" (small, muted). Hover adds a Secondary fill; disabled uses `--opacity-disabled`. "New palette" (outline, plus icon) follows the list. Errors sit at the top in an always-present `alert` region, in `--color-error`.

---

## 12. States

Loading:
Skeleton rows for Convex data: `--row-min-height` blocks in Secondary with `--radius-md`, `aria-hidden`, plus a visible "Loading …" status line. The catalog loads from cache and should be instant; on first visit show a single progress state ("Downloading paint catalog…").

Empty:
Icon, one-line explanation and a primary action. Examples: "No paints match" → Clear all (clears the search box and every filter). "You haven't added any paints yet" → Browse paints.

Error:
Inline message with Retry; a small in-app toast for failed saves (DECISIONS 029): Primary card above the nav bar, `--z-toast`, a 44px Dismiss button, auto-hides after 6 s, in an always-mounted `status` region so it's announced.

Success:
Optimistic UI; no toast for routine toggles.

Disabled:
Own/Want toggles when signed out still render; tapping them opens the app-wide sign-in sheet and the tap is applied after sign-in (DECISIONS 030). Offline and signed out, a tap shows the toast "Signing in needs an internet connection."

Offline:
Small "Offline" pill at the right of the header: Secondary background, `--color-input-border` edge, semibold small text. It's a live `status` region that's always present (empty while online), so the change is announced.

Waiting to sync:
"1 change waiting to sync" / "n changes waiting to sync", a second pill after the Offline one in the same style, `--space-2` apart. Also an always-present `status` region, empty when nothing is queued.

Confirm dialog:
A bottom sheet (the app's `Sheet`, a modal Radix dialog: title, focus trap, Escape closes, focus returns to the button that opened it) with the question as the title, the detail as the description, and Cancel (outline) and the action (destructive) in the footer. Used for signing out with unsynced changes and for deleting the account.

Type to confirm:
For irreversible actions (Delete account), the sheet adds a labelled text field ("Type DELETE to confirm"); the destructive button stays disabled until it matches exactly. Errors show inside the sheet in an always-present `alert` region.

Settings:
`h2` sections in a column, `--space-6` apart: Account, Appearance, About. Secondary text (notes, data sources) is small muted text.

Update available:
A bar fixed above the nav bar on phones (bottom edge from 640px), `--z-toast`. It reads "Update available" with "Later" (ghost) and "Reload" (primary) buttons at full 44px height. "Later" hides it for the session.

Selection bar:
Select mode's bar in Paints and My Paints, a `section` named "Selection". Sticky, not fixed: it rides just above the floating nav on phones (at the bottom edge from 640px) while the list scrolls, and settles after the last row at the end, so it never covers a row however tall it wraps. It spans the content column. It comes right after the result count in the DOM, so Tab reaches it before the list, and `order` draws it last. `--z-tab-bar`, so toasts and sheets stay above it. The nav's frosted glass (`--color-glass`, blur and saturation) with the same solid Surface fallbacks, no border or shadow, `--radius-lg` rather than the pill since it wraps to two rows on narrow phones. Focus rings inside it use `--color-text`, as on the nav. It holds "n selected" (semibold, a `status` region), "Add to palette" (primary) and "Done" (outline) at 44px; offline a small note in text colour (muted grey falls under 4.5:1 on glass) under the count says "Connect to the internet to edit palettes."

Install hint:
A bordered card at the top of the page content, region "Install Grimify", with "Not now" (ghost) and, on Chrome, "Install app" (primary). On iOS it reads "Tap Share [share icon], then Add to Home Screen." It never covers the nav.

---

## 13. Icons

Icon Library: lucide-react (shadcn default)
Default Size: 20px (24px in the tab bar); tokens `--icon-size`, `--icon-size-tab`
Icon Style: Outline (stroke 2); filled variant only for active toggles

---

## 14. Responsive Design

Mobile (default): single column, floating nav bar at the bottom (§11)
Tablet: two-column list/detail where useful; nav in the full-width glass bar at the top (§11)
Desktop: max content width ~1024px, centered; nav in the full-width glass bar at the top (§11)

Breakpoints (use in `@media` queries in component CSS; CSS custom properties can't be used in media queries, so use these literal values):
- Mobile: < 640px
- Tablet: 640–1023px
- Desktop: ≥ 1024px

PWA specifics:
- `viewport-fit=cover`; pad with `env(safe-area-inset-*)`
- Disable pull-to-refresh bounce on the app shell where it interferes
- No hover-only interactions

---

## 15. Accessibility

- Use semantic HTML
- Maintain WCAG AA contrast for text (swatch labels auto-pick black or white)
- Support keyboard navigation (desktop)
- Provide visible focus states
- Provide accessible labels (`aria-label="Mark Mephiston Red as owned"`)
- Do not rely only on color: every swatch shows the paint name; match quality has a text label
- Respect `prefers-reduced-motion`
