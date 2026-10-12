---
type: story
slug: my-paints
status: released
branch: story/my-paints
worktree_path: ../grimify-v2-worktrees/story-my-paints
created: 2026-10-07
approved: 2026-10-07
version: 0.8.0
tag: v0.8.0
merge_commit: 1638003 (squash of story/my-paints)
---

# My Paints tab

## Summary

Turn the placeholder My Paints tab into the collection screen (PRD Feature 3, UX_FLOWS Flow 6): Owned (n) and Wishlist (n) views with the same rows, search box, chips and filters as the catalog, empty states, and a signed-out explanation. It also adds the Paints sheet's "Show only: Owned / Wishlist / All" filter and the first signed-in end-to-end journey (TESTING §5 "Save a paint"). It's the second half of the ROADMAP item whose toggles shipped in v0.7.0.

## Context

ROADMAP NOW: "Own / Want toggles (independent) + My Paints tab", split on 2026-10-07; the toggles shipped in v0.7.0.

Already in place:

- `CollectionProvider` (`listMine` → flags per paint).
- Toggles on rows, through `useSetPaintFlags`.
- The app-wide sign-in sheet (`useSignIn`).
- `PaintsSearch` in `paints-screen.tsx`: search box, parser, chips, suggestions, hue dots, filters sheet, list. It takes its query and filters from props, so it isn't tied to the `/paints` route.
- The `/my-paints` route is a placeholder.
- `CLERK_SECRET_KEY` (a development `sk_test_` key) is in `.env.local`. I checked the name only.

What the docs fix:

- **UX_FLOWS Flow 6:**
  - A segmented control, Owned (n) | Wishlist (n).
  - The same row design and search box as the catalog.
  - Empty states: "You haven't added any paints yet" / "Nothing on your wishlist", each with Browse paints.
  - Signed out: an explanation and Sign in.
  - Loading: skeleton rows.
- **Routes:** `/my-paints?tab=owned|wishlist` is listed in UX_FLOWS; `/paints?…&owned=` was reserved for the Show-only filter.
- **TESTING §2 and §5:** "Sign in (test-mode auth) → mark owned → appears in My Paints"; after a reload it's still listed.

Checked against `@clerk/testing` 2.2.44's own type definitions (Clerk's docs page omits these details):

- `clerkSetup()` runs once in Playwright global setup.
- `clerk.signIn({ page, emailAddress })` finds the user by email and signs in with a backend-issued ticket, so **the test user must already exist**.
- Email-code test users use a `+clerk_test` address.
- It needs `CLERK_SECRET_KEY` and the publishable key.

## Defaults the docs leave open (change any)

- **Reuse, don't rebuild.** My Paints renders the same `PaintsSearch`, restricted to the paints in the current tab. That gives it the parser, chips, hue dots and filters sheet for free, and keeps one search code path (AGENTS §3). Its query and filters live in its own URL (`/my-paints?tab=wishlist&q=red&brand=vallejo`).
- **Tab control:** two links styled as a segmented control, `aria-current="page"` on the active one. They're links, not ARIA tabs, because each view has its own URL.
- **Show-only filter param:** `show=owned|wishlist` instead of the `owned=` placeholder in UX_FLOWS, which read oddly with a "wishlist" value. It appears in the Paints sheet only when signed in. In My Paints it's hidden, because the tab already decides it.
- **Loading:** three skeleton rows while `listMine` is loading; the catalog itself never shows skeletons.
- **Test user:** global setup creates `grimify-e2e+clerk_test@example.com` in your Clerk **development** instance if it doesn't exist. It calls Clerk's Backend API with `CLERK_SECRET_KEY`, so there's no manual dashboard step, and it's idempotent. The E2E journey toggles real rows in your **dev** Convex deployment and un-toggles them at the end. Each device profile uses a different paint, so parallel runs don't collide.

## Dependencies (need your approval)

| Package | Version | Kind | Why |
|---|---|---|---|
| @clerk/testing | 2.2.44 | dev | Clerk testing tokens and `clerk.signIn` for signed-in Playwright tests; peer `@playwright/test ^1` |

## Scope

**In scope**

- `searchPaints` gains an optional set of paint IDs to restrict to; `PaintsSearch` gains an optional `scope` (and scope-specific empty state) and hides the Show-only filter inside My Paints
- `show` filter param in the Paints sheet (signed in only), its chip, and URL handling
- `/my-paints` route with `tab`, `q` and the sheet filters; segmented control with counts; empty, loading and signed-out states
- Playwright global setup (`clerkSetup`, ensure the test user) and `tests/e2e/collection.spec.ts`
- `.env.example` gains an empty `CLERK_SECRET_KEY=` line; ENVIRONMENT documents it as local/CI only, never `VITE_`
- Docs

**Out of scope**

- Offline outbox and the "n changes waiting to sync" badge (next item)
- Issue #4 (deletes and last-write-wins), also the outbox item
- Grouping by brand with headers (UX_FLOWS says "grouped or filtered"; the brand filter and chips cover "filtered")
- CI for E2E (deploy item; the secret goes in GitHub Actions then)

## Requirements

- **R1** — `/my-paints` shows Owned (n) | Wishlist (n) as two links. The active one has `aria-current="page"`, and the counts come from the collection. `tab` defaults to `owned`, and an invalid value falls back to it.
- **R2** — Each view lists only the paints in that part of the collection, with the catalog's row design, toggles, search box, chips, hue dots and filters. Its query and filters live in its own URL and survive reload and Back.
- **R3** — Toggling a paint off in a view removes it from that view right away (optimistic). Wanting a paint while on Owned adds it to the Wishlist count.
- **R4** — Empty views show the Flow 6 message with a Browse paints link to `/paints`. A non-empty view whose search matches nothing shows the usual "No paints match" + Clear all.
- **R5** — Signed out, My Paints explains why to sign in and offers Sign in (the app-wide sheet). Offline and signed out, it says signing in needs a connection.
- **R6** — While the collection loads, three skeleton rows show, hidden from screen readers, with the status "Loading your paints…".
- **R7** — Signed in, the Paints filter sheet has "Show only: All / Owned / Wishlist" (radio buttons, `show` param). It combines with the other filters, gets a chip, and isn't shown when signed out or inside My Paints.
- **R8** — A signed-in E2E signs in as the test user, marks a paint owned on `/paints`, sees it under My Paints → Owned, reloads and still sees it, then un-owns it (cleanup).
- **R9** — Accessibility (WCAG 2.1 AA): the segmented control is a labelled `nav` of links with visible focus and 44px targets, counts are text, skeletons aren't announced, and radio buttons are a labelled group.

## Acceptance criteria

- **AC1** (R1, R2, R3) — Given I own two paints and want one, when I open My Paints, then I see "Owned (2)" active with those two rows; tapping Wishlist (1) shows the wanted paint; un-owning a paint on Owned removes it and the count drops to 1.
- **AC2** (R2) — Given My Paints → Owned, when I type `vallejo`, then only my owned Vallejo paints show with a `Brand: Vallejo` chip, and the URL is `/my-paints?tab=owned&q=vallejo`.
- **AC3** (R4) — Given an empty wishlist, when I open Wishlist, then "Nothing on your wishlist" and Browse paints show.
- **AC4** (R5) — Given I'm signed out, when I open My Paints, then I see why to sign in and a Sign in button that opens the sheet.
- **AC5** (R7) — Given I'm signed in on `/paints`, when I open Filters, pick Show only: Owned and tap Show, then the list shows only owned paints and a `Show: Owned` chip; signed out, the section isn't in the sheet.
- **AC6** (R8) — Given `CLERK_SECRET_KEY` in `.env.local`, when I run `npm run test:e2e`, then the collection journey passes on both device profiles and leaves no rows behind for the test user.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R2 | `restricts results to a set of paints` | `src/features/catalog/search.test.ts` | With `scope` = 2 IDs: empty query → those 2; text and brand filters apply within them; hex ranks only them |
| T2 | R7 | `parses and serializes the show filter` | `src/features/catalog/filters.test.ts` | `show=owned` / `wishlist` kept, anything else dropped; serialize omits it when empty; it counts as an active filter |
| T3 | R1, R4, R5, R6 | `shows tabs, counts and states` | `src/features/collection/my-paints-screen.test.tsx` | Collection {2 owned, 1 wanted}: links "Owned (2)" (current) and "Wishlist (1)"; Owned lists 2 rows; Wishlist lists 1; empty wishlist → message + Browse paints link; loading → status "Loading your paints…" and 3 hidden skeletons; signed out → explanation + Sign in calls `useSignIn` |
| T4 | R2 | `keeps the query and tab in the URL` | `src/features/collection/my-paints-screen.test.tsx` | `/my-paints?tab=wishlist&q=red` → Wishlist current, input `red`; `tab=bogus` → Owned |
| T5 | R7 | `offers Show only when signed in` | `src/features/catalog/paints-filters.test.tsx` | Signed in → radio group "Show only" with All checked; choosing Owned and Show → `onApply` with `show: "owned"`; signed out or `hideShow` → no group |
| E1 | R8 | `marks a paint owned and finds it in My Paints` | `tests/e2e/collection.spec.ts` | Sign in via `clerk.signIn`, toggle Own on a per-project paint, open My Paints → Owned, row visible, reload → still visible, un-own → gone |

**Not unit testable:** VoiceOver on the segmented control and radios, and real cross-device sync, are manual.

## Implementation plan

1. [x] Install `@clerk/testing@2.2.44` (dev, exact); add `CLERK_SECRET_KEY=` to `.env.example`. Touches `package.json`, `package-lock.json`, `.env.example`.
2. [x] Scope in search: `searchPaints(…, filters, scope?)`, where `scope` is a set of paint IDs. T1. Touches `src/features/catalog/search.ts`, `search.test.ts`.
3. [x] `show` filter: `Filters.show?: "owned" | "wishlist"`, parse and serialize, count, chip. Applied by turning the collection into a scope in `PaintsSearch`. T2. Touches `src/features/catalog/filters.ts`, `filters.test.ts`, `paints-screen.tsx`, `src/routes/paints/index.tsx`.
4. [x] Sheet "Show only" radio group, shown when signed in and not hidden by the caller. T5. Touches `src/features/catalog/paints-filters.tsx`, `.css`, `.test.tsx`.
5. [x] `PaintsSearch` accepts `scope`, `emptyCollection` (message and link) and `hideShow`, and is exported for reuse. Touches `src/features/catalog/paints-screen.tsx`.
6. [x] My Paints screen and route: `validateSearch` for `tab`, `q` and the filters; segmented control; collection-derived scope; skeleton, signed-out and empty states. `CollectionProvider` also exposes the loading state and the owned and wishlisted ID sets. T3, T4. Touches `src/routes/my-paints.tsx`, `src/features/collection/my-paints-screen.tsx`, `.css`, `.test.tsx`, `collection-provider.tsx`.
7. [x] Playwright: a global setup runs `clerkSetup()` and ensures the test user exists through Clerk's Backend API (`fetch`, `CLERK_SECRET_KEY` from `.env.local` via `process.loadEnvFile`, never logged). Then E1. Touches `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/collection.spec.ts`.
8. [x] Docs. Touches the files listed.
    - **DECISIONS 031:** My Paints reuses the catalog search with a scope, and `show` instead of `owned`.
    - **DECISIONS 032:** an auto-created E2E test user in the Clerk dev instance.
    - **UX_FLOWS:** routes and Flow 6 as built.
    - **TESTING:** the collection E2E, the test user, and needing `CLERK_SECRET_KEY`.
    - **ENVIRONMENT:** `CLERK_SECRET_KEY`.
    - **DESIGN_SYSTEM:** segmented control and skeleton rows.
9. [x] Verify: `npm run check`, `npm run build`, `npm run test:e2e` (now including E1), `prettier --check .`, and screenshots of My Paints (signed out; signed in with items, via the E2E session) through a temporary spec, removed afterwards. Touches nothing.

**Must not change:** the Paints screen's behavior signed out; ~~`userPaints` functions~~ the `userPaints` contract for existing callers (review changes add an optional `favorite`); `useSetPaintFlags` as the only write path.

## Review changes (requested 2026-10-08)

The owner asked for these during review and chose to keep them in this item rather than plan a separate one:

- "change the wish list icon to a bookmark icon"
- "add the feature 'favorites' that displays as a heart icon"
- "add tooltips for each of the action buttons" (dropped 2026-10-08: "Drop the tooltip")
- "Change the add to collection button to be a Plus Sign" (2026-10-08)
- "Increase the size of the filter options to be the size of buttons"

**Defaults (change any)**

- **Favorite means "a paint I love using".** It's a third flag, independent of Own and Want, like DECISIONS 011.
- **Icons:**
  - Own becomes `Plus`, keeping the filled Primary circle when pressed.
  - Want becomes `Bookmark`.
  - Favorite is `Heart`.
  - Want and Favorite fill when pressed.
  - Order: Own, Want, Favorite, with `--space-2` (0.5rem, 8px) between them, up from `--space-1`.
- **The nav icon `BookMarked` becomes `Library`,** because a bookmark on every row would look nearly the same as the My Paints nav icon. Only the icon changes.
- **My Paints gets "Favorites (n)"** at `?tab=favorites`. `show=favorites` joins the filter, its chip and "Show only".
- **Convex `favorite: v.boolean()`, required.**
  - The dev `userPaints` table is empty and production doesn't exist, so no rows need migrating.
  - `set` takes `favorite?`, needs at least one of the three flags, and deletes the row only when all three are false.
- **Filter options as outline buttons:**
  - Each option is a bordered box: `--touch-target` tall, `--space-4` side padding, `--radius-md`, and a `--color-input-border` edge (3:1 control boundary).
  - Options sit `--space-2` apart.
  - The native checkbox or radio stays visible inside as the non-color cue.
  - Checked options get a Primary border and a Secondary fill.
  - This applies to every group in the sheet.
  - The rows are already 44px tall. What changes is that they now look and hit like buttons.

**Requirements**

- **R10** — `userPaints.set` accepts an optional `favorite`, needs at least one of the three flags, and deletes the row only when all three are false. `listMine` returns `favorite`. Last-write-wins and idempotence are unchanged.
- **R11** — Paint rows and the detail screen show Own (`Plus`), Want (`Bookmark`) and Favorite (`Heart`), each with `aria-pressed`, a filled shape when pressed, and a name like "Mark {paint} as favorite". Favorite saves through `useSetPaintFlags` like the others: optimistic, revert and toast on failure, and the sign-in handoff.
- ~~**R12** — Each toggle's name can be seen by a sighted user without a screen reader.~~ Dropped by the owner on 2026-10-08. Accessible names (`aria-label`) are unchanged.
- **R13** — My Paints shows "Favorites (n)". `?tab=favorites` lists favorites, and an empty view says "No favorites yet" with Browse paints. `show=favorites` is valid, gets a chip, appears in "Show only", and limits results to favorites.
- **R14** — Every filter-sheet option is a bordered box at least `--touch-target` tall, with the whole box as the hit area and a checked state that doesn't rely on color alone.
- **R15** — The My Paints nav tab uses `Library`.

**Acceptance criteria**

- **AC7** (R11) — Given I'm signed in, when I tap the heart on Mephiston Red and reload, then it's still filled and listed under Favorites.
- **AC8** (R10, R13) — Given a paint that's only a favorite, when I un-favorite it, then it's gone from all three tabs.
- **AC9** (R11) — Given a 375px-wide phone, when I look at a paint row, then all three toggles fit, the name truncates, and nothing scrolls sideways.
- **AC11** (R14) — Given the filter sheet, when I look at the brand options, then each looks like an outline button as tall as "Show", and tapping anywhere in it toggles it. VoiceOver still reads checkboxes and radios with their state.

**Tests**

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T6 | R10 | `inserts, updates and deletes a user's paint flags` (extended) | `convex/userPaints.test.ts` | `favorite` alone inserts a row; the row survives while any flag is true; deleted when all three are false; `listMine` includes `favorite` |
| T7 | R10 | `validates arguments` (extended) | `convex/userPaints.test.ts` | No flags at all is rejected; `favorite` alone is accepted |
| T8 | R11 | `renders accessible toggles and saves when signed in` (extended) | `src/features/collection/paint-toggles.test.tsx` | Three buttons named owned / wanted / favorite; Favorite calls `setFlags` with `{ favorite: true }`; pressed reflects `flags.favorite`; signed out opens sign-in with it |
| T9 | R11 | optimistic update test (extended) | `src/features/collection/use-set-paint-flags.test.tsx` | Optimistic `listMine` row carries `favorite`, including a new row created by `favorite` alone |
| T11 | R13 | `shows tabs, counts and states` (extended) | `src/features/collection/my-paints-screen.test.tsx` | "Favorites (n)"; `?tab=favorites` lists favorites; empty message |
| T12 | R13 | `parses and serializes the show filter` and `offers Show only when signed in` (extended) | `src/features/catalog/filters.test.ts`, `paints-filters.test.tsx` | `show=favorites` kept; `scopeFor` returns favorites; radio group has Favorites |
| E1 | R11, R13 | extended | `tests/e2e/collection.spec.ts` | Also favorites the paint, finds it under Favorites after a reload, and cleans up every flag |

R14 and R15 aren't unit testable. Stylelint enforces tokens, and screenshots and a manual check cover the look. AC9 is a screenshot check on iPhone 15.

**Steps**

10. [x] Convex `favorite` in the schema, `set` and `listMine`. Read `convex/_generated/ai/guidelines.md` first. T6, T7. Touches `convex/schema.ts`, `convex/userPaints.ts`, `.test.ts`.
11. [x] Collection client: `FlagChange.favorite`, a `favorites` set, the optimistic update. T9. Touches `src/features/collection/use-set-paint-flags.ts`, `collection-provider.tsx` and their tests.
12. [x] Toggles: Plus for Own, Bookmark for Want, Heart for Favorite; gap `--space-2`. T8. Touches `src/features/collection/paint-toggles.tsx`, `.css`, `.test.tsx`; `src/components/paint-row.css` if the row needs it.
13. [x] Nav icon → `Library`. Touches `src/components/app-shell.tsx`.
14. [x] Favorites tab and `show=favorites`. T11, T12. Touches `src/routes/my-paints.tsx`, `src/features/collection/my-paints-screen.tsx`, `src/features/catalog/filters.ts`, `paints-filters.tsx` and their tests.
15. [x] Filter options as outline buttons. Touches `src/features/catalog/paints-filters.css`.
16. [x] E2E: extend E1 and its cleanup. Touches `tests/e2e/collection.spec.ts`.
17. [x] Docs:
    - **PRD Feature 3** and **ROADMAP:** Favorites.
    - **API.md** and **DATABASE.md:** `favorite`.
    - **UX_FLOWS:** Flows 5 and 6, routes.
    - **DESIGN_SYSTEM:** §8 icons and names, filter options, §15 labels.
    - **DECISIONS:**
      - 033: Favorites as a third independent flag.
      - 034: Plus for Own, Bookmark for Want, `Library` for the nav.
18. [x] Verify: `npm run check`, `npm run build`, `npm run test:e2e` (three runs, `userPaints` empty after each), `prettier --check .`, and screenshots of a row at 375px and of the sheet.

**Risks and open questions**

1. **Resolved — no tooltips or labels.** The owner dropped them on 2026-10-08. Toggles keep their accessible names; sighted users rely on the icons.
2. **Row width.** Three 44px toggles with 8px gaps take about 148px of a 375px row, so long names truncate more. Labels add height, not width.
3. **Required field before production data.** This is safe now. After launch, a new flag would need `v.optional` and a backfill.
4. **Issue #4 widens slightly** to three flags. The outbox item still owns it.
5. **The version stays 0.8.0.** These land before release as part of the same minor bump.

## Risks and open questions

- **Decision needed: `@clerk/testing`,** and the auto-created test user plus E2E writes to your Clerk and Convex **dev** instances.
- **`npm run test:e2e` now needs `CLERK_SECRET_KEY`.** Without it, global setup fails with a message naming the variable, rather than skipping silently. CI will need it as a secret (deploy item).
- **E2E depends on Clerk's servers** being reachable, so a Clerk outage fails the run. It's still a real test of the integration.
- **Refactoring `PaintsSearch` touches a shipped screen;** the existing unit tests and three catalog E2E journeys guard it.
- **Counts can briefly lag** while an optimistic change is in flight. Acceptable; they settle with Convex.
- **Estimate:** 1.5–2 sessions.

## Progress log

- 2026-10-07 — Planned. Second half of the split ROADMAP item. `CLERK_SECRET_KEY` confirmed present in `.env.local` (name and `sk_test_` prefix only).
- 2026-10-07 — Approved as written, including `@clerk/testing`, the auto-created test user, and E2E writes to the Clerk and Convex dev instances.
- 2026-10-07 — Implementation started in worktree `../grimify-v2-worktrees/story-my-paints` on `story/my-paints`; `.env.local` copied in (gitignored).
- 2026-10-07 — Steps 1–7 coded (steps 3–5 share a commit: the show filter, the sheet group and the `PaintsSearch` props depend on each other). `npm run check` passes with 155 tests. The signed-in E2E is **blocked by configuration**: Clerk returns 404 for `/v1/client/sessions/…/tokens/convex`, so the development instance has no `convex` token template. The Clerk Convex integration isn't active (clerk-auth prerequisite 2), Convex never authenticates, and no `users` row is created. Waiting on the owner to activate it.
  - While diagnosing, found and fixed a real race (`fix(collection)` commit): a tap right after a page load, before Convex authenticates, was treated as signed out and opened the sign-in sheet. It's now queued.
  - The E2E toggles on the paint's detail screen instead of the `/paints` list: the list shows Mephiston Red three times (Base, Air, Spray) with the same button name.
  - Global setup created the test user `grimify-e2e+clerk_test@example.com` in the Clerk development instance.
- 2026-10-07 — Unblocked: the owner activated the Clerk Convex integration. The signed-in E2E passes on both device profiles. Steps 8–9 done. `npm run check` (155 tests; catalog valid), `npm run build`, `npm run test:e2e` (11 passed, 1 skipped) and `prettier --check .` exit 0. Screenshots of My Paints (Owned with counts, Wishlist dark, loading) checked by eye. Drift and findings:
  - The screenshot spec's cleanup lost two un-toggles by navigating right after tapping (the optimistic change never reached Convex), leaving rows for the test user. They were cleared through My Paints and the whole `userPaints` table re-checked empty. `collection.spec.ts` now reloads until the server copy is empty. Losing a tap on immediate navigation is the known in-memory gap the outbox item fixes.
  - Filed GitHub issue #5: toggles render as off while a signed-in user's collection loads, which misled that cleanup and would mislead users too.
  - `users` on the dev deployment now holds the E2E user's row with only `tokenIdentifier`, which confirms DECISIONS 028 end to end.
- 2026-10-07 — Staged. Version 0.8.0; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `story/my-paints`.
- 2026-10-07 — **Correction to the staged entry above:** its claim that the E2E cleans up after itself was wrong. A full run left both device profiles' paints owned. A WebSocket trace showed two causes:
  1. **Lost un-own:** the un-own was sent 9 ms before a reload and was lost in flight (the known in-memory gap; outbox item).
  2. **Real product bug, fixed here:** after a load, an unauthenticated `listMine` answers `[]`, so My Paints briefly showed a signed-in user "Owned (0)" and the empty state. The E2E's check passed on that moment. `CollectionProvider` now skips `listMine` until Convex is authenticated and reports loading meanwhile; covered by a new provider test.

  The journey's cleanup reads My Paints after the real collection loads and retries a lost un-own; it runs at the start and end. `npm run check` (157 tests) and three consecutive full E2E runs (11 passed, 1 skipped each) left `userPaints` empty, checked across the whole table each time. Status stays staged.
- 2026-10-08 — **Changes requested in review.** The owner asked for:
  - a bookmark icon for Want
  - a Favorites flag shown as a heart
  - names for the action buttons (asked for as tooltips)
  - button-sized filter options

  They chose to keep these in this item, not a separate one. Added "Review changes" with R10–R15, AC7–AC11, T6–T12 and steps 10–18. "Must not change" is amended: `userPaints` gains an optional `favorite`. Status is now changes-requested. Open question 1 (tooltips or visible labels) blocks step 12.
- 2026-10-08 — The owner dropped the tooltip requirement (R12, T10 and AC10 removed) and changed Own's icon to `Plus`. Open question 1 is resolved.
- 2026-10-08 — The owner asked for about 0.5rem between action buttons: the toggle gap becomes `--space-2` (8px).
- 2026-10-08 — Revised plan approved; back to in-progress. Steps 10–11 done: Convex `favorite` and the client state (Convex tests 8, collection tests pass).
- 2026-10-08 — Steps 12–18 done. Drift:
  - **Plan was wrong: the dev `userPaints` table wasn't empty.** It held 3 rows from the owner's own testing, so the required `favorite` field failed schema validation on `npx convex dev --once` (nothing was changed). `favorite` is now `v.optional`, and `listMine` reports a missing value as `false`. No rows were touched. Covered by a new Convex test.
  - Hue dots keep their own style. They're already button controls, so "every group" in the filter-option default means Show only, brand, line and type.
  - On a 375px phone, the current tab's "Favorites (n)" wraps onto two lines inside the 44px pill. That's acceptable, and nothing overflows.

  `npm run check` (158 tests; catalog valid), `npm run build`, `npm run test:e2e` (11 passed, 1 skipped) and `prettier --check .` all exit 0. Afterwards `userPaints` held only the owner's 3 rows; the E2E user had none. Screenshots at 375px (paint rows, the filter sheet, the Favorites tab) were checked by eye through a temporary spec, then removed.
- 2026-10-08 — Re-staged with the review changes. Version stays 0.8.0, since the changes land before release. Self-review found no leftover old icons, debug output or TODOs. Still not pushed; the review is on the local branch `story/my-paints`.
- 2026-10-08 — Released. Squash-merged to `main` as 1638003, tagged `v0.8.0`, pushed; worktree and branch removed.
