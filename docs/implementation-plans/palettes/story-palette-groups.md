---
type: story
epic: palettes    # removed by `wi new` when there is no parent epic
slug: palette-groups
status: staged
branch: story/palette-groups
worktree_path: /Users/nhealea/Personal/Development/grimify-v2-worktrees/story-palette-groups
created: 2026-10-12
approved: 2026-10-13
commit_type:         # optional override for the release subject type (default: story=feat, bug=fix, task=chore)
version: 0.17.0
review_approved: 2026-10-13
pr:                  # set by `wi pr`
tag:                 # set by `wi release`; the tag sits on the branch's last commit
---

# Palette groups

## Summary

Painters can sort a palette's paints into named groups such as "Armor" and "Highlights". They can make, rename and delete groups, put a paint in several groups, and move or copy a paint from one group to another through menus. Every paint stays in the palette's main list; groups only point at paints already in it. This is the menu half of the epic's groups work. Drag and drop comes next in `palette-drag-drop`.

## Context

Epic: `docs/implementation-plans/palettes/epic-palettes.md`, child 3 (epic R4, R5, and R8's menu half). Depends on `palettes-core` (v0.15.0) and `palette-paints` (v0.16.0), both released into `dev`.

Already in place:

- `convex/schema.ts`: each `palettes` document has `paintIds` (the main list, in order) and `groups: { id, name, paintIds }[]`. Groups exist in the schema but nothing creates them yet (DECISIONS 048: one document per palette, groups capped at 30).
- `convex/palettes.ts`: `listMine`, `get`, `create`, `rename`, `remove`, `addPaints`, `removePaint`. Each starts with `requireUser`, and `requireOwnPalette` throws `NOT_FOUND` for a missing palette or someone else's. `cleanName` trims and checks 1–60 characters (`PALETTE_NAME_INVALID`). `removePaint` already removes a paint from every group (epic R5).
- `src/features/palettes/palette-detail.tsx`: the palette screen. It has a title with a Palette actions sheet (Rename, Delete palette), and the main list (`PaintList`) of swatch, name and brand rows. Each row has a ✕ Remove button that moves focus to a neighbour after removing. Offline, every edit control is disabled and `OFFLINE_EDIT_NOTE` shows in a `role="status"` region.
- `src/features/palettes/palette-name-sheet.tsx`: the New/Rename palette sheet. It validates like the server, maps `PALETTE_LIMIT` and `PALETTE_NAME_INVALID` to messages, and locks while saving when online.
- Toasts take a message only. Sheets are Radix dialogs (`src/components/ui/sheet.tsx`) that trap focus; a sheet opened from state returns focus by hand (`onCloseAutoFocus`).

## Defaults this plan picks (change any)

- **Layout:** the palette screen shows the main list under an "All paints" heading. Below it come the groups, in order, each a section headed by its name with its paints, then a "New group" button. A group with no paints says "No paints in this group yet".
- **Adding to groups (multi-group):** when the palette has at least one group, each main-list row gets a "Groups" button (named "Groups for Macragge Blue") next to Remove. It opens a sheet with one checkbox per group. Ticking adds the paint to that group (at the end) and unticking removes it, saved straight away. No toast; the checkbox state is the feedback. With no groups, the button isn't shown.
- **Paints inside a group:** each row has an actions button ("Actions for Macragge Blue in Armor") opening a sheet with "Move to group…", "Copy to group…" and "Remove from group". Move and Copy list the other groups as buttons. Move takes the paint out of this group and puts it at the end of the chosen one. Copy leaves it here and adds it to the chosen one. A group that already holds the paint is shown but disabled with "(already in it)". Toasts: "Moved to Highlights", "Copied to Highlights", "Removed from Armor". Group rows don't link to paint detail, so the row isn't a second way to the same place; the main list keeps the link.
- **Group actions:** each group heading has an actions button ("Actions for group Armor") opening a sheet with "Rename" and "Delete group".
  - **Rename is inline**, as the epic asks. The heading turns into a text field holding the name, with Save and Cancel. Enter saves, Escape cancels, and focus returns to the group's actions button.
  - **Delete group** asks for confirmation: `Delete group "Armor"?` with "Its paints stay in the palette." It removes only the group; afterwards focus goes to the next group's actions button, or "New group" if none is left.
- **New group:** opens the name sheet (generalised to say "Group name"), creates the group at the end and moves focus to its heading. Names follow the palette rules: 1–60 characters after trimming; duplicates are allowed.
- **Server (`convex/palettes.ts`):**
  - `createGroup({ paletteId, name })` returns the new group's `id`. At 30 groups it throws `GROUP_LIMIT`; a bad name throws `GROUP_NAME_INVALID`.
  - `renameGroup({ paletteId, groupId, name })`, and `removeGroup({ paletteId, groupId })`.
  - `addPaintToGroup({ paletteId, groupId, paintId })` appends the paint; a paint already in the group is a no-op. The paint must be in the main list, or it throws `PAINT_NOT_IN_PALETTE`.
  - `removePaintFromGroup({ paletteId, groupId, paintId })`; a paint not in the group is a no-op.
  - `movePaintToGroup({ paletteId, paintId, fromGroupId, toGroupId })` removes it from one group and appends it to the other in one write. If it's already in the target, it's just removed from the source.
  - An unknown `groupId` throws `GROUP_NOT_FOUND`. Paint IDs are checked against `PAINT_ID` (`INVALID_PAINT_ID`). Every function uses `requireUser` and `requireOwnPalette`, and sets `updatedAt` only when something changed.
  - Group IDs are made on the server as random strings. Clients never pick them, so they can't collide or be guessed into another palette.
- **Offline:** New group, the Groups and actions buttons, and everything inside their sheets are disabled, with `OFFLINE_EDIT_NOTE`, the same as the rest of the palette screen.

## Scope

**In scope**

- The six group mutations, with tests.
- The groups section on the palette screen: create, inline rename, delete.
- The Groups sheet on main-list rows (one paint in several groups).
- The actions sheet on group rows: move, copy, remove from group.
- E2E journey; docs (API, UX_FLOWS, DESIGN_SYSTEM, DECISIONS, the palettes feature doc, PRD Feature 6).

**Out of scope**

- Drag and drop, and reordering paints or groups (story `palette-drag-drop`). Groups keep creation order and paints keep the order they were added.
- Non-drag reordering ("Move up/down"). It's the keyboard equivalent of reordering, so it belongs with drag and drop (epic R8).
- Showing groups anywhere but the palette screen (palette list, picker).
- Undo for delete group or remove from group.

## Requirements

- **R1** — A signed-in user can create a named group in their palette (1–60 characters, at most 30 groups); it appears at the end of the palette's groups.
- **R2** — A user can rename a group inline from its heading, and delete a group after confirming; deleting a group leaves its paints in the palette's main list.
- **R3** — A user can put a main-list paint into any number of the palette's groups and take it out again, from the paint's Groups sheet. A paint is at most once per group, and only paints in the main list can be in a group.
- **R4** — From a paint's actions in a group, a user can move it to another group (it leaves the first), copy it to another group (it stays in both), or remove it from the group (it stays in the palette). Toasts report each.
- **R5** — Group changes only touch the caller's palettes. Another user's palette behaves like a missing one (`NOT_FOUND`), signed-out calls fail with `UNAUTHENTICATED`, an unknown group is `GROUP_NOT_FOUND`, and malformed paint IDs are `INVALID_PAINT_ID`.
- **R6** — Offline, every group control is disabled and `OFFLINE_EDIT_NOTE` shows in a `role="status"` region; groups already loaded stay visible.
- **R7** — All new UI meets WCAG 2.1 AA. Groups are labelled sections with headings, and every control has a name that says which paint and group it acts on. Targets are 44×44px with visible focus. Sheets trap focus and return it. Inline rename takes focus and gives it back. After a delete, focus moves to a sensible next control.

## Acceptance criteria

- **AC1** (R1) — Given palette "Ultramarines", when the user taps "New group" and names it "Armor", then an "Armor" section appears under All paints with "No paints in this group yet", and it's still there after reload.
- **AC2** (R3) — Given Macragge Blue in the main list and groups "Armor" and "Trim", when the user opens "Groups for Macragge Blue" and ticks both, then it's listed in both groups and still in All paints.
- **AC3** (R3) — Given Macragge Blue in "Armor", when the user unticks "Armor" in its Groups sheet, then it leaves "Armor" and stays in All paints.
- **AC4** (R4) — Given Macragge Blue in "Armor", when the user chooses Actions → "Move to group…" → "Highlights", then it's in "Highlights", not "Armor", and a toast says "Moved to Highlights".
- **AC5** (R4) — Given Macragge Blue in "Armor", when the user chooses "Copy to group…" → "Highlights", then it's in both and a toast says "Copied to Highlights".
- **AC6** (R2) — Given group "Armor" holding Macragge Blue, when the user deletes the group and confirms, then "Armor" is gone and Macragge Blue is still in All paints.
- **AC7** (R2, R7) — Given group "Armor", when the user chooses Rename, types "Power armor" and presses Enter, then the heading reads "Power armor" and focus is on its actions button.
- **AC8** (R1) — Given a palette with 30 groups, when the user creates another, then the name sheet says "A palette can have up to 30 groups" and nothing is added.
- **AC9** (R5) — Given user A's palette, when user B calls any group mutation with its ID, then it fails with `NOT_FOUND` and A's palette is unchanged.
- **AC10** (R6) — Given the device is offline, then New group, the Groups buttons and the group actions buttons are disabled, and the offline note is visible.
- **AC11** (R3, epic R5) — Given Macragge Blue in two groups, when the user removes it from the palette with ✕, then it's gone from All paints and both groups (already true since `palette-paints`; checked again here).

## Test plan

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1 | `creates, renames and removes groups` | `convex/palettes.test.ts` | `createGroup` returns an id and appends `{ id, name, paintIds: [] }`; names trimmed; `renameGroup` changes only that group; `removeGroup` leaves `paintIds` intact; `updatedAt` set |
| T2 | R1 | `caps groups and checks group names` | `convex/palettes.test.ts` | 30 → 31st throws `GROUP_LIMIT`; `""`, spaces and 61 characters throw `GROUP_NAME_INVALID` on create and rename; nothing written |
| T3 | R3 | `adds a paint to groups only from the main list` | `convex/palettes.test.ts` | Appends to the group; the same paint twice is a no-op with `updatedAt` unchanged; a paint not in `paintIds` throws `PAINT_NOT_IN_PALETTE`; one paint in two groups |
| T4 | R4 | `moves and removes paints between groups` | `convex/palettes.test.ts` | Move takes it out of the source and appends to the target in one write; a move into a group that already has it just removes from source; remove from group leaves the main list; absent paint is a no-op |
| T5 | R5 | `keeps group changes to the owner` | `convex/palettes.test.ts` | B → `NOT_FOUND` for all six; signed out → `UNAUTHENTICATED`; unknown group → `GROUP_NOT_FOUND`; `"Bad ID!"` → `INVALID_PAINT_ID`; A's row unchanged |
| T6 | R1 | `name sheet names groups` | `src/features/palettes/palette-name-sheet.test.tsx` | Group wording ("Group name"); `GROUP_LIMIT` → "A palette can have up to 30 groups"; `GROUP_NAME_INVALID` → "Give the group a name"; palette wording unchanged |
| T7 | R1, R2, R7 | `shows groups and creates, renames and deletes them` | `src/features/palettes/palette-groups.test.tsx` | Sections with headings in order; empty-group text; New group → `createGroup` and focus to the new heading; inline rename saves on Enter, cancels on Escape, focus back to actions; delete confirm → `removeGroup`, focus to next group's actions or New group |
| T8 | R3, R7 | `Groups sheet adds and removes a paint from groups` | `src/features/palettes/group-membership-sheet.test.tsx` | One labelled checkbox per group, ticked where the paint is; tick → `addPaintToGroup`, untick → `removePaintFromGroup`; button hidden with no groups; focus returns to the row's Groups button |
| T9 | R4, R7 | `group paint actions move, copy and remove` | `src/features/palettes/group-paint-actions-sheet.test.tsx` | Move → `movePaintToGroup` + "Moved to X"; Copy → `addPaintToGroup` + "Copied to X"; groups already holding it disabled; Remove from group → toast; `PAINT_NOT_IN_PALETTE`/errors show a message |
| T10 | R6 | `group controls are disabled offline` | `src/features/palettes/palette-groups.test.tsx` | New group, Groups buttons, group and paint actions disabled; note in `role="status"`; sections still shown |
| T11 | R1–R4 | `groups a palette's paints` | `tests/e2e/palettes.spec.ts` | On the dev deployment: create two groups, add a paint to both, move one, delete a group, paint still in All paints; cleans up |

**Not unit testable:** R7's visual parts (44px targets, focus ring, layout at 320px with two buttons per main-list row) are checked in Playwright where measurable and by hand on an iPhone, and listed in the stage summary.

## Implementation plan

1. [x] Add the six group mutations with owner checks, group and name validation, the 30-group cap and server-made group IDs — touches `convex/palettes.ts`, `convex/palettes.test.ts` — tests T1, T2, T3, T4, T5
2. [x] Let the name sheet name groups as well as palettes — touches `src/features/palettes/palette-name-sheet.tsx`, `palette-name-sheet.test.tsx` — tests T6
3. [x] Show groups on the palette screen with New group, inline rename and delete — touches `src/features/palettes/palette-groups.tsx`, `palette-groups.css`, `palette-groups.test.tsx`, `palette-detail.tsx`, `palette-detail.css` — tests T7, T10
4. [x] Add the Groups sheet to main-list rows — touches `src/features/palettes/group-membership-sheet.tsx`, `.css`, `.test.tsx`, `palette-detail.tsx` — tests T8
5. [x] Add the actions sheet to paints in a group (move, copy, remove from group) — touches `src/features/palettes/group-paint-actions-sheet.tsx`, `.css`, `.test.tsx`, `palette-groups.tsx` — tests T9
6. [x] Extend the E2E journey — touches `tests/e2e/palettes.spec.ts` — tests T11
7. [x] Update docs — touches `docs/API.md`, `docs/UX_FLOWS.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `docs/features/palettes.md`, `docs/PRD.md` — tests none (docs only)

**Must not change:** the `palettes` schema (groups already fit it); the signatures and behaviour of the existing palette functions; `removePaint` still clears a paint from every group; the main list's Remove button, its label and focus handling; `PaintRow` and the paints list.

**High-risk steps:** 1 (new mutations that write user data and must keep the owner checks).

## Risks and open questions

- **Random IDs in a mutation (to verify in step 1):** Convex runs mutations deterministically, and its guidelines file doesn't mention randomness. The plan is `crypto.randomUUID()` or `Math.random`, which Convex seeds per mutation. Step 1 confirms which one Convex supports, with a citation, before relying on it. Fallback: a counter-based id such as `g` + the next unused number, unique within the palette.
- **Two buttons on main-list rows at 320px:** Groups and Remove are each 44px, which leaves the name about 150px, down from about 200px. Long names wrap rather than truncate. Needs a check at 320px and 200% text.
- **Group rows don't link to paint detail:** a deliberate choice so the actions button is the row's only control. If painters expect to open a paint from a group, add the link later.
- **Last write wins (DECISIONS 049)** applies to groups too. Two devices editing groups at the same moment can lose one change.
- **Convex holds mutations offline:** controls are disabled offline, but a mutation started just before the connection drops still lands later, as on the rest of the palette screen.
- **Document size:** 30 groups × 200 paint IDs × 100 bytes is about 600 KB at the theoretical worst. That's under Convex's 1 MiB limit, but not by much. Real IDs average about 30 bytes, so about 180 KB. A per-group paint cap isn't proposed; flag it if the user wants one.
- **DECISIONS entry (052):** records the group menus, server-made IDs, duplicates allowed, group rows not linking, and reordering being left to drag and drop.

## Progress log
- 2026-10-12 — Planned.
- 2026-10-13 — Plan approved.
- 2026-10-13 — Started on branch story/palette-groups from origin/dev.
- 2026-10-13 — Verified: Convex seeds Math.random() per mutation (docs.convex.dev/functions/runtimes); group IDs use it, no counter fallback needed.
- 2026-10-13 — Steps 1-3 done. Focusing a new group no longer assumes Convex renders it before createGroup resolves; the docs don't promise that order.
- 2026-10-13 — Staged: verification passed; version 0.16.0 → 0.17.0; no changelog file.
- 2026-10-13 — Review approved.
