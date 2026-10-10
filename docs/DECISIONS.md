# Architecture Decisions

> Status values: **Accepted** (decided) · **Proposed** (recommended, awaiting confirmation) · **Superseded**

## Decision 001 — Vite + React SPA instead of Next.js

Date: 2026-10-05
Status: Accepted

Context:
The app is primarily an installed mobile tool, not a content site. Convex acts as the backend, so a server framework adds little.

Decision:
Vite + React + TypeScript single-page app.

Alternatives:
- Next.js (App Router)
- Astro + React islands
- Hugo (rejected: Go templates, not JS/TS; too static for an interactive app)

Reason:
A simpler mental model for AI-generated code (no server/client components, no hydration bugs), static output hosts free anywhere, and it's the best fit for a PWA.

Consequences:
Positive: simple, fast dev, free static hosting.
Trade-off: weak SEO for individual paint pages. Revisit with Astro or prerendering if search traffic matters.

---

## Decision 002 — Progressive Web App (installable, offline)

Date: 2026-10-05
Status: Accepted

Context:
The goal is an app users open on their phone and save to the home screen, without app stores.

Decision:
Build as a PWA using `vite-plugin-pwa` (Workbox), with an offline-cached catalog.

Alternatives:
- Native apps (React Native/Expo): app store costs and review
- Plain website: no install, no offline

Consequences:
Positive: free distribution, one codebase.
Trade-off: iOS quirks (no install prompt, auth redirects leave the app, storage rules) need specific handling.

---

## Decision 003 — Convex for backend and user data

Date: 2026-10-05
Status: Accepted

Context:
Need a free database, auth integration and real-time sync with strong TypeScript support for AI-assisted coding.

Decision:
Convex (schema, queries, mutations) for user data.

Alternatives:
- Supabase (Postgres + Auth + Storage): SQL is more flexible, but free projects pause after ~1 week of inactivity, and RLS is harder to get right
- Cloudflare D1 + Workers + Better Auth: more wiring

Reason:
All TypeScript, end-to-end types, reactive queries, authorization in plain TS, and AI rules available.

Consequences:
Positive: fast development; real-time sync across devices.
Trade-off: no SQL; higher vendor lock-in (mitigated: the backend is open source and self-hostable). Free-tier usage limits must be watched.

---

## Decision 004 — Paint catalog as static JSON in Git (not in the database)

Date: 2026-10-05
Status: Accepted

Context:
The catalog is a few thousand public, rarely changing records. It must work offline, and search and color matching should be instant.

Decision:
Store the catalog in `data/catalog/*.json`, validate it at build time, and ship it as `public/catalog.json`, cached by the service worker. Convex stores only user data, referencing paints by immutable string ID.

Alternatives:
- Store the catalog in Convex (uses function calls and bandwidth on every browse; offline is harder)
- Hybrid (catalog in both)

Reason:
Zero backend cost for browsing; fully offline; version history and pull-request review for data corrections.

Consequences:
Positive: fast, free, offline, auditable.
Trade-off: catalog updates require a redeploy; no in-app catalog editing; paint IDs must never change.

---

## Decision 005 — Clerk for authentication

Date: 2026-10-05
Status: Accepted

Context:
Need free auth that works inside an installed iOS PWA and integrates with Convex.

Decision:
Clerk, using its official Convex integration (`ConvexProviderWithClerk`). The primary method is an **email one-time code**.

Alternatives:
- Convex Auth: everything in Convex, but more setup and needs a separate email service
- Better Auth: open source, more wiring

Reason:
Most polished option, with prebuilt sign-in UI, a generous free tier, and less code for an AI agent to get wrong.

Consequences:
Positive: fast to set up; production-grade sessions.
Trade-off: an extra external service; users live in Clerk and are mirrored into Convex `users` via `users.store`. Magic links aren't used (they open Safari, not the installed PWA).

---

## Decision 006 — TanStack Router

Date: 2026-10-05
Status: Accepted

Context:
The main screen is a filterable list; filter state should live in the URL.

Decision:
TanStack Router with file-based routes and Zod-validated search params.

Alternatives:
React Router v7 (more examples available, but weaker typing and API churn across versions)

Consequences:
Positive: type-safe links, params and search params.
Trade-off: smaller ecosystem; a slightly steeper start.

---

## Decision 007 — Cloudflare Pages hosting

Date: 2026-10-05
Status: Superseded by 043 (Cloudflare Workers static assets)

Context:
Free static hosting.

Decision:
Cloudflare Pages, deployed from GitHub.

Alternatives:
- Vercel Hobby (personal/non-commercial use only)
- Netlify, GitHub Pages

Reason:
Generous free tier, unlimited static bandwidth, commercial use allowed, preview deployments.

---

## Decision 008 — Client-side color matching with CIEDE2000

Date: 2026-10-05
Status: Proposed

Context:
Cross-brand equivalents are a core feature.

Decision:
Precompute Lab values at build time; compute Delta-E (CIEDE2000, via culori) in the browser. Compare within the same type family by default (opaque, tint, wash, metallic; see DATABASE.md), with a "Show all types" toggle. Allow optional curated overrides in the catalog.

Alternatives:
- Simple RGB distance (perceptually poor)
- Precompute all equivalents at build time (larger JSON; less flexible)

Consequences:
Positive: instant, offline, no backend cost.
Trade-off: hex is only an approximation; metallics, washes and contrast paints match poorly, so a disclaimer is shown.

---

## Decision 009 — Unified smart search (name, hex, brand, hue)

Date: 2026-10-05
Status: Accepted

Context:
Users want to find paints by name, by hex color, by brand, and by color name (e.g., "red-orange").

Decision:
One search box with client-side query parsing: hex → color-distance search; brand name → brand filter; hue name → hue-family filter; remaining text → fuzzy name search. Hue families use the **12-hue artist's color wheel** (Red, Red-Orange, Orange, Yellow-Orange, Yellow, Yellow-Green, Green, Blue-Green, Blue, Blue-Violet, Violet, Red-Violet) plus **Neutral**, because those names are familiar to painters (true Munsell names were considered and rejected). Each paint's hue family (and light/dark value) is computed from its hex at build time and stored in `catalog.json`.

Alternatives:
- Separate screens or tabs for each search type (more navigation)
- Manually tagging each paint's color family (slow and inconsistent)

Consequences:
Positive: one fast, offline search for everything; replaces a separate "Match" tab.
Trade-off: computed hue families from approximate hex can misclassify borderline colors (e.g., browns and muted tones). A per-paint override field (`hueOverride`) allows corrections.

---

## Decision 010 — Offline Own/Want via a local outbox (last-write-wins)

Date: 2026-10-05
Status: Accepted

Context:
A key use case is checking and updating your collection in a hobby store with poor signal. Convex mutations don't persist across reloads while offline.

Decision:
Queue Own/Want changes in an IndexedDB outbox with a client timestamp; replay them on reconnect via the idempotent `userPaints.set` mutation, which applies last-write-wins on `clientUpdatedAt`.

Alternatives:
- Block changes while offline (simpler, worse in-store experience)
- A full offline-sync engine (overkill for two boolean flags)

Consequences:
Positive: works in the store; small, testable code.
Trade-off: conflict handling is simple last-write-wins; device clocks matter (a 5-minute future-skew guard limits abuse).

---

## Decision 011 — Owned and wishlisted are independent flags

Date: 2026-10-05
Status: Accepted

Context:
Painters may own a pot and still want another (running low, replacement).

Decision:
One `userPaints` row per user and paint, with two booleans (`owned`, `wishlisted`). No quantity or notes in MVP.

Consequences:
Positive: simple model, matches real use.
Trade-off: "running low" and quantity are deferred (PRD Nice to Have).

---

## Decision 012 — Plain CSS files per component (no Tailwind, no styles in TSX)

Date: 2026-10-05
Status: Accepted

Context:
Nathan wants styling kept out of .tsx files, with each component's styles in its own CSS file (e.g., `button.css` referenced by `button.tsx`).

Decision:
- Keep shadcn/ui for component structure, Radix behavior and accessibility, but convert every component to plain CSS
- One sibling `.css` file per component, imported by the component
- Design tokens as CSS custom properties in `src/styles/tokens.css`
- Variants and states via `data-*` attributes
- Remove Tailwind, `cva` and `cn()`
- The only `style` prop allowed sets a CSS custom property for data values (e.g., `--swatch-color`)

Alternatives:
- Tailwind classes in TSX (shadcn default): rejected by preference
- Tailwind `@apply` inside CSS files: keeps a Tailwind dependency and is discouraged in Tailwind v4
- CSS Modules (`button.module.css`): scoped class names, but adds `styles.x` references throughout TSX. Could be adopted later if global class collisions become a problem.

Consequences:
Positive: clean TSX; styles live in one predictable place; no build-time CSS framework.
Trade-off: new shadcn components must be converted by hand (or by the agent) after adding them; AI tools default to Tailwind, so AGENTS.md, CODE_STYLE.md and lint rules must enforce this; global class names need the `ui-` / component-name prefix convention.

---

## Decision 013 — Product name: Grimify

Date: 2026-10-06
Status: Accepted

Context:
The PRD left the product name TBD, and the scaffold used "Paint Toolbox" as a placeholder.

Decision:
The product is named Grimify. The package name is `grimify`, and the name appears in the page title and project docs.

Consequences:
The PWA manifest, icons and any Cloudflare Pages project use Grimify when those items land. The repository directory is already `grimify-v2`.

---

## Decision 014 — Floating nav bar: bottom on mobile, top on tablet and desktop

Date: 2026-10-06
Status: Accepted; amended by 045 (from 640px the nav is part of one full-width sticky glass bar, not a floating pill)

Context:
The app is mobile-first, but it also has to work on a desktop. DESIGN_SYSTEM §11 left desktop navigation TBD, with a left rail as the working idea.

Decision:
One floating nav bar (Paints, My Paints, Settings) on every screen. Below 640px it is fixed to the bottom of the screen. At 640px and up it is fixed to the top, centered. It is detached from the screen edges by a small inset. It is a single `<nav aria-label="Main">` that comes before `<main>` in the DOM, and only CSS moves it. Details are in DESIGN_SYSTEM §11.

Alternatives:
- Left rail on desktop (the earlier TBD): uses horizontal space well on wide screens, but means a second navigation component and layout for only three destinations
- Bottom bar at every breakpoint: one layout, but a bottom bar on a desktop monitor is far from the content and unfamiliar
- Top bar at every breakpoint: familiar on desktop, but puts navigation out of thumb reach on phones, against the one-handed design principle

Reason:
Keeps navigation in thumb reach on phones and where desktop users expect it, with one component and one DOM order.

Consequences:
Positive: one nav component; the left rail TBD is closed; keyboard focus order is the same at every breakpoint.
Trade-off: on phones the nav is announced and focused before the content even though it sits at the bottom (mitigate with a skip link if testing shows it is a problem). The app shell needs a 640px media query, and the sticky header must sit below the bar on tablet and desktop. The active item is a Primary-filled pill (DESIGN_SYSTEM §11).

---

## Decision 015 — Seed catalog from the earlier Grimify dataset (PaintPad-derived)

Date: 2026-10-06
Status: Accepted

Context:
DATABASE §13 left the data source and licensing for paint hex values TBD. The earlier Grimify project has a catalog of about 2,900 paints across Citadel, The Army Painter, Vallejo, AK Interactive, Scale75 and Green Stuff World (`../grimify/scripts/data/`). Its own `REFERENCES.md` records that about 95% of the documented hex values were scraped from PaintPad.app in April 2026; Scale75's source isn't documented. PaintPad's terms of use could not be found (`paintpad.app/terms` returned 404 on 2026-10-06).

Decision:
Seed `data/catalog/` from the earlier Grimify dataset. Record its provenance per brand in `data/catalog/SOURCES.md` (SECURITY §9). Ask PaintPad for permission to use the derived hex values before the app is public (ROADMAP NOW). If permission is refused, re-source the hex values; paint IDs stay unchanged.

Alternatives:
- Manufacturer sources only: authoritative where published, but most manufacturers don't publish hex values
- Sample colors by hand from swatch photos: slow, inconsistent, and still derived from someone's photos
- Defer the catalog until a licensed source is found: blocks every catalog-dependent MVP item

Reason:
The data already exists, is broad, and has documented provenance for most brands. The permission question can be settled before launch without changing paint IDs or user data.

Consequences:
Positive: the seed catalog can be imported now.
Trade-off: the catalog republishes third-party compiled data whose terms are unknown. That's a risk until PaintPad answers. The import needs a one-time conversion (old IDs like `cit-1` and types like `Fanatic` don't follow DATABASE §3), and Pro Acryl, a launch brand, isn't in the dataset.

---

## Decision 016 — Committed ledger of published paint IDs

Date: 2026-10-06
Status: Accepted

Context:
Paint IDs are permanent (DATABASE §3), so the build has to fail when a published ID disappears. DATABASE §3 said to compare against the previous `catalog.json`, but `catalog.json` is generated on every build and isn't committed, so CI has nothing to compare against.

Decision:
`data/catalog/published-ids.json` lists every published paint ID and is committed. Validation fails if a listed ID is missing from the source files, and if a source paint ID isn't listed yet. `npm run catalog:ids` adds new IDs; nothing removes them.

Alternatives:
- Commit the generated `catalog.json`: merge conflicts on every data change and large diffs
- Download the deployed `catalog.json` during the build: needs network in CI and has nothing to compare against on the first deploy

Consequences:
Positive: removed IDs fail locally and in CI; every new permanent ID is visible in review.
Trade-off: adding paints takes one extra command. An ID recorded on a branch that is abandoned never merges, so it does no harm.

---

## Decision 017 — `acrylic` paint type

Date: 2026-10-06
Status: Accepted

Context:
DATABASE §3's `PaintType` follows Citadel's paint system (base, layer, shade, contrast…). Most other brands sell general-purpose acrylic lines (Vallejo Model Color, Army Painter Fanatic, AK 3rd Gen, Scalecolor…) that are neither base nor layer paints. That's about 1,565 of the 2,837 seed paints.

Decision:
Add `acrylic` to `PaintType`, in the `opaque` type family.

Alternatives:
- Map them to `layer`: no schema change, but a "Layer" type filter would return Vallejo Model Color
- Map them to `other`: wrong for matching, since `other` gets no automatic equivalents

Consequences:
Positive: type filters stay truthful, and these paints still match against base and layer paints.
Trade-off: one more type for the Paints tab's type filter.

---

## Decision 018 — Seed catalog scope and conversion rules

Date: 2026-10-06
Status: Accepted

Context:
DECISIONS 015 chose the earlier Grimify dataset as the seed. It has six brands and 2,886 paints, but its IDs, types and some names don't fit DATABASE §3, and the PRD left the product lines per brand TBD.

Decision:
- Brands: Citadel, The Army Painter, Vallejo, AK Interactive, Scale75 and Green Stuff World. Green Stuff World joins the launch brands. Pro Acryl, a launch brand missing from the dataset, gets its own ROADMAP item and data source.
- Lines: every line in the dataset except AK Abteilung 502, whose 42 oil paints had no PaintPad-sourced hex values.
- IDs: line `<brandId>-<slug(line)>`, paint `<lineId>-<slug(name)>`. Slugs decode HTML entities, strip accents, drop apostrophes and turn other punctuation into hyphens.
- Each line maps to one `PaintType` (table in `scripts/catalog/import-legacy.ts`); metallic lines also get `finish: "metallic"`. Army Painter Speedpaint Medium is `technical` because it's a colorless medium.
- Same-line duplicates with identical hex are merged; the other spelling becomes an alias.
- The old `comparable` links (334, origin undocumented) and `description` text are not imported.

Consequences:
Positive: 2,837 paints across six brands, converted by tested, recorded rules (`scripts/import-legacy-catalog.ts`); provenance is in `data/catalog/SOURCES.md`.
Trade-off: the IDs are permanent, so a slug mistake can only be patched with an alias. Metallic paints inside non-metallic lines (e.g., Citadel Leadbelcher) aren't typed `metallic` yet. Two Vallejo Model Color merges may have joined separate products that share a name.

---

## Decision 019 — Separate border token for form controls

Date: 2026-10-07
Status: Accepted

Context:
`--color-border` is 1.26:1 on Background. A form control whose border is its only visible boundary needs 3:1 (WCAG 2.1 SC 1.4.11). The search box is the first form control.

Decision:
Add `--color-input-border` (light `#8A8A8A`, dark `#666666`) for form controls only. Cards, dividers and the nav bar keep the soft `--color-border`.

Alternatives:
- Darken `--color-border` everywhere: one token, but every card edge and divider gets heavier, against "paint is the hero"
- Fill inputs with Secondary: Secondary on Background is 1.09:1, so the fill fails too

Consequences:
Positive: controls are findable at AA contrast while decorative chrome stays quiet.
Trade-off: two border tokens to choose between; the rule is "can the user act on it?"

---

## Decision 020 — Rounded-square paint swatches

Date: 2026-10-07
Status: Accepted

Context:
DESIGN_SYSTEM §6 left the swatch shape TBD: circle (like a paint pot top) or rounded square.

Decision:
Swatches are rounded squares with `--radius-md`. Circles are reserved for hue dots.

Alternatives:
- Circle: more distinctive, but identical in shape to the hue-dot filters right above the list, and tighter for the type marker

Consequences:
Positive: filters and paints never look alike; more color area per pixel; room for the corner type marker.

---

## Decision 021 — No "brown" search alias in MVP

Date: 2026-10-07
Status: Accepted

Context:
Brown isn't one of the 13 hue families; the classifier files browns as dark or muted oranges and reds (DECISIONS 009). PRD §12 asked whether "brown" should still work as a search word.

Decision:
No alias. "brown" falls through to fuzzy name search, which matches the 188 paints with Brown in the name.

Alternatives:
- Alias "brown" to a filter (warm hues, dark or mid value, low chroma): needs chroma in `catalog.json` and another tuned threshold, and the definition is fuzzy at both edges

Consequences:
Positive: simple, predictable search.
Trade-off: browns named otherwise (e.g., Rhinox Hide) don't appear for "brown". Revisit if beta users search color words that aren't hue families.

---

## Decision 022 — Match label thresholds

Date: 2026-10-07
Status: Accepted

Context:
PRD and UX_FLOWS name the labels for color distance (Very close, Close, Similar) but never set the values.

Decision:
CIEDE2000 ΔE < 2 → Very close, < 5 → Close, < 10 → Similar, ≥ 10 → no label. Defined in `src/features/matching/delta-e.ts` and shared by hex search and equivalents.

Reason:
ΔE00 ≈ 2 is the usual just-noticeable difference side by side. Catalog hex values are approximations, so finer labels would overstate precision.

Consequences:
Positive: one labelling rule across the app.
Trade-off: a "Very close" on screen can still differ in the pot, especially for metallics and washes; the disclaimer covers it.

---

## Decision 023 — Filter sheet on Radix Dialog, not vaul

Date: 2026-10-07
Status: Accepted

Context:
DESIGN_SYSTEM §11 specified shadcn's `Drawer` for the filter sheet. Drawer is built on `vaul`, whose README says "This repo is unmaintained"; its last release (1.1.2) was in December 2024.

Decision:
Use shadcn's `Sheet` with the bottom side, built on `@radix-ui/react-dialog` (the same Radix family as the existing Button's `react-slot`).

Alternatives:
- shadcn Drawer on vaul: swipe-to-dismiss, but an unmaintained dependency on a core screen
- Native `<dialog>`: no dependency, but focus handling and background scroll locking need hand-written iOS Safari workarounds

Consequences:
Positive: a maintained, accessible modal (focus trap, Escape, focus return, labelled dialog).
Trade-off: no swipe-down gesture; users close with Show, Close, Escape or a tap outside.

---

## Decision 024 — Search box and filter sheet combine

Date: 2026-10-07
Status: Accepted

Context:
The search box already detects brands and hues in typed text (`q`). The sheet adds explicit `brand`, `line`, `type` and `hue` params, which overlap.

Decision:
Keep two layers. The box stays free text with its own detected chips; the sheet sets separate params. Everything ANDs together, and all chips show in one row, each removable.

Alternatives:
- Turn typed brands and hues into filter params: one source of truth, but the box rewrites itself while typing and breaks the hue-word rule (a typed "green" would filter before "death guard" is added)
- Keep two layers but mirror typed terms as selected in the sheet: more consistent, the most code and edge cases

Consequences:
Positive: typed text is never rewritten; the tested search behavior stays as shipped.
Trade-off: typing "vallejo" with Citadel ticked shows "No paints match"; the two chips explain why. Mirroring is the follow-up if beta users find it confusing.

---

## Decision 025 — How equivalents are presented

Date: 2026-10-07
Status: Accepted

Context:
PRD Feature 2 and UX_FLOWS Flow 3 describe equivalents grouped by brand with a "no close match" fallback and a "Show all types" toggle, but leave the threshold, the number per brand and the toggle's persistence open.

Decision:
- "Close" means CIEDE2000 ΔE < 10, the edge of "Similar" (DECISIONS 022). A brand with nothing under it shows "No close match in [Brand]" with its single nearest paint, muted and unlabelled.
- Up to 3 matches per brand; brands are ordered by their closest match.
- "Show all types" is the `?types=all` search param (written with replace, so Back still returns to the list). Technical and other special paints stay curated-only, as the PRD says, even with the toggle.
- Equivalents only come from other brands; a brand's own other lines never appear.

Consequences:
Positive: a short, scannable list per brand that always says something about every brand.
Trade-off: a painter looking for "the same paint in another line" of the same brand (e.g., Mephiston Red Air) won't find it here. A "Same paint in other lines" section is a possible follow-up.

---

## Decision 026 — Bugs and follow-ups are tracked in GitHub Issues

Date: 2026-10-07
Status: Accepted

Context:
Defects and follow-ups found during work items (e.g., metallic paints typed as opaque, the app icon still missing) had nowhere to live except progress logs and chat.

Decision:
Track them as GitHub Issues on `NathanHealea/v2.grimify.app`: label `bug` for defects, `enhancement` for follow-ups. Work items stay in `docs/implementation-plans/`; a work item that fixes an issue links it. The first issues are #1 (metallics typed as opaque), #2 (Vallejo Model Color merges) and #3 (app icon).

Alternatives:
- Bug work items as markdown files only: no single list, and easy to lose between items
- Progress-log notes: already proved easy to miss

Consequences:
Positive: one visible backlog of known problems, outside any single branch.
Trade-off: issues live outside the repo's docs, so a work item that fixes one should restate the problem in its own context.

---

## Decision 027 — Email code only for MVP sign-in

Date: 2026-10-07
Status: Accepted

Context:
PRD §6 and SECURITY §1 left OAuth (Google, Discord) TBD next to the email one-time code.

Decision:
Email one-time code only for MVP, through Clerk's `SignIn` with `withSignUp`, so new and returning users take the same flow. Password, email links and social connections are turned off in the Clerk dashboard.

Alternatives:
- Add Google and/or Discord: faster for people who use them, but OAuth redirects in an installed iOS PWA can open Safari and lose the session, and each provider needs its own setup and real-iPhone testing

Consequences:
Positive: the user never leaves the installed app; nothing extra to configure.
Trade-off: typing a code is slower than one tap. Revisit after the beta; adding a provider is mostly dashboard configuration.

---

## Decision 028 — No profile data copied into Convex

Date: 2026-10-07
Status: Accepted

Context:
DATABASE §4 listed optional `name` and `email` on `users`, and SECURITY §8 said they were "optionally copied" from Clerk. Nothing in the MVP needs them server-side.

Decision:
`users` stores only `tokenIdentifier`. The UI reads email and name from Clerk on the device (e.g., "Signed in as …" in Settings). `users.me` returns only `_id`.

Alternatives:
- Copy email and name into `users` on `users.store`: needed only if server-side code ever emails users

Consequences:
Positive: less personal data in a second system, nothing to keep in sync, and less to clean up on account deletion.
Trade-off: server-side email features would need the fields added later (optional fields, a non-breaking change).

---

## Decision 029 — A small in-app toast instead of Sonner

Date: 2026-10-07
Status: Accepted

Context:
DESIGN_SYSTEM §12 named shadcn's Sonner for failed-mutation toasts. The MVP has one toast message ("Couldn't save. Check your connection.").

Decision:
A ~40-line `Toast` component and `ToastProvider`: one message at a time, an always-mounted `status` live region, a Dismiss button, and a 6 s auto-hide.

Alternatives:
- Sonner: stacking, swipe and promise toasts, but a dependency and a styling conversion for one message

Consequences:
Positive: no dependency; styled with tokens like everything else.
Trade-off: no stacking or swipe. Switch to Sonner if more toast types appear.

---

## Decision 030 — App-wide sign-in sheet with a pending action

Date: 2026-10-07
Status: Accepted

Context:
UX_FLOWS Flow 4 says a signed-out Own/Want tap opens sign-in and the action completes afterwards. The sign-in sheet lived inside Settings.

Decision:
One `SignInProvider` owns the sheet. `useSignIn()(pending?)` opens it from anywhere and remembers at most one pending action. It applies the action once `users.me` is non-null, so `userPaints.set` never races `users.store`. Closing the sheet without signing in drops it. Sign-in returns to the page it was opened from.

Consequences:
Positive: one tap works for signed-out users; Settings and toggles share the same sheet.
Trade-off: if storing the user fails, the pending action is silently dropped (the error is logged).

---

## Decision 031 — My Paints reuses the catalog search, scoped to the collection

Date: 2026-10-07
Status: Accepted

Context:
UX_FLOWS Flow 6 asks for the same rows and search box as the catalog in My Paints. The Paints filter sheet also needed "Show only: Owned / Wishlist / All". AGENTS §3 allows one search code path.

Decision:
`searchPaints` takes an optional scope (a set of paint IDs). My Paints renders the same search screen with the scope set to the active tab's paints, its own URL state, and no Show only filter. The Paints sheet's Show only filter turns into a scope from the collection. Its URL param is `show=owned|wishlist`, replacing the `owned=` placeholder.

Alternatives:
- A separate, simpler My Paints list: less reuse, and a second search path to keep consistent
- `owned=wishlist`: reads wrong

Consequences:
Positive: My Paints gets search, chips, hue dots and filters for free, and they behave identically.
Trade-off: the shared search screen carries a few scope-specific props (`scope`, `emptyScope`, `hideShow`).

---

## Decision 032 — An auto-created E2E test user in the Clerk dev instance

Date: 2026-10-07
Status: Accepted

Context:
`@clerk/testing`'s `clerk.signIn({ emailAddress })` needs the user to exist already. TESTING §5's "Save a paint" journey needs a signed-in user.

Decision:
Playwright global setup ensures `grimify-e2e+clerk_test@example.com` exists in the Clerk development instance, through Clerk's Backend API with `CLERK_SECRET_KEY`. It's idempotent: lookup, then create. `+clerk_test` addresses are never emailed. The journey writes to the dev Convex deployment and cleans up after itself; each device profile uses a different paint.

Alternatives:
- Create the user by hand in the dashboard: one less moving part, but a manual setup step for every new environment, CI included

Consequences:
Positive: `npm run test:e2e` exercises real Clerk and Convex auth end to end. It caught the inactive Convex integration that had blocked every sign-in.
Trade-off: E2E needs `CLERK_SECRET_KEY` and Clerk's servers; the test user lives in the dev instance.

---

## Decision 033 — Favorites is a third independent flag

Date: 2026-10-08
Status: Accepted

Context:
During the My Paints review the owner asked for favorites, shown as a heart, alongside Own and Want, and chose to add it to that work item.

Decision:
`userPaints` gains `favorite`, independent of `owned` and `wishlisted` like DECISIONS 011: a paint can be a favorite whether or not it's owned or wanted. A row lives while any flag is true. My Paints gets a Favorites tab (`tab=favorites`) and the sheet's Show only gets `show=favorites`. The field is `v.optional`: the dev deployment already held rows without it, and a missing value reads as `false`, so no migration is needed.

Alternatives:
- Favorites only among owned paints: simpler meaning, but blocks marking a paint you've used from a friend's pot
- A required field with a backfill: cleaner schema, but a migration for no user-visible gain

Consequences:
Positive: one write path and one row per paint still cover everything.
Trade-off: three toggles per row take about 148px of a 375px phone row. The deleted-row timestamp gap (issue #4) now covers three flags; the outbox item still owns it.

---

## Decision 034 — Toggle icons: plus, bookmark, heart; no tooltips

Date: 2026-10-08
Status: Accepted

Context:
The owner asked for a bookmark for Want, a heart for Favorite and a plus for Own, and asked for tooltips, then dropped them.

Decision:
Own = `Plus`, Want = `Bookmark`, Favorite = `Heart`, `--space-2` apart. No tooltips and no visible labels; each toggle keeps its accessible name ("Mark X as owned / wanted / favorite"). The My Paints nav icon changes from `BookMarked` to `Library`, because a bookmark on every row looked nearly the same as the nav icon.

Alternatives:
- Radix Tooltip: desktop only (it doesn't open on touch) and a new dependency
- Visible labels under icons: work everywhere, but make every row taller

Consequences:
Positive: no new dependency; rows stay compact.
Trade-off: sighted users rely on the icons alone. A pressed plus still reads as "add"; the filled Primary circle is the only on-state cue.

---

## Decision 035 — Cleared collection rows stay as tombstones

Date: 2026-10-08
Status: Accepted

Context:
`userPaints.set` deleted a row when every flag became false, losing its `updatedAt`. A change queued offline before the clear, sent after it, then found no row and re-created the paint (GitHub issue #4). The outbox makes that ordering routine.

Decision:
`set` never deletes. An all-false row stays with its `updatedAt` (or is inserted, when the first change for a paint clears it), so last-write-wins still has the timestamp. `listMine` leaves all-false rows out. Closes #4.

Alternatives:
- A separate deletions table with timestamps: same effect, two tables to keep in step
- Ignore changes older than the client's own last sync: needs per-device state on the server

Consequences:
Positive: one rule, one table; replays stay idempotent.
Trade-off: rows are permanent until account deletion, at most one per user and paint (2,837). Reverting this change leaves the tombstones; the old `listMine` would return them with every flag false, which still reads as not in the collection.

---

## Decision 036 — A device store with the Clerk user ID for offline use

Date: 2026-10-08
Status: Accepted

Context:
Offline, Clerk's script can't load, so the app couldn't tell who was signed in: My Paints loaded forever and toggles asked to sign in. The outbox (DECISIONS 010) needs to know whose changes it holds, and SECURITY said the outbox held no personal data.

Decision:
One IndexedDB record via `idb-keyval` 6.3.0 holds the Clerk user ID, the last `listMine` answer and the outbox. While Clerk hasn't loaded, the stored user ID stands in: the cached collection shows and changes queue. Once Clerk loads, its user wins: a different user clears the record, signed out hides it. Signing out clears it, after a confirmation when changes are pending. The server is unchanged: it never sees the stored ID and derives the user from the token.

Alternatives:
- No stored identity: no offline collection or queueing until Clerk loads, which offline is never
- `localStorage`: synchronous and enough for the size, but DECISIONS 010 and API.md chose IndexedDB
- Raw IndexedDB: about 60 lines instead of a 600-byte dependency

Consequences:
Positive: the app works offline for a returning user, and changes survive reloads.
Trade-off: an opaque user ID sits in browser storage; anyone with the unlocked device can already see the app. iOS may evict storage for a non-installed site after 7 days unused, losing unsynced changes; installed PWAs are exempt. Not solved.

---

## Decision 037 — Delete the Clerk account from the browser

Date: 2026-10-08
Status: Accepted

Context:
API.md left open how the auth account is deleted after `users.deleteAccount`. Clerk offers `user.delete()` in the browser (when the instance allows self-deletion) and a server API that needs the Clerk secret key.

Decision:
Delete account runs `users.deleteAccount`, clears the device record, then calls Clerk's `user.delete()` from the browser. The order matters: Convex needs the Clerk session to know who is asking. The confirmation is typing DELETE in a sheet.

Alternatives:
- A Convex action that deletes the data and calls Clerk's Backend API: closer to one operation, but needs `CLERK_SECRET_KEY` in Convex and still fails halfway the same way
- Confirm twice instead of typing: fewer steps, weaker guard for an action that can't be undone

Consequences:
Positive: no Clerk secret on the server; no new server code beyond the mutation.
Trade-off: not atomic. If `user.delete()` fails, the account exists with no data; the sheet says so and a retry finishes it. The Clerk instance must allow self-deletion (ENVIRONMENT.md); the app reads `deleteSelfEnabled` and explains when it's off.

---

## Decision 038 — Clear the device only after the session ends

Date: 2026-10-08
Status: Accepted

Context:
Sign-out cleared the device record before Clerk's sign-out finished. A failed sign-out lost unsynced changes (#8), and a `listMine` answer during sign-out could save the record again (#6). A first fix, a guard reset only when Clerk's user changed, stuck after a failed sign-out.

Decision:
`useEndSession(action)` runs the Clerk step (sign out, or deletion) with saving to the device and sending the outbox paused. It clears the device record only if the step succeeds; on failure both resume and the error is shown. Account deletion clears the device as soon as the server data is gone, before the Clerk step.

Alternatives:
- Clear first, restore on failure: needs a copy of the record and can still lose changes made in between
- Sign out first, clear on the next signed-out render: leaves a window where the record is re-saved

Consequences:
Positive: a failed sign-out loses nothing; a successful one leaves nothing behind.
Trade-off: while sign-out is pending, a change made on another tab or a server update isn't saved to this device until it finishes or fails.

---

## Decision 039 — Frosted glass nav bar with one-line items

Date: 2026-10-08
Status: Accepted; amended by 045 (glass is 50% Surface in light, 62% in dark, with a saturation boost; from 640px the nav is part of one glass bar)

Context:
Before the first deploy the owner asked for a glass look on the nav bar and for labels that don't stack. On phones each item put its icon above its label, and on desktop "My Paints" wrapped onto two lines because the content-sized bar squeezed equal-share items. Placement stays as DECISIONS 014 set it.

Decision:
The bar's background is Surface at 70% (`--color-glass`) with a 16px background blur (`--glass-blur`), solid where the browser can't blur or reduced transparency is requested. Inactive items use the text colour instead of muted grey. Every item shows its icon beside its label on one line, never wrapping, sized by content.

Alternatives:
- Lighter glass (about 40%) with a stronger blur: closer to iOS, but text over busy swatches drops under 4.5:1
- Keep muted inactive labels: the active/inactive difference is stronger, but fails contrast on glass over dark content

Consequences:
Positive: a lighter-feeling bar that keeps every label readable, tested over black and white in both themes.
Trade-off: inactive and active items differ by the filled pill alone, no longer also by text colour. Safari doesn't report reduced transparency, so people who set it on iPhone still see glass. `backdrop-filter` on a fixed bar costs repaints while scrolling on low-end phones.

---

## Decision 040 — Large page titles with a collapsing glass header

Date: 2026-10-08
Status: Accepted; amended by 045 (from 640px the header joins the nav in one glass bar and the small title is dropped)

Context:
The owner asked for more modern page titles and for the desktop title not to sit at the far left of the window. A preview of iOS-style large titles was approved for every screen size.

Decision:
Each screen's title is a large `PageTitle` (34px, weight 800) at the top of the content, the screen's only `h1`, which also names the browser tab "<title> · Grimify". The sticky header keeps the back link and status pills and shows a small, `aria-hidden` copy of the title once the large one has scrolled under it. The header uses the nav's glass (DECISIONS 039). From 640px its contents line up with the content column.

Alternatives:
- Keep the compact title in the header and only align it on desktop: smaller change, but the owner chose the large-title look
- A large title that shrinks continuously with scroll position: closer to iOS, but needs scroll-linked animation and more paint work for little gain over a fade

Consequences:
Positive: a clear page heading on every screen, tab titles per page (WCAG 2.4.2, which "Grimify" everywhere failed), and a header that lines up with the content on desktop.
Trade-off: the title takes about 48px of content height until you scroll. The header's small title and status pills share the bar, so on a narrow phone with both pills showing the small title truncates.

---

## Decision 041 — Deploy from Cloudflare Pages' own build, with Convex first

Date: 2026-10-08
Status: Accepted; hosting amended by 043 (a Worker, not Pages); deploys and the CSP amended by 044 (one command per environment from the owner's machine; the CSP host is filled in at build). The Convex-first order stands.

Context:
The MVP needs a production home for the private beta. DECISIONS 007 chose Cloudflare Pages from GitHub. The Clerk production instance is on `grimify.app` (Clerk production needs a domain you own), and the Convex production deployment is `nautical-toucan-398`.

Decision:
Pages builds `main` with `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL`, using a production-only `CONVEX_DEPLOY_KEY`. The command builds the frontend against the production URL, then pushes the functions; if either fails, the Pages build fails and nothing is published. Preview builds are off until preview deployments are decided. The app is served at `grimify.app`. `public/_headers` sends a CSP limited to the app, Convex production and Clerk's documented hosts, plus `nosniff`, a referrer policy and a deny-all permissions policy. `public/robots.txt` disallows all crawlers during the beta.

Alternatives:
- GitHub Actions running `npm run check`, then `convex deploy` and Wrangler: blocks a deploy on failing checks, but adds a workflow, a Cloudflare API token and Wrangler for one owner who already runs checks at `wi stage`
- Pages preview builds against the dev Convex deployment: previews per branch, but previews would share dev data and Clerk's dev instance would need the preview hosts in the CSP
- Generate `_headers` at build time from `VITE_CONVEX_URL`: no hard-coded deployment name, but a script for a value that rarely changes

Consequences:
Positive: every `wi release --push` is a deploy, with no extra tooling or secrets outside Pages and Convex; a failed build or function push publishes nothing. Pages publishes `dist/` after the functions are pushed, so for that moment (or if the publish itself fails) production runs new functions with the old frontend.
Trade-off: nothing re-runs the checks on the server, so a push from a red branch would deploy. The CSP is only exercised on grimify.app, because `vite dev` and `vite preview` don't apply `_headers`; a mistake there breaks sign-in in production only. Moving Convex deployments or Clerk domains means editing `_headers`.

---

## Decision 042 — Run zod jitless, with the bundle kept in import order

Date: 2026-10-08
Status: Accepted

Context:
The production CSP (DECISIONS 041) forbids eval. Zod 4 checks whether eval works by calling `new Function("")` and catching the error, so the app still works, but the browser reports a CSP violation on every load. That would hide real Clerk violations in the live checks. Calling `z.config({ jitless: true })` first in `main.tsx` wasn't enough: Rolldown put zod and the route schemas in a shared chunk that ran before `main.tsx`'s own code, and a build served with the CSP still showed three violations.

Decision:
`src/zod-config.ts` sets `z.config({ jitless: true })`, and `src/main.tsx` imports it before anything else that could build a schema. `build.rolldownOptions.output.strictExecutionOrder` is on, so the bundle runs modules in source order. Served under the production CSP, the build reports no eval violations on Paints, search and My Paints.

Alternatives:
- A `src/lib/zod.ts` wrapper that every schema imports: `src/features/catalog/schema.ts` also runs under plain Node for the catalog build and can only import packages
- Set zod's internal `globalThis.__zod_globalConfig` from a separate module script in `index.html`: no bundle cost, but relies on an undocumented name a zod upgrade could break silently
- Accept the violation and exclude it from the live checks: trains people to ignore CSP violations

Consequences:
Positive: a clean console under the CSP, so any violation in the live checks is real. Import order in `main.tsx` means what it says.
Trade-off: Rolldown wraps modules with init helpers, about 32 KB more JavaScript (about 11.5 KB gzipped, 5%). Zod validates the few search-param schemas without its compiled fast path. The bundle also splits differently: the route files' eager parts get their own preloaded chunks, and `.page-title` moves to a stylesheet linked before `index.css`. It still wins today (`h1.page-title` beats the bare `h1`), but a future single-class rule in `index.css` on the same element would now beat it.

---

## Decision 043 — Host on Cloudflare Workers static assets instead of Pages

Date: 2026-10-08
Status: Accepted; amended by 044 (Workers Builds replaced by `npm run deploy:<env>`; Wrangler pinned; dev and stage Workers added)

Context:
DECISIONS 007 and 041 planned a Pages project. Cloudflare's dashboard now creates Workers by default (Pages sits behind a "Looking for Pages?" link), and Cloudflare is folding Pages into Workers, with new features landing on Workers only. The owner connected the repo as the Worker `v2-grimify-app`. Unlike Pages, a Worker with no configuration answers unknown paths with an empty 404, so opening or reloading `/paints`, or launching the installed app at its `start_url`, failed.

Decision:
Keep the Worker. `wrangler.json` makes it assets-only (no `main`), serves `./dist`, and sets `not_found_handling: "single-page-application"`, so unmatched paths get `index.html` with 200. Workers Builds runs the 041 build command, then `npx wrangler deploy`. `public/_headers` and `public/robots.txt` work unchanged; Workers apply `_headers` to static responses.

Alternatives:
- Recreate as a Pages project: no repo change, but puts the app on the product being folded into Workers
- Keep the Worker and add a 404 page: deep links would still fail; the router needs `index.html`

Consequences:
Positive: deep links and reloads work; the hosting follows Cloudflare's direction; one more file pins the deploy target.
Trade-off: a request for a missing hashed asset also gets `index.html` (200, HTML), so a stale tab sees a script MIME-type error rather than a 404; the update prompt is the recovery path. `npx wrangler deploy` downloads the latest Wrangler on every build, unpinned. Renaming the Worker means changing `wrangler.json` in the same change, or the deploy creates a second Worker.

---

## Decision 044 — Dev and stage environments, deployed by one command each

Date: 2026-10-09
Status: Accepted

Context:
Only `main` deployed, from Workers Builds, so nothing could be tried on real hosting with real sign-in before reaching users. A branch build would have pushed that branch's Convex functions to production (041). The owner wants `main ← stage ← dev ← work items`, hotfixes to `main`, dev and stage both deployed, and "a simple command for each deployment" with no web UI. Cloudflare's branch preview URLs are on `*.workers.dev`, where production Clerk keys don't work, and preview deployments in Convex expire.

Decision:
- Three Workers from one `wrangler.json`: production at the top level (`v2-grimify-app`, `grimify.app`), and environments `dev` (`v2-grimify-app-dev`, `dev.grimify.app`) and `stage` (`v2-grimify-app-stage`, `stage.grimify.app`). Domains are declared as custom-domain routes, so `wrangler deploy` creates DNS and certificates.
- Each non-production environment has its own production-type Convex deployment in the existing project (`develop`, `stage`), so dev and stage never touch production collections and a dev deploy can't overwrite stage's functions. All three use the production Clerk instance, which works on subdomains of `grimify.app`.
- `npm run deploy:<env>` (`scripts/deploy.ts`) replaces Workers Builds: it refuses the wrong branch, a dirty or unpushed tree, missing settings, a `pk_test_` key or another deployment's deploy key; then runs `convex deploy` with `--env-file .env.deploy.<env>.local` and no `CONVEX_DEPLOYMENT`, checks the built CSP names that deployment, and runs `wrangler deploy`. Wrangler is a pinned dev dependency.
- `public/_headers` is a template; the build fills in the Convex host from `VITE_CONVEX_URL` and fails on a non-Convex URL. 041 rejected this as "a script for a value that rarely changes"; with three deployments it changes per build.
- Work items use `base_branch: dev`. Promotions are `git merge --no-ff`; hotfixes are done by hand because `wi` has one base branch. Version tags stay on `wi release` merges into `dev`.

Alternatives:
- Workers Builds with branch builds and Cloudflare preview URLs: no laptop deploys, but previews on `*.workers.dev` can't use production Clerk, and every build would need per-branch Convex keys in the dashboard
- Keep Workers Builds for `main` and add commands for dev and stage: production deploys on push, but two deploy paths to keep in step, and a push from a red branch still deploys
- One shared non-production Convex deployment: fewer deployments, but a dev deploy would change stage's functions mid-check
- Production Convex for dev and stage: real collections, but untested code writing real user data, and a dev schema change would break the dev site until it reached `main`
- Allow `*.convex.cloud` in the CSP: no build step, but any Convex deployment (including someone else's) would be a permitted destination

Consequences:
Positive: three environments with real sign-in, isolated data and one command each; a deploy can't run from unpushed code or with the wrong keys; Wrangler no longer floats.
Trade-off: deploys need the owner's machine, with `wrangler login` and three local settings files; nothing deploys on push. Dev and stage share production accounts, so a sign-in on one `*.grimify.app` site signs in on all, and any production user who opens a dev or stage link is signed in there. Delete account clears only the deployment it runs on: deleting on grimify.app leaves dev and stage rows, and deleting on dev or stage deletes the real Clerk account and orphans the production rows. Tracked as issue #20; until it's fixed, SECURITY.md's deletion promise has that gap. Dev and stage data holds production account IDs. Two more Convex deployments count against the free plan.

---

## Decision 045 — Thinner glass, and one glass bar on desktop

Date: 2026-10-09
Status: Accepted; amended by 046 (the bar has `--space-3` above and below its row, the small title returns on desktop as a strip under the bar, and the phone nav loses its outline and shadow)

Context:
On a phone the owner found the nav bar "looks solid when colors are under the bar": the 16px blur mixes small swatches with the gaps between them, and 70% Surface on top (039) left almost nothing showing. On desktop the nav (placed at the top by 014) floated in a strip the sticky glass header reserved, so content never passed behind the nav and the screen showed two stacked glass layers. The owner asked for "one cohesive glass effect navbar" on desktop and chose a full-width bar with the back link, tabs and status pills in one row.

Decision:
- `--color-glass` is the thinnest Surface that keeps text at 4.5:1 over black or white behind it: 50% in light mode, 62% in dark (white text needs more cover). Every glass surface adds `saturate(var(--glass-saturate))`, 180%, behind the blur so colour shows through.
- From 640px the nav and header sit in one sticky full-width glass bar (`.app-shell__bar`): back link left and status pills right, both lined up with the content column, tabs centred. The nav and header have no surface of their own there, and nothing is reserved above the bar, so content scrolls under it. The bar's bottom border shows once the large title has scrolled under it.
- The small header title isn't shown from 640px; the large title stays the page's `h1`. Phones keep the bottom nav and the sticky header with the small title.
- The DOM order (nav "Main", then the header, then `main`) is unchanged; the bar wrapper is `display: contents` on phones.

Alternatives:
- Lower the glass further (about 40%): more see-through, but text drops under 4.5:1 over white in dark mode and over black in light
- Solid desktop header with the floating nav kept: the owner's first ask, but the nav only ever sits over the header, so its glass would never show
- One floating pill holding the back link, tabs and pills: keeps the floating look, but crowds at 640px and still needs content under it
- Keep the small title on desktop: the middle of the bar belongs to the tabs, and the large title already names the page

Consequences:
Positive: colour shows through the glass on phones; desktop has one glass surface with content passing under it.
Trade-off: dark mode can only get a little thinner, so the saturation boost does most of the visible work. Tab reaches the tabs before the back link that sits to their left on desktop (unchanged from 039's layout). With both status pills at 640–800px they stack in their column and the bar grows taller. `subgrid` needs Safari 16, Chrome 117 or Firefox 71.

---

## Decision 046 — A roomier desktop bar with a title strip, and a plain glass phone nav

Date: 2026-10-09
Status: Accepted

Context:
On dev.grimify.app the owner saw swatch colour glow through the desktop bar but not the phone's bottom bar, and asked for the phone bars to match it. The glass values were already identical; the bottom bar differed by its outline and shadow (and its solid active pill sits over the swatch column). On desktop the owner asked for more room in the bar and for the page title to show at the bottom of the bar once the large title has scrolled under it, which 045 had dropped.

Decision:
- The phone nav has no outline and no shadow: plain glass like the desktop bar. The active item stays a solid Primary pill, since its label must stay 4.5:1 over any swatch.
- From 640px the bar has `--space-3` above and below its row.
- From 640px the small title is a full-width glass strip along the bar's bottom edge, centred, fading in once the large title has scrolled under the bar. It's a sibling of the bar's navigation row inside the sticky bar, each row carrying the glass on itself (a `backdrop-filter` on an ancestor would make it the strip's backdrop root), and absolutely positioned so it overlays the content and the list doesn't move when it appears. It carries the bar's bottom line; the bar itself has none on desktop. It stays `aria-hidden` and ignores taps.

Alternatives:
- Keep the phone outline and lighten the shadow: clearer bar edge on a plain screen, but it still reads as a card, not glass
- A see-through active pill: more colour through the bar, but its label can't be shown to stay readable over mid-tone swatches
- Grow the bar by a title row when the title appears: one glass element, but the list jumps by the row's height at the switch point
- Reserve the title row's space all the time: no jump, but an empty band at the top of every page

Consequences:
Positive: the phone and desktop bars look like the same glass; desktop keeps the page name in view while scrolling.
Trade-off: the phone bar's edge on a plain screen is only the tint change, and with reduced transparency in light mode (solid Surface on a Surface-coloured page) it shows no edge at all, only its items. The title strip covers about 40px of the list while it shows. The bar and the strip are two glass layers that meet at an edge; the strip first sat inside the bar with the bar's glass on a `::before` layer, and the two read as different glass, so they were made siblings (bug-title-row-glass).
