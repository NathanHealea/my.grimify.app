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
Status: Accepted; promotions amended by 055 (fast-forward only, hotfixes merged back into `dev` only); tags now sit on each item's last commit, since `wi release` fast-forwards (see 055's Context)

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
- From 640px the small title is a full-width glass strip along the bar's bottom edge, centred, fading in once the large title has scrolled under the bar. It's a sibling of the bar's navigation row inside the sticky bar, and one glass layer (the bar's `::before`, not the bar itself, since a `backdrop-filter` on an ancestor would make it the strip's backdrop root) sits behind both rows, sliding down over the strip as it fades in. The strip is absolutely positioned so it overlays the content and the list doesn't move when it appears. It carries the bar's bottom line; the bar itself has none on desktop. It stays `aria-hidden` and ignores taps.

Alternatives:
- Keep the phone outline and lighten the shadow: clearer bar edge on a plain screen, but it still reads as a card, not glass
- A see-through active pill: more colour through the bar, but its label can't be shown to stay readable over mid-tone swatches
- Grow the bar by a title row when the title appears: one glass element, but the list jumps by the row's height at the switch point
- Reserve the title row's space all the time: no jump, but an empty band at the top of every page

Consequences:
Positive: the phone and desktop bars look like the same glass; desktop keeps the page name in view while scrolling.
Trade-off: the phone bar's edge on a plain screen is only the tint change, and with reduced transparency in light mode (solid Surface on a Surface-coloured page) it shows no edge at all, only its items. The title strip covers about 40px of the list while it shows. The strip's glass slides in rather than fading with its text. Two glass layers (first the strip inside the bar, then the strip and the row as siblings) each blurred separately and showed a faint line where they met, hence the one shared layer (bug-title-row-glass).

---

## Decision 047 — Palettes pulled forward as an online-only first version

Date: 2026-10-12
Status: Accepted

Context:
"Painting recipes and schemes" sat under PRD §8 Future and ROADMAP LATER. The owner wants painters to collect the paints for a scheme ("Ultramarines", "Nurgle Rot") now, sorted into named groups, before recipes with steps exist. The epic is `docs/implementation-plans/palettes/epic-palettes.md`.

Decision:
- Signed-in users get named color palettes made of catalog paints, in a fourth tab, Palettes (`SwatchBook` icon), between My Paints and Settings. Routes `/palettes` and `/palettes/$paletteId`.
- Online only for this version. Palette screens read straight from Convex queries; nothing is stored on the device and there's no outbox. Offline, an already-loaded list or palette stays visible, editing is disabled, and the screen says "Connect to the internet to edit palettes." With nothing loaded it says "Palettes need an internet connection."
- A palette stores paint IDs only, never copied names or hex. Names and swatches come from the catalog on the device.
- Recipe steps, sharing, export, arbitrary hex colors and signed-out palettes stay out of scope.

Alternatives:
- Wait for full recipes (steps, order, notes): more useful per palette, but a much larger first release
- Offline editing through an outbox like the collection's (DECISIONS 036): matches My Paints, but reorders and moves merge badly by entry, and it doubles the work of the first version

Consequences:
Positive: a first version ships in four small stories; paint IDs keep palettes valid across catalog renames.
Trade-off: palettes behave differently from My Paints offline. After a reload offline, a palette that was open shows "Palettes need an internet connection" because Convex keeps query results only in memory. The nav has four tabs, which is tight at 320px (DECISIONS 039).

---

## Decision 048 — One document per palette, with caps

Date: 2026-10-12
Status: Accepted

Context:
Palettes need a main list in a user-chosen order and named groups that reference paints from it (a paint at most once per list, in any number of groups). Later stories add drag and drop, where one drag can reorder a list or move a paint between groups. The stored shape is a one-way door once users have data.

Decision:
- One `palettes` document per palette: `userId`, `name`, `paintIds` (main list, in order), `groups` (`{ id, name, paintIds }[]`, in order) and `updatedAt` (server time). Index `by_userId`.
- Groups are in the stored shape from the first story, empty until the groups story, so no migration is needed later.
- Caps, enforced server-side: 50 palettes per user and names of 1–60 characters after trimming, both enforced now (`PALETTE_LIMIT`, `PALETTE_NAME_INVALID`). 200 paints per palette and 30 groups per palette land with the stories that add paints and groups. (The 200-paint cap is enforced from the palette-paints story, `PALETTE_FULL`; DECISIONS 051. The 30-group cap is enforced from the palette-groups story, `GROUP_LIMIT`; DECISIONS 052.)
- Another user's palette behaves exactly like a missing one: `palettes.get` returns `null`, and `rename` and `remove` throw `NOT_FOUND`. `palettes.get` takes a plain string and returns `null` for anything that isn't a palette ID, so a mangled URL shows "Palette not found" instead of failing argument validation.
- `users.deleteAccount` deletes the caller's palettes in the same transaction as the `users` row. The 50-palette cap keeps that inside one transaction.

Alternatives:
- Separate `paletteEntries` and `paletteGroups` tables with order keys: scales to very large palettes, but a move touches several rows and the membership rules have to hold across them

Consequences:
Positive: every reorder or move is one atomic write, and the membership rules live in one place. With the caps a palette stays far under Convex's 1 MiB document limit.
Trade-off: per-entry data (for example a note per paint) would need a migration. A palette's whole document is rewritten on every change.

---

## Decision 049 — Last write wins for concurrent palette edits

Date: 2026-10-12
Status: Accepted

Context:
A user can edit the same palette on two devices. With one document per palette (DECISIONS 048), each mutation rewrites the fields it changes.

Decision:
Concurrent edits are last write wins on the document. There's no merge and no conflict warning in this version.

Alternatives:
- Version numbers with a conflict prompt: no silent loss, but extra UI for a rare case
- Per-entry merge: needs per-entry storage, which DECISIONS 048 rejects

Consequences:
Positive: simple, and Convex's reactive queries show the other device's change right away.
Trade-off: if two devices change the same list at nearly the same moment, the earlier change is lost.

---

## Decision 050 — Hide nav icons on the narrowest phones

Date: 2026-10-12
Status: Partly superseded by 054 (phones now show icons only, with labels visually hidden, and the 360px rule is gone); the 640–767px padding still stands

Context:
The Palettes tab (DECISIONS 047) makes four nav items. With icons, they overflow a 320px bar by up to 43px and "My Paints" wraps, and phone padding is already `--space-1`. At 640px the desktop bar, with the back link and both status pills showing, ran 19px past the screen.

Decision:
Under 360px the tab icons are hidden and the labels alone name the tabs. Icons stay at every other width. From 640px to 767px the tabs' side padding drops from `--space-4` to `--space-2`.

Alternatives:
- Shorter labels (for example "Mine" for My Paints): keeps icons, but renames a tab people already know
- Let labels wrap at 320px: keeps icons, but the bar grows taller than the space reserved for it
- Hide icons from 640px to 767px too: works, but drops icons where tighter padding is enough

Consequences:
Positive: every label stays on one line at 320px and 640px with no renamed tabs.
Trade-off: phones under 360px lose the icons; the labels and `aria-current` pill still mark each tab.

---

## Decision 051 — Add paints through a picker and Select mode; remove without confirmation

Date: 2026-10-12
Status: Accepted

Context:
Palettes could be created but stayed empty (DECISIONS 047). Painters need to put catalog paints in and take mis-adds out. Paint rows in Paints and My Paints already carry three 44px toggles (Own, Want, Favorite); at 320px they leave the name about 80px, and a fourth button would leave about 28px. Building a scheme often means adding several paints at once.

Decision:
- **Adding:** an "Add to palette" button on paint detail, and a Select mode in Paints and My Paints. Both open one picker sheet that lists the user's palettes plus "New palette". Rows get no add button of their own. Select mode swaps each row's toggles for a checkbox, ticks survive search and filter changes, and paints are added in the order ticked.
- **Server:** `palettes.addPaints({ paletteId, paintIds })` appends the IDs not already in the main list, in order, and returns `{ added }`. `palettes.removePaint({ paletteId, paintId })` removes a paint from the main list and every group.
- **Paint IDs** are checked for shape only (`INVALID_PAINT_ID`), not against the catalog, the same as `userPaints.set`. A paint missing from the catalog shows as "Unknown paint".
- **Caps:** 200 paints per palette (DECISIONS 048) and at most 200 IDs per call. An add that would go over adds nothing and throws `PALETTE_FULL`; the picker shows "This palette is full (200 paints)". Select mode stops at 200 ticks, so one add always fits an empty palette.
- **Removal has no confirmation.** It takes effect at once with the toast "Removed <name>". Re-adding is one tap from the paint's page. There's no undo, because toasts have no action button.
- **Signed out**, Add to palette on paint detail opens sign-in and doesn't replay after sign-in, unlike Own/Want (DECISIONS 030). Select mode isn't offered signed out.

Alternatives:
- A fourth "Add to palette" button on every row: one tap from the list, but it squeezes paint names to about 28px at 320px
- Checking IDs against the catalog on the server: catches made-up IDs, but the catalog is static JSON outside Convex (DECISIONS 004), so the server would need its own copy kept in sync
- A confirmation sheet for Remove: guards against a mis-tap, but slows the common case for an action that's cheap to reverse
- Replaying the add after sign-in, as Own/Want does: smoother, but it needs a pending palette choice held across the sign-in sheet and then the picker

Consequences:
Positive: rows keep their room for names; many paints go in with one write; a mis-add is undone in one tap.
Trade-off: adding from the list takes Add to palette, tick, Add to palette, choose. The picker doesn't show which palettes already hold the paint, so the user learns that from the "Already in" toast. A mis-tapped Remove loses the paint's place in the list; re-adding puts it at the end.

---

## Decision 052 — Group paints through menus, with server-made group IDs

Date: 2026-10-13
Status: Accepted; reordering added by 053

Context:
Groups have been in the palette document since DECISIONS 048 but nothing created them. Painters want to sort a palette's paints into named groups such as "Armor" and "Highlights", with a paint in several groups at once. Every paint stays in the main list; a group only points at paints already there. Drag and drop comes in a later story (palette-drag-drop), and every action needs a menu path for keyboard and screen reader users anyway.

Decision:
- **Layout:** the palette screen shows the main list under an "All paints" heading, then each group as a section headed by its name, in creation order, then a "New group" button.
- **Adding to groups:** when the palette has at least one group, each main-list row gets a "Groups for <paint>" button next to Remove. It opens a sheet with one checkbox per group; ticking or unticking saves at once, with no toast.
- **Paints in a group:** each row has an "Actions for <paint> in <group>" button opening a sheet with "Move to group…", "Copy to group…" and "Remove from group". Move and Copy list the other groups; one that already holds the paint is disabled and marked "(already in it)". Group rows don't link to paint detail, so the actions button is the row's only control; the main list keeps the link.
- **Group actions:** "Actions for group <name>" opens Rename and Delete group. Rename is inline: the heading becomes a field with Save and Cancel. Delete asks first and keeps the group's paints in the palette.
- **Server:** six mutations (`createGroup`, `renameGroup`, `removeGroup`, `addPaintToGroup`, `removePaintFromGroup`, `movePaintToGroup`), each behind `requireUser` and the palette owner check. A paint must be in the main list to join a group (`PAINT_NOT_IN_PALETTE`); an unknown group is `GROUP_NOT_FOUND`; 30 groups per palette (`GROUP_LIMIT`).
- **Group IDs are made on the server:** 8 base-36 characters from `Math.random`, which Convex seeds per function run, picked again on a clash within the palette. Clients never choose them.
- **Duplicate group names are allowed.** Names follow the palette rules: 1–60 characters after trimming.
- **No per-group paint cap.** The 200-paint main list and 30 groups bound the document.
- **Reordering paints or groups** is left to the drag and drop story, which also adds its keyboard equivalent. Until then groups keep creation order and paints keep the order they were added.

Alternatives:
- Waiting for drag and drop: one gesture per change, but it needs a keyboard path anyway (WCAG 2.1.1), and groups would wait a story longer
- An actions menu on main-list rows instead of a Groups button: one button per row, but putting a paint in several groups takes a trip through the menu per group
- Client-made group IDs: the client knows the ID before the save lands, but the server would have to check each one's shape and uniqueness, and a client could pick IDs on purpose
- Unique group names: avoids two "Armor" sections, but adds an error for something that does no harm
- A per-group paint cap: tighter document size bound, but another limit to explain for a case the main-list cap already covers

Consequences:
Positive: every group action works by keyboard and screen reader, a paint can sit in any number of groups with one tap each, and group IDs can't collide or be guessed into another palette.
Trade-off: main-list rows carry two 44px buttons (Groups and Remove), which leaves the paint name about 150px at 320px, down from about 200px; long names wrap. At the theoretical worst, 30 groups each holding 200 paint IDs of 100 characters, a palette is about 600 KB, under Convex's 1 MiB limit but not by much; with real IDs it's about 180 KB. Group edits follow last write wins (DECISIONS 049), so two devices editing groups at once can lose one change. Painters can't open a paint from its group row.

---

## Decision 053 — Arrange palettes by drag and drop, in an arrange mode, with moves sent by position

Date: 2026-10-13
Status: Accepted

Context:
The palettes epic's last story: painters want paints and groups in their own order and want to drag paints into and between groups (epic R6–R8). Main-list rows already carry two 44px buttons, so a permanent drag handle would leave a long name about 100px at 320px. Native HTML5 drag and drop doesn't fire on iOS touch. Every drag needs a keyboard and non-drag path (WCAG 2.1.1), and screen readers need to hear what moved where.

Decision:
- **Arrange mode.** An "Arrange" button next to "All paints" swaps every row's and heading's controls for a Move button and a drag handle; "Done" swaps them back. Like Select mode (051), the row never carries more than two buttons.
- **dnd-kit**, `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0, pinned exactly: mouse, touch and keyboard sensors, sortable lists and a drag overlay. Only the handle takes a drag (`touch-action: none`), so a swipe elsewhere scrolls; touch starts after a 150ms hold.
- **What a drop does:** reorder within All paints, within a group, or among groups; All paints → group adds the paint at the drop spot (it stays in All paints); group → group moves it; a drop that would duplicate a paint in a group, or go from a group to All paints, does nothing and says so. Copying stays in "Copy to group…".
- **Moves are sent by position:** `movePaint`, `moveGroupPaint` and `moveGroup` take one item and `toIndex`; `addPaintToGroup` and `movePaintToGroup` gain an optional `toIndex`. A move to the same place writes nothing.
- **Optimistic updates** show each move at once; Convex rolls it back if the server refuses, and a toast says so.
- **Rows in other lists don't shift** during a cross-list drag; a line and a group outline mark the drop spot instead.
- **The non-drag path** is a Move sheet (top, up, down, bottom) per row and group heading; moving between lists keeps its existing menus.
- **The drag preview** is the nav's glass with only swatch, name and brand, in `--color-text`. **Announcements** name the paint, list and position.

Alternatives:
- Always-on drag handles: no mode to enter, but a third 44px button per row at 320px
- `@dnd-kit/react` 0.5: the maintained successor, but before 1.0
- A hand-built pointer drag: no dependency, but touch, auto-scroll, keyboard and announcements would all be ours to build and test
- Sending the whole new order: one simple call, but it overwrites a paint added on another device at the same moment
- Live cross-list shifting (dnd-kit's multiple-containers pattern): shows the gap, but needs drag-over state that copies or moves rows mid-drag
- Long-press anywhere on a row to drag: no handle needed, but it fights scrolling and text selection on iOS

Consequences:
Positive: reordering and grouping work by touch, mouse, keyboard and menu, each move is one atomic write, and moves feel instant.
Trade-off: removing a paint or opening its groups needs "Done" first. Keyboard moves between lists step through every row in between. Two dependencies, last released 2024-12. An optimistic move against a palette another device just changed can show the wrong order until the server answers (last write still wins, 049). Touch behaviour is only verifiable on a real iPhone.

---

## Decision 054 — Icons only in the phone nav

Date: 2026-10-13
Status: Accepted; partly supersedes 050 (the under-360px rule)

Context:
The owner wants a cleaner phone nav: the four tabs as icons, without labels. DECISIONS 050 went the other way under 360px, dropping the icons and keeping the labels, because four labelled items with icons overflow a 320px bar.

Decision:
Under 640px each tab shows only its icon. The label stays in the link, clipped to a 1px box (`--visually-hidden-size`, `clip-path: inset(50%)`), so the link keeps its name for screen readers and voice control. From 640px tabs show icon and label as before. The under-360px rule is removed.

Alternatives:
- `aria-label` on the link with the label removed: same result, but the name would live in two places
- Icons with labels only on the active tab: keeps a hint of text, but the bar's width changes as you switch tabs
- Keep 050: labels are easier to recognise, but not what the owner wants

Consequences:
Positive: a shorter, calmer phone bar with four even targets at every phone width, and the overflow at 320px is gone.
Trade-off: people must recognise the icons (Palette for Paints, Library for My Paints, SwatchBook for Palettes, a gear for Settings) without words; the active tab's pill and the screen-reader names still identify each one. WCAG 2.1 AA is still met: every link has a name, and with no visible label, 2.5.3 Label in Name doesn't apply. The icons are checked for 3:1 contrast on the glass (1.4.11).

---

## Decision 055 — Promote environments by fast-forward only

Date: 2026-10-13
Status: Accepted; amends 044 (promotion and hotfix back-merge)

Context:
044 made promotions `git merge --no-ff`. Each promotion and hotfix back-merge added a merge commit that lived only on the receiving branch and above, so `dev`, `stage` and `main` never shared a tip even when their files were identical: on 2026-10-11, after a hotfix, the three had no file differences but `dev` held two commits `main` lacked. `wi release` now fast-forwards work items into `dev` and tags each item's last commit, so releases add no merge commits either. The owner wants the branches to match after a promotion.

Decision:
- Promotions are `git merge --ff-only`: `stage` fast-forwards to `dev`, `main` to `stage`. A promotion refuses when the target has a commit the source lacks.
- A hotfix lands on `main`, then `main` is merged into `dev` only; `stage` and `main` pick up the back-merge on the next promotion.
- A bad promotion is undone by reverting on `dev` and promoting, or by a hotfix revert on `main`; never by moving a branch back.

Alternatives:
- Keep `--no-ff`: each promotion is marked by a merge commit and undone by one revert, but the branches never point at the same commit and a tag doesn't name what's live
- Deploy every environment from tags on one branch: one history and no promotion merges, but `scripts/deploy.ts`, the environment branches and DEPLOYMENT.md would all change, and stage and production would no longer be branches you can switch to

Consequences:
Positive: after promoting, `dev`, `stage` and `main` are the same commit, so a version tag names the same code on every branch, and no branch collects merge commits of its own.
Trade-off: git no longer records when a batch reached stage or production; deploy output and tags are the record. `main` can sit past the latest tag when a promotion carries commits after the last release. Undoing a promotion takes a revert per change. After a hotfix, stage to production refuses until dev has been promoted to stage, so a batch being checked on stage waits for everything newer on `dev` and is checked again with it; back-merging into `stage` as well would avoid that, at the cost of a merge commit on `stage`. A hotfix that isn't merged back into `dev` makes the next promotion refuse; that's the safe failure, fixed by doing the back-merge and promoting again.

---

## Decision 056 — Identify old Grimify users by a keyed hash of their email

Date: 2026-10-17
Status: Accepted (epic `legacy-import`)

Context:
Old Grimify users' owned paints and palettes are exported once and claimed later by whoever signs in here with the same verified email (sign-in is email code only, 027). The export and the staged import must not hold email addresses or old Supabase user IDs, and Convex keeps no profile data (028). A plain SHA-256 of an email can be reversed by hashing a list of known addresses.

Decision:
- Each old user is identified by `emailHash`: the lowercase hex HMAC-SHA256 of the trimmed, lowercased email, keyed with `LEGACY_IMPORT_HASH_KEY` (32+ characters, held only in environment variables).
- Old accounts sharing one normalized email are merged into one record.
- The export holds no email, no old user, palette, group or palette-paint UUID.

Alternatives:
- Plain SHA-256: no key to manage, but guessable from a list of addresses
- Store the email: simplest matching, but copies personal data about people who haven't joined into Convex

Consequences:
Positive: without the key, the export and staged data aren't linked to an email address.
Limits: this is pseudonymous, not anonymous. Anyone with the key and a candidate address can test whether that person had an old account, and palette and group names are text people wrote. So only production holds the real key and real data; dev and stage use a made-up export with their own key.
Trade-off: the same key must be set in the export run and every Convex deployment that claims; losing it means exporting again. A user whose new account uses a different address can't claim.

---

## Decision 057 — Map legacy data at export time and keep the export outside the repo

Date: 2026-10-17
Status: Accepted (epic `legacy-import`)

Context:
The old app's paints are UUID rows whose `brand_paint_id` is the legacy JSON `id` this catalog was built from (015, 018). Its palettes allowed 80-character names, any number of paints and groups, and repeated paints. The export holds hashed emails and people's collections.

Decision:
- `npm run legacy:export` maps every old paint to its catalog ID with the same derivation as the catalog import (`legacyPaintId`), accepting only IDs in the current catalog; unmapped paints are left out and listed in `report.json`.
- Palettes are fitted to this app's rules in the export (names trimmed and cut to 60, "Untitled" when empty, repeats collapsed, 200 paints, 30 groups), so loading and claiming never repair data. The 50-palette cap waits for claim time, when the user's own palettes are known.
- The old project is read through PostgREST with `fetch` (no Supabase package), paged by `Range`. Emails come from Supabase Auth's admin API, confirmed addresses only: `profiles.email` is a copy each user could overwrite.
- The command refuses an output directory inside the repository, writes files only its user can read, and never overwrites an earlier export. The owner deletes the export and `.env.legacy.local` after the production load.

Alternatives:
- Map at load or claim time in Convex: Convex would need the legacy JSON and the mapping code
- Write the export into the repo (git-ignored): one mistake away from committing personal data

Consequences:
Positive: the report measures what won't import before anything is deployed; later steps take plain catalog IDs.
Trade-off: a catalog change after the export isn't reflected until the export runs again.

---

## Decision 058 — Stage old users' data in Convex by email hash, loaded with convex run

Date: 2026-10-17
Status: Accepted (epic `legacy-import`)

Context:
Old users claim their data after signing in (056), so it has to sit somewhere the claim can read it. Convex keeps no profile data (028). The owner loads the export from a laptop, once per environment, and one user's record can be bigger than one `npx convex run` argument: Linux caps an argument at 128 KiB, and someone owning the whole catalog is about 130 KB of IDs.

Decision:
- Staged data lives in Convex, in `legacyImports`, one row per `emailHash`, with no email and no old user ID. A second table, `legacyImportClaims`, keeps only the hash and a time for each claimed or discarded import, so loading the export again skips it.
- `npm run legacy:load <env> <export.json>` calls the internal mutation `legacyImports.stageChunk` through `npx --no convex run`, one call per chunk of under 100 KB. The first chunk replaces any staged row for the hash, the last marks it complete, so a re-run gives the same rows.
- The deploy key comes from the same `.env.deploy.<env>.local` the deploy uses and reaches only the child process environment, with `CONVEX_DEPLOYMENT` removed; the key must belong to that environment's deployment. The command prints record numbers and counts only, and hides Convex's stderr because argument errors echo the values.
- A staged row keeps at most 50 palettes, the per-user cap; the rest are counted, not stored.

Alternatives:
- An HTTP action that takes the whole export: one request, but a public endpoint guarded by a shared secret, for a one-off job
- Keep the staged data outside Convex (a file the claim fetches): the claim would need a second store and its credentials
- Use a deployment environment variable or file storage to hold the export: no index by hash, and the claim would read everything

Consequences:
Positive: no public surface; the loader uses the deploy access the owner already has.
Trade-off: Convex now holds pseudonymous data about people who haven't joined, until they claim or the purge runs (180 days). A load takes about a second per chunk.
