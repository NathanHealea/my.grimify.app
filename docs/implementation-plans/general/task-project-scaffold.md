---
type: task
slug: project-scaffold
status: released
branch: task/project-scaffold
worktree_path: ../grimify-v2-worktrees/task-project-scaffold
created: 2026-10-05
approved: 2026-10-05
version: 0.0.1
tag: v0.0.1
merge_commit: squash of task/project-scaffold, tagged v0.0.1
---

# Project scaffold

## Summary

Set up the empty repository as a working Vite + React + TypeScript app with TanStack Router, the plain-CSS styling system, linting that enforces the styling rules, and Vitest. The result is three placeholder screens in an app shell with a bottom tab bar, plus one converted shadcn component (Button) that later conversions copy. Every later ROADMAP item builds on this, so the conventions it sets need to be right the first time.

## Context

ROADMAP NOW item 1. The repo has only `CLAUDE.md` and `docs/`, with no commits and no remote. Scope is option B, agreed in conversation on 2026-10-05: styles, one converted component and the app shell. The full component set was rejected as building ahead of need.

Governing docs: ARCHITECTURE §3, §7 and §8; CODE_STYLE §2–§5a and §10; DESIGN_SYSTEM §0–§15; DECISIONS 001, 006 and 012; UX_FLOWS (routes); TESTING §3, §4 and §7.

Versions were checked against the npm registry on 2026-10-05. Node 24 "Krypton" is the current LTS (v24.21.0, nodejs.org/dist/index.json); Node 26 is current but not LTS yet. TypeScript 7.0.2 is `latest`, but typescript-eslint 8.71.1 declares `typescript >=4.8.4 <6.1.0`, so TypeScript is pinned to 6.0.3.

## Scope

**In scope**

- Vite 8 + React 19 + TypeScript 6.0 (strict) project with the `@/` → `src/` alias
- TanStack Router file-based routes: `/` redirects to `/paints`, and placeholders exist for `/paints`, `/my-paints` and `/settings`
- `src/styles/tokens.css`, `base.css` and `index.css`, with the full token list below
- App shell: a page header (screen title) and a fixed bottom tab bar, both respecting safe-area insets
- `Button` converted from shadcn to `button.tsx` + `button.css`, using tokens only
- ESLint (flat config), Prettier, Stylelint and Vitest + Testing Library
- A local ESLint rule that allows the `style` prop only for CSS custom properties
- npm scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `format` and `check`
- Doc updates that keep the docs consistent with the scaffold (implementation plan step 13)

**Out of scope**

- `/paints/$paintId` and `/sign-in` routes (detail and auth items)
- Zod (first needed when search params arrive)
- Catalog pipeline and `catalog:validate` (item 2); `check` gains catalog validation then
- PWA manifest, service worker, icons, iOS install banner (PWA item)
- Convex, Clerk, `.env.example` (auth item)
- Any shadcn component other than Button
- Playwright and E2E (first E2E arrives with the Paints tab)
- `public/_headers`, CI workflow, Cloudflare Pages (deploy item)
- Error boundary and not-found screen beyond TanStack Router defaults
- Desktop navigation (TBD at the time; since decided as a floating nav bar, DECISIONS 014)

## Dependencies (approved as one list)

Pinned to exact versions checked on 2026-10-05; `typescript` and `@types/node` are held back on purpose.

| Runtime | Version | | Dev | Version |
|---|---|---|---|---|
| react | 19.3.0 | | vite | 8.3.3 |
| react-dom | 19.3.0 | | @vitejs/plugin-react | 6.1.2 |
| @tanstack/react-router | 1.170.41 | | @tanstack/router-plugin | 1.168.42 |
| @radix-ui/react-slot | 1.4.0 | | typescript | 6.0.3 (not 7: typescript-eslint peer) |
| lucide-react | 1.52.0 | | @types/react, @types/react-dom | 19.3.0 |
| | | | @types/node | 24.19.1 (matches Node 24 LTS) |
| | | | eslint / @eslint/js | 10.12.0 / 10.0.1 |
| | | | typescript-eslint | 8.71.1 |
| | | | eslint-plugin-react-hooks | 7.1.1 |
| | | | @tanstack/eslint-plugin-router | 1.162.0 |
| | | | eslint-plugin-simple-import-sort | 14.0.0 |
| | | | globals | 17.13.0 |
| | | | prettier | 3.9.9 |
| | | | stylelint / stylelint-config-standard | 17.16.0 / 40.0.0 |
| | | | vitest | 5.0.3 |
| | | | jsdom | 30.1.2 |
| | | | @testing-library/react / dom / jest-dom | 16.3.3 / 10.4.2 / 7.0.1 |

Total: 5 runtime + 21 dev = 26 packages.

## Tokens

Values marked *Decided* come from DESIGN_SYSTEM. Values marked *Proposed* get added to DESIGN_SYSTEM with that label. Proposed colors use shadcn's Neutral theme values (ui.shadcn.com/docs/theming, fetched 2026-10-05; they map to the same neutral hex scale DESIGN_SYSTEM already uses) except where noted.

| Token | Light | Dark | Status |
|---|---|---|---|
| `--color-primary`, `-secondary`, `-background`, `-surface`, `-text`, `-muted-text`, `-border`, `-success`, `-warning`, `-error` | DESIGN_SYSTEM §3 | §3 | Decided |
| `--color-primary-foreground` | `#FAFAFA` | `#171717` | Proposed (shadcn) |
| `--color-primary-hover` | primary mixed 90% with background | same | Proposed (shadcn `primary/90`) |
| `--color-secondary-hover` | secondary mixed 80% with background | same | Proposed (shadcn `secondary/80`) |
| `--color-ring` | `#737373` (4.74:1 on bg) | `#A3A3A3` (7.85:1) | Proposed. **Deviates from shadcn:** shadcn's light ring `#A3A3A3` is 2.52:1 on white, below the 3:1 non-text contrast minimum (WCAG 2.1 SC 1.4.11) |
| `--color-error-foreground` | `#FFFFFF` (4.83:1 on `#DC2626`) | `#0A0A0A` (5.26:1 on `#EF4444`) | Proposed. White on dark-mode error is 3.76:1, which fails AA for text |
| `--font-sans` | system stack (§4) | | Decided |
| `--text-h1/h2/h3/body/small` + `--leading-*` | 24/32, 20/28, 16/24, 16/24, 13/18 px | | Decided values, Proposed names |
| `--weight-regular/semibold/bold` | 400 / 600 / 700 | | Decided values, Proposed names |
| `--space-*`, `--radius-sm/md/lg/pill`, `--shadow-sm/md/lg` | §5–§7 | | Decided |
| `--border-width` | 1px | | Proposed |
| `--focus-ring-width`, `--focus-ring-offset` | 2px, 2px | | Proposed |
| `--touch-target`, `--touch-target-sm` | 44px, 36px | | Proposed (`sm` for secondary controls only) |
| `--icon-size`, `--icon-size-tab` | 20px, 24px | | Decided values (§13), Proposed names |
| `--header-height`, `--tab-bar-height` | 56px, 56px | | Proposed |
| `--content-max-width` | 1024px | | Decided value (§14), Proposed name |
| `--z-header`, `--z-tab-bar`, `--z-sheet`, `--z-toast` | 10, 10, 50, 100 | | Proposed |
| `--duration-fast`, `--easing-standard` | 150ms, ease-out | | Proposed |
| `--opacity-disabled` | 0.5 | | Proposed |

Swatch radius stays TBD and is not added.

## Requirements

- **R1** — The app runs in dev and builds for production. Visiting `/` lands on `/paints`.
- **R2** — `/paints`, `/my-paints` and `/settings` each render a header whose `<h1>` is the screen title ("Paints", "My Paints", "Settings").
- **R3** — A bottom tab bar is present on every screen. It is a navigation landmark labelled "Main" with three links (Paints, My Paints, Settings), each with a visible text label and a decorative icon. The current screen's link has `aria-current="page"` and a visible active style. Each link is at least 44×44 px.
- **R4** — The header and tab bar stay clear of the notch and home indicator in an installed iOS PWA (safe-area insets), and page content is never hidden behind the fixed tab bar.
- **R5** — `Button` renders a `<button>` with class `ui-button`, exposes `variant` and `size` as `data-variant`/`data-size`, supports `asChild`, merges `className`, and applies disabled and `:focus-visible` styles. All values come from tokens.
- **R6** — Every color, spacing, type, radius and shadow value used in CSS comes from `tokens.css`. Light and dark values switch with `prefers-color-scheme`, and the `theme-color` meta matches the background in both.
- **R7** — Linting fails on: a `style` prop with any key that isn't a `--custom-property`, or a non-object-literal value; hex colors, named colors, color functions or `px` lengths in any CSS file except `tokens.css` (`px` stays allowed in media queries); imports from `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `styled-components`, `@emotion/*`, `react-router`, `react-router-dom` or `next`; `console.log`; out-of-order imports.
- **R8** — `npm run check` (ESLint + Stylelint + `tsc -b` + Vitest) and `npm run build` both pass on a clean install.

## Acceptance criteria

- **AC1** (R1) — Given a clean clone with Node 24, when I run `npm ci && npm run dev` and open `/`, then the URL becomes `/paints` and the Paints screen shows.
- **AC2** (R2, R3) — Given the app is open, when I tap each tab, then the URL and `<h1>` change to match, and only the tapped tab looks and is announced as current.
- **AC3** (R3) — Given VoiceOver or a screen reader, when I list landmarks, then a navigation landmark named "Main" contains three links named Paints, My Paints and Settings, with icons not announced.
- **AC4** (R4) — Given an iPhone with a notch or the iOS Simulator, when the page is opened in standalone mode (added to the home screen), then the header sits below the status bar, the tab bar sits above the home indicator, and scrolling content can reach its last line.
- **AC5** (R6) — Given the OS is switched between light and dark, when I reload, then background, text, border and tab-bar colors switch and the browser chrome color matches.
- **AC6** (R6, R7) — Given any component CSS file, when I add `color: #fff;` or `padding: 12px;`, then `npm run lint` fails; when the same line is in `tokens.css`, it passes.
- **AC7** (R7) — Given a `.tsx` file, when I add `style={{ color: "red" }}`, `import clsx from "clsx"` or `console.log("x")`, then `npm run lint` fails; `style={{ "--swatch-color": hex }}` passes.
- **AC8** (R8) — Given a clean install, when I run `npm run check && npm run build`, then both exit 0 with no warnings from ESLint or Stylelint.

## Test plan

Unit tests sit next to the code (TESTING §4). Lint-tooling tests go in a new top-level `lint/` folder next to the rule they cover.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `redirects / to /paints` | `src/router.test.tsx` | Memory history at `/`; after `router.load()`, `router.state.location.pathname` is `/paints` |
| T2 | R2 | `renders the screen title for %s` (each of 3 routes) | `src/router.test.tsx` | Heading level 1 with the expected text |
| T3 | R3 | `renders a Main navigation with three labelled tabs` | `src/components/app-shell.test.tsx` | `getByRole("navigation", { name: "Main" })` contains 3 links with names and `href`s `/paints`, `/my-paints`, `/settings` |
| T4 | R3 | `marks only the current tab with aria-current` | `src/components/app-shell.test.tsx` | At `/my-paints`, only "My Paints" has `aria-current="page"` |
| T5 | R3 | `hides tab icons from assistive tech` | `src/components/app-shell.test.tsx` | Each tab's `svg` has `aria-hidden="true"` |
| T6 | R5 | `renders a button with default variant and size` | `src/components/ui/button.test.tsx` | `<button>` with class `ui-button`, `data-variant="default"`, `data-size="md"` |
| T7 | R5 | `exposes variant and size as data attributes` | `src/components/ui/button.test.tsx` | `variant="destructive" size="sm"` → matching data attributes |
| T8 | R5 | `merges className after ui-button` | `src/components/ui/button.test.tsx` | `className="x"` → class is `ui-button x` |
| T9 | R5 | `renders the child element when asChild is set` | `src/components/ui/button.test.tsx` | `<Button asChild><a href="/x">` renders an `<a>` with `ui-button` and data attributes, no `<button>` |
| T10 | R5 | `does not fire onClick when disabled` | `src/components/ui/button.test.tsx` | `disabled` attribute present; click handler not called |
| T11 | R7 | `allows style objects with only custom properties` | `lint/style-prop-custom-properties-only.test.js` | Valid: `{ "--a": x }`, `{ "--a": x, "--b": y }`, no `style` prop |
| T12 | R7 | `rejects style objects with regular CSS properties` | `lint/style-prop-custom-properties-only.test.js` | Invalid: `{ color: "red" }`, `{ "--a": x, color: y }` |
| T13 | R7 | `rejects non-literal style values` | `lint/style-prop-custom-properties-only.test.js` | Invalid: `style={obj}`, `{ ...obj }`, `{ [key]: x }` |
| T14 | R6, R7 | `rejects raw colors and px outside tokens.css` | `lint/stylelint-config.test.js` | `stylelint.lint` on `a.css` with `#fff`, `white`, `rgb(0 0 0)`, `12px` → errors; same code as `src/styles/tokens.css` → no errors |
| T15 | R7 | `allows px in media queries and BEM class names` | `lint/stylelint-config.test.js` | `@media (min-width: 640px)` and `.ui-card__header` → no errors |

**Not unit testable:**
- R4: safe areas. Manual check on an iPhone or the iOS Simulator in standalone mode (AC4).
- R6: light and dark rendering. Manual (AC5); T14 covers the tokens-only rule.
- R7: banned imports, `console.log` and import order. These are ESLint config rather than custom code. Manual check per AC7 against a scratch file, deleted afterwards.
- R8: the `check` and `build` commands themselves are the verification.

## Implementation plan

0. [x] **Prerequisite (approved 2026-10-05):** initial commit of `CLAUDE.md` + `docs/` on `main`, so the worktree has a base.
1. [x] Create `package.json` (name `paint-toolbox`, `"type": "module"`, `"engines": { "node": ">=24" }`, `private: true`), `.nvmrc` (`24`) and `.gitignore` (`node_modules`, `dist`, `coverage`, `.env.local`, `.env*.local`). Install the dependency list with exact versions. Touches `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`.
2. [x] TypeScript configs follow Vite's project-reference layout. `tsconfig.json` references `tsconfig.app.json` (`src/`; `strict`; `jsx: react-jsx`; `@/*` paths) and `tsconfig.node.json` (`vite.config.ts`, `lint/`). Add a type declaration letting `CSSProperties` accept `--*` keys, needed for `--swatch-color`. Touches `tsconfig*.json`, `src/types/css.d.ts`, `src/vite-env.d.ts`.
3. [x] Configure Vite and Vitest. In `vite.config.ts`, the TanStack router plugin (`autoCodeSplitting`) goes **before** `react()`, and the `@` alias uses `fileURLToPath`. The `test` block sets `environment: "jsdom"` and `setupFiles`, and includes `src/**/*.test.{ts,tsx}` and `lint/**/*.test.js`. Touches `vite.config.ts`, `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`).
4. [x] Styles. `tokens.css` holds the token table above, with dark values under `@media (prefers-color-scheme: dark)`. `base.css` is a minimal reset plus `html`/`body` font, color and background, heading sizes, `:focus-visible` default and a `prefers-reduced-motion` reset (the only `!important`). `index.css` imports both. Touches `src/styles/tokens.css`, `base.css`, `index.css`.
5. [x] HTML entry, `main.tsx` and router factory. `index.html` gets `lang="en"`, `viewport-fit=cover`, two `theme-color` metas (light `#FFFFFF`, dark `#0A0A0A`) and `<title>Paint Toolbox</title>`. `createAppRouter(history?)` lives in `src/router.ts` so tests can use memory history. Touches `index.html`, `src/main.tsx`, `src/router.ts`.
6. [x] Routes: `__root.tsx` renders `<AppShell><Outlet/></AppShell>`; `index.tsx` redirects to `/paints` in `beforeLoad`; `paints/index.tsx` (a folder, so `$paintId.tsx` can sit beside it later without becoming a layout route), `my-paints.tsx` and `settings.tsx` each set `staticData.title` and render a short placeholder line. Generate `src/routeTree.gen.ts` with the router plugin and commit it, because `tsc -b` runs before `vite build` and needs it. Touches `src/routes/*`, `src/routeTree.gen.ts`.
7. [x] App shell and header. *(Revised: the header lives in `AppShell` and reads the title from route `staticData`; no separate `PageHeader` component.)* `AppShell` contains `<main>` plus the tab bar `<nav aria-label="Main">`, with a `<ul>` of TanStack `Link`s, lucide icons (`aria-hidden`) and text labels. The active style hangs off the attribute `Link` sets for the active route, never a class map. The header is sticky with `padding-top: env(safe-area-inset-top)`. The tab bar is fixed with `padding-bottom: env(safe-area-inset-bottom)`. `main` gets bottom padding equal to the tab bar height plus the bottom inset. Icons: `Palette`, `BookMarked`, `Settings` (names checked against lucide at implementation). Touches `src/components/app-shell.tsx/.css`.
8. [x] Button: port from the current shadcn button source onto `@radix-ui/react-slot`, per CODE_STYLE §5a. Every raw value in the doc example becomes a token (`--touch-target`, `--border-width`, `--color-error-foreground`, `--opacity-disabled`, …). Touches `src/components/ui/button.tsx`, `button.css`.
9. [x] Prettier: `printWidth: 100`. Ignore `src/routeTree.gen.ts`, `dist`, `coverage`, `package-lock.json` and `*.md` (so hand-written docs are not reflowed). Touches `.prettierrc.json`, `.prettierignore`.
10. [x] Stylelint: `stylelint-config-standard` plus the rules below, then write T14–T15. Touches `stylelint.config.js`, `lint/stylelint-config.test.js`.
    - **Applies to all CSS:** `color-no-hex`, `color-named: "never"`, `function-disallowed-list` (rgb, rgba, hsl, hsla, oklch, lab, lch), and `unit-disallowed-list: ["px"]` with media features ignored.
    - **Override for `src/styles/tokens.css`:** turns all four of those rules off.
    - **`selector-class-pattern`:** allows BEM class names (`block__element`).
11. [x] ESLint flat config plus the local rule, then write T11–T13. Touches `eslint.config.js`, `lint/style-prop-custom-properties-only.js`, `lint/style-prop-custom-properties-only.test.js`.
    - **Configs:** `@eslint/js` recommended, `typescript-eslint` recommended type-checked, `react-hooks` recommended, `@tanstack/eslint-plugin-router` recommended, `simple-import-sort`.
    - **Rules:** `no-console` (allow `warn` and `error`), `no-restricted-imports` with the list in R7, and `local/style-prop-custom-properties-only`.
    - **Ignores:** `dist`, `src/routeTree.gen.ts`.
12. [x] Tests T1–T10. Touches `src/router.test.tsx`, `src/components/app-shell.test.tsx`, `src/components/ui/button.test.tsx`.
13. [x] Scripts and verification. Run `npm run check && npm run build`, then check AC6 and AC7 with a scratch file and delete it. Touches `package.json`.
    - **`lint`:** `eslint . && stylelint "src/**/*.css"`.
    - **`typecheck`:** `tsc -b`.
    - **`test`:** `vitest run`.
    - **`check`:** `npm run lint && npm run typecheck && npm test`.
    - **`build`:** `tsc -b && vite build`.
14. [x] Doc updates. Touches the docs listed.
    - **DESIGN_SYSTEM §3–§7 and §13:** token names, plus the Proposed tokens with their labels.
    - **CODE_STYLE §5a:** the example uses tokens only.
    - **CODE_STYLE §10:** names simple-import-sort and the local rule.
    - **ARCHITECTURE §7:** drop `cn` from `src/lib`, replace `tests/unit/` with colocated tests, and add `lint/`.
    - **TESTING §7:** `check` excludes `catalog:validate` until item 2.
    - **CLAUDE.md:** add the `style` exception for CSS custom properties.
    - **DECISIONS 006:** status Proposed → Accepted.
    - **DESIGN_SYSTEM §8:** the 44×44 minimum applies to primary controls; Button `sm` (36px) is allowed for secondary controls only.

**Must not change:** nothing outside the files listed. DECISIONS entries are not edited here except as noted in the open questions.

## Risks and open questions

- **Resolved: initial commit.** Approved 2026-10-05; step 0 commits `CLAUDE.md` + `docs/` to `main`.
- **Resolved: DECISIONS 006 is Accepted.** Recorded in step 14.
- **Resolved: `Button` `sm` stays 36px** for secondary controls only. 36px passes WCAG 2.1 AA, which has no target-size criterion at AA. DESIGN_SYSTEM §8 is clarified in step 14.
- **Decided by default: `routeTree.gen.ts` is committed** and excluded from lint and format, because `tsc -b` needs it before Vite generates it.
- **Decided by default: import order uses `eslint-plugin-simple-import-sort`.** CODE_STYLE §4 left linter vs. formatter open.
- **Decided by default: product name placeholder `paint-toolbox`** in `package.json` and "Paint Toolbox" in `<title>`. Changing it later is a two-line edit.
- **Risk: new major versions everywhere.** Vite 8, plugin-react 6, Vitest 5, ESLint 10 and TS 6 are only checked through peer ranges. They haven't been installed together yet. A mismatch costs time in step 1 or 3, and the fix is an older minor version, not a workaround.
- **Risk: dependency count.** The total is 26 packages, more than the ~15 estimated in chat. The extras are type packages, Testing Library peers, `globals`, `@eslint/js` and `simple-import-sort`.
- **Unverified: TanStack `Link` attributes.** I recall that `Link` sets `aria-current="page"` and `data-status="active"` on active routes, but haven't checked. T4 will confirm.
- **Accessibility (WCAG 2.1 AA), later items:**
  - Muted text on Secondary is 4.35:1, which fails 4.5:1 for body text.
  - Border on Background is 1.26:1, which fails 3:1 if a border is the only thing marking an input's boundary (SC 1.4.11).
  - Neither affects this scaffold. Both need resolving before Input and Card ship, and they get recorded in DESIGN_SYSTEM.
- **Estimate:** 1–2 sessions, assuming the new majors install cleanly. Add half a session if a peer conflict forces version changes.

## Progress log

- 2026-10-05 — Planned.
- 2026-10-05 — Approved. Initial commit allowed; DECISIONS 006 to be marked Accepted; Button `sm` kept at 36px for secondary controls.
- 2026-10-05 — Implementation started in worktree `../grimify-v2-worktrees/task-project-scaffold` on `task/project-scaffold`. No remote; push steps are skipped.
- 2026-10-05 — Steps 1–7 done. Drift: `PageHeader` folded into `AppShell`; titles come from route `staticData` so the page has one header landmark. Steps 6 and 7 share a commit because the routes and shell depend on each other's types. T1–T5 written early and passing; added `src/test/render-route.tsx` helper and explicit Testing Library cleanup (Vitest globals are off). `npm audit`: 7 high findings, all one `braces` advisory reached through Stylelint (dev-only, no fixed version available).
- 2026-10-05 — Steps 8–14 done. `npm ci` → `npm run check` (26 tests in 5 files) and `npm run build` exit 0; Prettier clean. AC6 and AC7 checked with scratch files (removed). Drift: T14 split into two tests (component CSS rejected / `tokens.css` allowed); lint tests run in the node environment; the test setup stubs `window.scrollTo`, which jsdom lacks; `only-throw-error` allows `Response` for TanStack's `throw redirect()`. Not yet verified: AC1–AC5 (manual in a browser and on an iPhone in standalone mode). `npm ci` warns that `fsevents` install scripts are not approved; left for the owner to decide.
- 2026-10-05 — Owner approved the `fsevents` install script (`node-gyp rebuild`). Recorded in `package.json` `allowScripts`, pinned to 2.3.3; an fsevents version bump will prompt again.
- 2026-10-06 — Product renamed to Grimify at the owner's request (Decision 013): package name, lockfile, `<title>`, CLAUDE.md, AGENTS.md, PRD and the ARCHITECTURE tree. Out of the original scope; the plan text above still says `paint-toolbox`.
- 2026-10-06 — Staged. `npm ci`, then `lint`, `typecheck`, `test` (26 tests in 5 files), `build` and `prettier --check` all exit 0. Self-review fixed CLAUDE.md's description of `npm run check`. Version 0.0.1; no changelog in the repo. No remote, so nothing was pushed; review is the local branch `task/project-scaffold`. AC1–AC5 still need a manual check.
- 2026-10-06 — Released. Owner approved the review and confirmed AC1–AC5. Squash-merged 18 commits from `task/project-scaffold` into `main` as 0.0.1, tagged `v0.0.1`. Worktree and branch removed.
