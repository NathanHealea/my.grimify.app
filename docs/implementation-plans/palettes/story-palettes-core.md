---
type: story
epic: palettes
slug: palettes-core
status: staged
branch: story/palettes-core
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-palettes-core
created: 2026-10-11
approved: 2026-10-12
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.15.0
review_approved: 2026-10-12
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Palettes tab, storage and palette CRUD

## Summary

Adds a Palettes tab where a signed-in painter can create, rename and delete named color palettes, and open one to see its paints. It lays down the Convex `palettes` table and functions that the rest of the palettes epic builds on, including groups in the stored shape so later stories need no migration. Palettes are online-only in this version.

## Context

Epic: `docs/implementation-plans/palettes/epic-palettes.md` (approved 2026-10-11). This is child 1 and covers epic R1, R3, R9, R10.

Already in place:

- `convex/lib/auth.ts`: `requireUser(ctx)`; every user-data function starts there (SECURITY §2).
- `convex/users.ts`: `deleteAccount` deletes `userPaints` in scheduled batches of 500, then the `users` row.
- `src/components/app-shell.tsx`: `TABS` (Paints, My Paints, Settings), `BackButton` typed to `to: "/paints"` only; `src/router.ts` types `staticData.back` the same way.
- `src/features/collection/my-paints-screen.tsx`: the signed-out message, offline note and skeleton patterns to copy.
- `src/features/pwa/use-online-status.ts`: online flag.
- `src/components/paint-swatch.tsx`, `useCatalog()` for paint lookup; `PageTitle` for a dynamic `h1` (used by paint detail).
- `src/components/ui/sheet.tsx` (Radix dialog), `button`, `input`, `toast`. `delete-account.tsx` shows the confirm-in-a-sheet pattern.
- Tests: Vitest + Testing Library next to the code; `convex-test` in `convex/*.test.ts`; Playwright in `tests/e2e/*.spec.ts` against the dev deployment with the shared `+clerk_test` user.

## Defaults this plan picks (change any)

- **Stored shape:** one `palettes` document per palette: `userId`, `name`, `paintIds: string[]` (main list, in order), `groups: { id: string, name: string, paintIds: string[] }[]` (empty in this story), `updatedAt`. Index `by_userId`.
- **Caps:** 50 palettes per user, 200 paints per palette, 30 groups per palette, names trimmed to 1–60 characters. Duplicate palette names are allowed.
- **Privacy of IDs:** `palettes.get` returns `null` for a palette that is missing or belongs to someone else, so a guessed ID reveals nothing. Mutations throw `NOT_FOUND` in both cases.
- **List order:** most recently updated first.
- **List row:** palette name, paint count, and the first five swatches.
- **Create:** a "New palette" button opens a sheet with a name field; on save it opens the new palette.
- **Rename and delete** live in the palette detail header as an actions menu button that opens a sheet. Delete asks for confirmation and returns to `/palettes`.
- **Unknown paint IDs** (not in the catalog build) show a neutral swatch and "Unknown paint".
- **Offline:** an already-loaded list or palette stays visible. Create, rename and delete are disabled, with "Connect to the internet to edit palettes." If nothing has loaded, the screen says "Palettes need an internet connection."

## Scope

**In scope**

- Convex schema, functions and tests for palettes.
- Account deletion removes palettes.
- Palettes tab (`SwatchBook` icon), `/palettes` list, `/palettes/$paletteId` detail with the main list.
- Create, rename, delete; signed-out, empty, loading, offline and not-found states.
- Docs: DATABASE, API, SECURITY (one line: palettes are owner-only), UX_FLOWS, PRD, ROADMAP, DECISIONS (palettes pulled forward; one-document data model; last write wins).

**Out of scope**

- Adding or removing paints (story `palette-add-paint`).
- Groups UI (story `palette-groups`).
- Drag and drop and the `@dnd-kit` dependency (story `palette-drag-drop`).
- Offline editing.

## Requirements

- **R1** — A signed-in user can create a palette with a name of 1–60 characters after trimming; an invalid name is rejected with a visible message.
- **R2** — A user can have at most 50 palettes; creating a 51st is rejected with a visible message.
- **R3** — A user can rename and delete their own palettes. Delete requires confirmation.
- **R4** — Palette functions only ever read or change the caller's palettes. Another user's palette ID behaves exactly like a missing one. Signed-out calls fail with `UNAUTHENTICATED`.
- **R5** — The Palettes tab lists the user's palettes, most recently updated first, each with name, paint count and up to five swatches, and links to its detail screen.
- **R6** — The palette detail screen shows the palette name as the page heading and its main list in stored order, each paint as a swatch with name and brand. A paint ID missing from the catalog renders as "Unknown paint" without errors.
- **R7** — Signed out, the Palettes tab explains that palettes need an account and offers Sign in (or the offline note when offline).
- **R8** — Offline, loaded palettes stay visible, edit controls are disabled, and a notice says a connection is needed. With nothing loaded, the screen says palettes need an internet connection.
- **R9** — Deleting the account deletes all of the user's palettes and no one else's.
- **R10** — The main navigation shows a Palettes tab between My Paints and Settings, and the detail screen has a back button to Palettes.
- **R11** — All new UI meets WCAG 2.1 AA: labelled controls, visible focus, 16px+ input text, sheets that trap and return focus, status messages in a live region, 44×44px targets.

## Acceptance criteria

- **AC1** (R1, R5) — Given a signed-in user, when they create "Ultramarines", then they land on its detail screen, and the Palettes list shows "Ultramarines · 0 paints".
- **AC2** (R1) — Given the create sheet, when the name is blank or only spaces, then Save shows "Give the palette a name" and nothing is created.
- **AC3** (R2) — Given a user with 50 palettes, when they create another, then they see "You can have up to 50 palettes" and the count stays 50.
- **AC4** (R3) — Given a palette, when the user renames it to "Ultramarines 2nd Co.", then the heading and the list show the new name.
- **AC5** (R3) — Given a palette, when the user chooses Delete and confirms, then they return to Palettes and it's gone; if they cancel, nothing changes.
- **AC6** (R4) — Given user A's palette, when user B opens `/palettes/<that id>` or calls rename or delete with it, then B sees "Palette not found" and A's palette is unchanged.
- **AC7** (R6) — Given a palette whose `paintIds` include a valid ID and an unknown ID, when it opens, then both render in order, the second as "Unknown paint".
- **AC8** (R7) — Given a signed-out user, when they open Palettes, then they see the explanation and a Sign in button.
- **AC9** (R8) — Given an open palette, when the device goes offline, then the actions button is disabled and the notice appears; going back online re-enables it.
- **AC10** (R9) — Given users A and B with palettes, when A deletes their account, then only B's palettes remain.
- **AC11** (R10) — Given any screen, then the Main nav has four links in order Paints, My Paints, Palettes, Settings.

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `creates a palette with a trimmed name and empty lists` | `convex/palettes.test.ts` | Stored row has trimmed name, `paintIds: []`, `groups: []`, caller's `userId` |
| T2 | R1 | `rejects blank and over-long names` | `convex/palettes.test.ts` | `""`, `"   "`, 61 chars → `PALETTE_NAME_INVALID`; 60 chars accepted |
| T3 | R2 | `rejects the 51st palette` | `convex/palettes.test.ts` | 50 succeed, 51st throws `PALETTE_LIMIT`, row count stays 50 |
| T4 | R3 | `renames and deletes own palettes` | `convex/palettes.test.ts` | Rename updates name and `updatedAt`; remove deletes the row |
| T5 | R4 | `keeps users' palettes apart` | `convex/palettes.test.ts` | B's `get` of A's ID → `null`; B's rename/remove → `NOT_FOUND`; A's row unchanged; `listMine` returns only own |
| T6 | R4 | `rejects unauthenticated calls` | `convex/palettes.test.ts` | Every palette function throws `UNAUTHENTICATED` signed out |
| T7 | R5 | `lists palettes newest-updated first with counts and preview` | `convex/palettes.test.ts` | Order by `updatedAt` desc; `paintCount`; `previewPaintIds` is at most 5 |
| T8 | R9 | `deletes the caller's palettes with the account and nobody else's` | `convex/users.test.ts` | After A's `deleteAccount`, only B's palettes remain |
| T9 | R5, R7 | `PalettesScreen` renders list, empty, signed-out and loading states | `src/features/palettes/palettes-screen.test.tsx` | Rows link to `/palettes/<id>` with name, count; empty state; Sign in button signed out |
| T10 | R1, R2, R11 | `create sheet validates and reports server errors` | `src/features/palettes/palette-name-sheet.test.tsx` | Blank → inline error tied by `aria-describedby`; `PALETTE_LIMIT` → message; focus returns to trigger on close |
| T11 | R6 | `renders paints in order and unknown IDs` | `src/features/palettes/palette-detail.test.tsx` | Names and brands in order; unknown ID → "Unknown paint"; `null` → "Palette not found" |
| T12 | R3 | `delete asks for confirmation` | `src/features/palettes/palette-detail.test.tsx` | Cancel → no mutation; confirm → mutation called, navigates to `/palettes` |
| T13 | R8 | `disables editing offline` | `src/features/palettes/palette-detail.test.tsx`, `palettes-screen.test.tsx` | Offline → actions and New palette disabled, notice in a `role="status"` region |
| T14 | R10 | `renders a Main navigation with four labelled tabs` (updated) | `src/components/app-shell.test.tsx` | Order and hrefs incl. Palettes `/palettes`; icon `aria-hidden` |
| T15 | R1, R3, R5 | `create, rename and delete a palette` | `tests/e2e/palettes.spec.ts` | Signed-in journey on the dev deployment; the palette is gone at the end |

**Not unit testable:** R11's visual parts (focus ring, 44px targets, 320px nav fit) are checked by hand on an iPhone and at 320px in the browser, and listed in the stage summary. R9's batching beyond 50 isn't needed: the cap keeps a user's palettes inside one transaction.

## Implementation plan

1. [x] Add the `palettes` table and `palettes.ts` functions (`listMine`, `get`, `create`, `rename`, `remove`) with validators, caps and owner checks — touches `convex/schema.ts`, `convex/palettes.ts`, `convex/palettes.test.ts` — tests T1, T2, T3, T4, T5, T6, T7
2. [x] Delete palettes in `users.deleteAccount` — touches `convex/users.ts`, `convex/users.test.ts` — tests T8
3. [x] Add the Palettes tab and routes, and widen `staticData.back` to allow `/palettes` — touches `src/components/app-shell.tsx`, `src/components/app-shell.test.tsx`, `src/router.ts`, `src/routes/palettes/index.tsx`, `src/routes/palettes/$paletteId.tsx` — tests T14
4. [x] Build the Palettes list screen and the shared name sheet (create) — touches `src/features/palettes/palettes-screen.tsx/.css/.test.tsx`, `src/features/palettes/palette-name-sheet.tsx/.css/.test.tsx` — tests T9, T10, T13
5. [x] Build the palette detail screen with main list, rename, delete-with-confirm and offline states — touches `src/features/palettes/palette-detail.tsx/.css/.test.tsx` — tests T11, T12, T13
6. [x] Add the E2E journey — touches `tests/e2e/palettes.spec.ts` — tests T15
7. [x] Update docs — touches `docs/DATABASE.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/UX_FLOWS.md`, `docs/PRD.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/TESTING.md` — tests none (docs only)

**Must not change:** the `users` and `userPaints` tables and the signatures of `userPaints.*` and `users.*`. `deleteAccount` keeps returning `null` and stays safe to retry. Paint IDs and the catalog.

**High-risk steps:** 1 (adds a production schema table and the stored shape the epic relies on; hard to change once users have data) and 2 (changes account deletion). Autonomous build stops before each for sign-off.

## Risks and open questions

- **Schema is a one-way door.** Step 1 fixes `groups` and `paintIds` shapes before the groups and drag stories are built. If those stories need more per-entry data (for example a note per paint), it'd need a migration. Mitigation: shape reviewed now with all four stories in view.
- **Offline after a reload:** Convex keeps query results only in memory, so a palette opened offline after a reload shows "Palettes need an internet connection" rather than cached data. That matches the online-only decision, but differs from My Paints, which caches on the device.
- **Four tabs on a 320px phone:** labels may wrap or crowd in the floating nav (DECISIONS 045/046). Checked at step 3; if it doesn't fit, I'll stop and ask rather than shorten labels on my own.
- **`BackButton`'s `to` type** is shared with paint detail; widening it touches router typing for every route. Small, but it's a shared contract.
- **Dynamic title:** detail's `h1` comes from `PageTitle` with the palette name, not `staticData.title`, like paint detail.

## Progress log

- 2026-10-11 — Planned.
- 2026-10-12 — Plan approved.
- 2026-10-12 — Started on branch story/palettes-core from origin/dev.
- 2026-10-12 — Steps 1-5 built. Plan correction: palettes.get takes v.string() and normalizes the ID so a mangled URL shows Palette not found; rename validates names like create.
- 2026-10-12 — Steps 1-7 done. Extra: delete-account sheet copy now names palettes. Open: four tabs overflow the nav at 320px (nav.spec fails); palettes E2E needs functions pushed to the dev deployment.
- 2026-10-12 — Nav fit resolved with user: icons hide under 360px, tab padding tightens 640-767px (DECISIONS 050). nav and header E2E pass.
- 2026-10-12 — Staged: verification passed; version 0.14.1 → 0.15.0; no changelog file.
- 2026-10-12 — Review approved.
