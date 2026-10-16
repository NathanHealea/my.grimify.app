---
type: epic
slug: palettes
status: planned      # planned | in-progress | released
created: 2026-10-11
approved: 2026-10-11
---

# Color palettes

## Summary

Signed-in painters can build named color palettes out of catalog paints: collect the paints for a scheme ("Ultramarines", "Nurgle Rot"), sort them into named groups ("Armor", "Highlights"), and arrange both paints and groups by drag and drop. This pulls PRD §8 Future "Painting recipes and schemes" forward as a first, online-only version.

## Context

- PRD §8 lists "Painting recipes and schemes" under Future; ROADMAP has it under LATER. This epic moves it forward and needs a DECISIONS entry saying so.
- Paints come only from the catalog (`data/catalog`, IDs immutable, DATABASE §8). A palette stores paint IDs, never copied hex or names.
- Convex holds per-user data (`users`, `userPaints`). Every function derives the user with `requireUser(ctx)` (`convex/lib/auth.ts`). `users.deleteAccount` deletes `userPaints` in batches; palettes must be deleted with the account too (DECISIONS 037/038).
- The nav (`src/components/app-shell.tsx`) has Paints (`Palette` icon), My Paints, Settings.
- No drag-and-drop library is installed. Native HTML5 drag and drop doesn't fire on iOS touch.

Decisions from the planning conversation (2026-10-11):

- A user can have **several named palettes**.
- **Online only** for this version. Edits need a connection; offline, palettes are read-only with a notice. No outbox.
- **Membership model:** each palette has a **main list** holding every color in it. **Groups** are named, ordered sections that reference colors from the main list. A paint appears at most once in the main list and at most once per group, but may be in any number of groups.
  - Removing a color from a group leaves it in the palette. Removing it from the palette removes it from every group.
  - Dragging from the main list into a group adds a reference (the color stays in the main list).
  - Dragging from one group to another **moves** it. A "Copy to group" menu item covers copying.
- **Drag library:** `@dnd-kit/core` 6.3.1 and `@dnd-kit/sortable` 10.0.0, pinned exactly (approved). `DragOverlay` renders the glass drag preview.
- **Navigation:** a fourth tab, **Palettes**, between My Paints and Settings, with lucide's `SwatchBook` icon. Routes `/palettes` and `/palettes/$paletteId`.

## Scope

**In scope**

- Convex `palettes` storage and functions; deleting palettes on account deletion.
- Palettes tab: list, create, rename, delete palettes.
- Palette detail: main list of paints shown as swatches with name and brand.
- "Add to palette" from paint detail, and from Paints and My Paints through a Select mode; remove a paint from a palette.
- Groups: create, rename inline, delete, add a color to several groups, move and copy between groups.
- Drag and drop to reorder colors, reorder groups, and move colors between main list and groups, on touch, mouse and keyboard, with a glass drag preview.
- Non-drag "Move / Copy to…" menu so every action works without dragging.
- Docs: PRD, UX_FLOWS, DATABASE, API, SECURITY (if rules change), DECISIONS, ROADMAP, DESIGN_SYSTEM (drag preview).

**Out of scope**

- Offline palette editing or an outbox for palettes (later work item).
- Arbitrary hex colors not tied to a catalog paint.
- Sharing palettes, public links, export.
- Recipe steps (base → shade → layer order with instructions).
- Signed-out palettes stored on the device.

## Requirements

- **R1** — A signed-in user can create, rename and delete any number of named palettes, up to a cap; other users can never read or change them.
- **R2** — A user can add a catalog paint to a palette from paint detail, and several at once from Paints and My Paints through a Select mode (rows have no room for a fourth button at 320px). Adding a paint already in the palette doesn't duplicate it. A user can remove a paint from a palette.
- **R3** — A palette shows its main list in a user-chosen order, each color as a swatch with paint name and brand. Discontinued or unknown paint IDs still render (fallback name, no crash).
- **R4** — A user can create named groups in a palette, rename a group inline, and delete a group without removing its colors from the palette.
- **R5** — A color can be in the main list and in any number of groups, at most once per list. Removing it from the palette removes it from every group.
- **R6** — By drag and drop a user can reorder colors within a list, reorder groups, drag a color from the main list into a group (adds), and from one group to another (moves). Works with touch, mouse and keyboard.
- **R7** — While dragging, the drag preview shows only the color's swatch, name and brand on a glass (frosted, translucent) background using design tokens.
- **R8** — Every drag action has a non-drag equivalent (menu), and drag moves are announced to screen readers.
- **R9** — Offline, palettes stay viewable if already loaded, editing controls are disabled, and the screen says a connection is needed.
- **R10** — Deleting the account deletes all the user's palettes.

## Acceptance criteria

- **AC1** (R1) — Given a signed-in user, when they create "Ultramarines", then it appears in the Palettes tab and persists after reload.
- **AC2** (R1) — Given user A's palette ID, when user B calls any palette function with it, then the call fails and nothing changes.
- **AC3** (R2) — Given a paint detail screen, when the user picks "Add to palette" → "Ultramarines", then the paint is last in that palette's main list; doing it again leaves one copy.
- **AC4** (R4, R5) — Given a palette with Macragge Blue in "Armor", when the user deletes the "Armor" group, then Macragge Blue remains in the main list.
- **AC5** (R5) — Given Macragge Blue in the main list and two groups, when the user removes it from the palette, then it's gone from all three.
- **AC6** (R6) — Given a color in "Armor", when the user drags it into "Highlights", then it's in "Highlights", not "Armor", and still in the main list.
- **AC7** (R6, R8) — Given a keyboard-only user, when they focus a color's drag handle, press Space, use arrows and press Space, then the color moves and a live region announces the new position.
- **AC8** (R7) — Given a drag in progress, then the preview shows swatch, name and brand on a translucent blurred background, and nothing else.
- **AC9** (R9) — Given the device is offline, when the user opens a palette, then edit controls are disabled and a "Connect to edit" notice is visible.
- **AC10** (R10) — Given a user with palettes, when they delete their account, then no palette rows for that user remain.

## Child work items

Each child gets its own planning pass when it is picked up. `wi` updates the
Status column by matching the Slug column, so keep slugs exact.

| # | Type | Slug | Title | Covers | Depends on | Status |
|---|------|------|-------|--------|-----------|--------|
| 1 | story | palettes-core | Palettes tab, storage and palette CRUD | R1, R3, R9, R10 | — | released |
| 2 | story | palette-paints | Add and remove palette paints | R2, R5 (remove half) | 1 | released |
| 3 | story | palette-groups | Palette groups (create, rename, multi-group, move/copy menu) | R4, R5, R8 (menu half) | 1 | released |
| 4 | story | palette-drag-drop | Drag and drop with glass drag preview | R6, R7, R8 (drag half) | 3 | released |
| 5 | bug | palette-group-drag-gap | Group drag leaves a group-sized gap | R6 | 4 | planned |

**Independently shippable:** 1 ships alone (palettes you can name and view, empty until 2). 2 and 3 each ship alone after 1, in either order. 4 needs 3, because cross-group drags need groups. 1 and 4 hold the riskiest parts: 1 fixes the data model every later child depends on, and 4 brings in the new library, so 4's plan opens with a dnd-kit spike on an iPhone before building the full UI.

## Risks and open questions

- **Data model (proposed, decided in child 1 with a DECISIONS entry).** One `palettes` document per palette holding `name`, `paintIds: string[]` (main list order) and `groups: { id, name, paintIds[] }[]`. A drag then becomes one mutation that rewrites the order atomically, and the membership invariants (R5) are enforced in one place. The alternative, separate `paletteEntries`/`paletteGroups` tables with order keys, scales to huge palettes but makes moves multi-row and harder to keep consistent. With caps (below), the document stays far under Convex's 1 MiB document limit. This is a one-way door once real users have data; migrating later means a Convex migration.
- **Caps (proposed defaults, change any):** 50 palettes per user, 200 paints per palette, 30 groups per palette, names 1–60 characters. Enforced server-side.
- **Concurrent edits:** two devices editing the same palette; last write wins on the whole order. Acceptable for v1; noted in DECISIONS.
- **dnd-kit maintenance:** the classic packages' last release was 2024-12. React 19 is within their peer range, but they're untested against React 19.3 here. Child 4 spikes this first.
- **Nested sortables** (groups that are sortable, containing sortable colors, plus a main list) are the hardest dnd-kit pattern; collision detection and touch scroll on iOS need real-device checks.
- **Accessibility:** WCAG 2.1 AA requires a keyboard path (2.1.1) and status announcements; the glass preview's text must meet 4.5:1 contrast over any background (1.4.3). Reduced motion respected.
- **Nav:** a fourth tab narrows each tab on small phones (320 px); check label fit in the floating nav (DECISIONS 045/046).
- **Privacy:** palettes are hobby data tied to a Clerk identity, no student or personnel records. No FERPA surface.

## Progress log

- 2026-10-11 — Planned.
- 2026-10-11 — Epic approved.
- 2026-10-11 — Data model (one palettes document per palette) and caps confirmed with plan approval.
- 2026-10-12 — Child 2 renamed to `palette-paints` (add and remove); row entry point is a Select mode instead of a per-row button.
