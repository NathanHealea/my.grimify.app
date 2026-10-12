---
type: task
slug: catalog-pipeline
status: released
branch: task/catalog-pipeline
worktree_path: ../grimify-v2-worktrees/task-catalog-pipeline
created: 2026-10-06
approved: 2026-10-06
version: 0.1.1
tag: v0.1.1
merge_commit: 53fdee6 (squash of task/catalog-pipeline)
---

# Catalog pipeline

## Summary

Build the machinery that turns hand-edited paint data in `data/catalog/` into the `public/catalog.json` the app will load: a Zod schema for the source files, a validator that enforces the catalog rules in DATABASE §3, §6 and §8 (including "paint IDs never disappear"), and a build step that precomputes Lab values and a content-hash version. No real paint data lands here; the seed catalog item imports it next, and this pipeline is what catches mistakes in that import.

## Context

ROADMAP NOW item 3. Nothing catalog-related exists yet: no `data/`, `scripts/` or `public/` directory, no Zod or culori in `package.json` (Zod is only present transitively through the TanStack router plugin). TESTING §7 and CLAUDE.md already promise `npm run catalog:validate` and a `build` that runs `catalog:build` first.

Governing docs: DATABASE §3 (schema, ID rules), §6, §8, §13; ARCHITECTURE §4 "Catalog Pipeline" and §7 (layout: `data/catalog/<brand>.json`, `scripts/build-catalog.ts`); TESTING §2 and §4 (`scripts/**/*.test.ts`); DECISIONS 004 and 008; SECURITY §9.

**Data source decided (2026-10-06, in conversation):** the seed catalog comes from the earlier Grimify project's data (`../grimify/scripts/data/`), about 95% of whose hex values were scraped from PaintPad.app in April 2026. The owner accepted that on condition that the provenance is recorded and PaintPad's permission is sought before a public launch. This item records the decision (DECISIONS 015, DATABASE §13); the import itself is the seed catalog item.

Runtime check: Node 24.19 runs `.ts` files directly (`process.features.typescript === "strip"`), so the build script needs no `tsx` or `ts-node`. Type stripping requires explicit `.ts` extensions on relative imports and erasable-only syntax (no enums, no parameter properties).

## Scope

**In scope**

- Source file format: one `data/catalog/<brandId>.json` per brand holding `brand`, `lines` and `paints`
- Zod schema for the source format and TypeScript types for the generated `catalog.json`
- Validator for every rule below, reporting all errors at once with file and path
- Published-ID ledger `data/catalog/published-ids.json` so removed IDs fail the build (DECISIONS 016)
- Compiler: adds `brandId` to lines and paints, precomputes CIELAB (D65) per paint, sorts output, adds a content-hash `version`
- `scripts/build-catalog.ts` CLI with three modes: validate, build, record IDs
- npm scripts `catalog:validate`, `catalog:build`, `catalog:ids`; `build` and `check` wired to them
- `public/catalog.json` gitignored (generated on every build)
- DECISIONS 015 (data source) and 016 (ID ledger); DATABASE, ARCHITECTURE, TESTING and CLAUDE.md updates

**Out of scope**

- Any real paint data and `data/catalog/SOURCES.md` content (seed catalog item)
- Converting the old Grimify format (`cit-1` IDs, `Fanatic`-style types, `comparable`, `description`, paint groups) (seed catalog item)
- Hue family and value band (`hue`, `value` in `catalog.json`): the next-but-one ROADMAP item, "Hue-family classification at build time"
- Loading `catalog.json` in the app, search, the Paints tab
- Service worker caching of `catalog.json` (PWA item)
- CI workflow (deploy item)
- Failing the build on catalog size; the build prints the gzipped size only

## Dependencies (need your approval)

Versions checked against the npm registry on 2026-10-06.

| Package | Version | Kind | Why |
|---|---|---|---|
| zod | 4.6.5 | runtime | Catalog schema now; URL search params from the Paints tab on (ARCHITECTURE §2). Already in the tree transitively at this version |
| culori | 4.0.2 | runtime | Lab precompute now; CIEDE2000 in the browser later (DECISIONS 008) |
| @types/culori | 4.0.1 | dev | culori ships no type declarations |

## Source format

```jsonc
// data/catalog/citadel.json
{
  "brand": { "id": "citadel", "name": "Citadel", "manufacturer": "Games Workshop", "website": "https://…" },
  "lines": [{ "id": "citadel-base", "name": "Base" }],
  "paints": [
    {
      "id": "citadel-base-mephiston-red", "lineId": "citadel-base", "name": "Mephiston Red",
      "hex": "#9A1115", "type": "base",
      // optional: sku, finish, discontinued, aliases, curatedEquivalents, hueOverride
    }
  ]
}
```

`brandId` is implied by the file and added by the compiler, so it can't disagree with the file. That's a change from DATABASE §3, which shows `brandId` on lines and paints in the source; §3 is updated.

## Validation rules

1. Each file parses as JSON and matches the strict schema (unknown keys are errors, so typos like `discontinue` fail).
2. The file name equals `brand.id`.
3. Brand, line and paint IDs are kebab-case ASCII (`^[a-z0-9]+(-[a-z0-9]+)*$`) and 3–100 characters, matching the Convex `paintId` check (DATABASE §8).
4. Line and paint IDs start with `<brandId>-`.
5. IDs are unique across every file: brands, lines and paints, each in its own namespace.
6. `paint.lineId` names a line in the same file.
7. `hex` matches `^#[0-9A-F]{6}$`; `type`, `finish` and `hueOverride` are from the DATABASE §3 enums; `name` is non-empty after trimming.
8. `curatedEquivalents` entries name existing paints and never the paint itself.
9. Every ID in `published-ids.json` still exists as a paint (IDs are never removed).
10. Every paint ID is in `published-ids.json` (new IDs are recorded deliberately with `npm run catalog:ids`, so the ledger change shows up in review).

## Generated `catalog.json`

```ts
type Catalog = {
  version: string;                // first 16 hex chars of SHA-256 over the rest of the output
  brands: Brand[];                // sorted by id
  lines: (Line & { brandId: string })[];
  paints: (Paint & { brandId: string; lab: [number, number, number] })[];
};
```

`lab` is CIELAB with a D65 white point (culori `lab65`), rounded to 2 decimals, because culori's CIEDE2000 converts through `lab65`. Output is sorted by ID so the same input always gives the same `version`.

## Requirements

- **R1** — `npm run catalog:validate` exits 0 when every file in `data/catalog/` follows the validation rules, and exits non-zero otherwise, printing every violation with its file and JSON path, not only the first.
- **R2** — Each of validation rules 1–10 is enforced.
- **R3** — `npm run catalog:build` validates, then writes `public/catalog.json` in the shape above; it writes nothing if validation fails.
- **R4** — Each paint in `catalog.json` carries its `brandId` and a D65 CIELAB `lab` value rounded to 2 decimals.
- **R5** — `version` is identical for identical input and changes when any catalog value changes.
- **R6** — `npm run catalog:ids` adds unrecorded paint IDs to `published-ids.json` (sorted, no duplicates) and never removes one.
- **R7** — `npm run build` runs `catalog:build` before the type check and Vite build; `npm run check` includes `catalog:validate`.
- **R8** — With no brand files yet, all three commands succeed and `catalog.json` has empty `brands`, `lines` and `paints`.

## Acceptance criteria

- **AC1** (R1, R8) — Given a clean checkout, when I run `npm run catalog:validate`, then it exits 0 and reports 0 brands, 0 paints.
- **AC2** (R1, R2) — Given a scratch `data/catalog/test.json` with a lowercase hex, an unknown `lineId` and a duplicate ID, when I run `npm run catalog:validate`, then it exits 1 and lists all three problems with file and path.
- **AC3** (R2, R6) — Given a valid scratch brand file with new paints, when I run `catalog:validate`, then it fails naming the unrecorded IDs; when I run `catalog:ids` and validate again, then it passes; when I delete one of those paints, then validation fails with "removed".
- **AC4** (R3, R4, R5) — Given a valid scratch brand file, when I run `npm run catalog:build` twice, then `public/catalog.json` exists, every paint has `brandId` and `lab`, and `version` is the same both times; when I change one hex and rebuild, then `version` changes.
- **AC5** (R7) — Given a clean checkout, when I run `npm run build`, then the output shows the catalog step before `tsc` and `dist/catalog.json` exists.

## Test plan

Pure logic lives in `scripts/catalog/` and is tested there with in-memory fixtures (TESTING §4: `scripts/**/*.test.ts`), in the node environment like the existing `lint/` tests.

| ID | Covers | Test | File | Asserts |
|----|--------|------|------|---------|
| T1 | R1, R2 | `accepts a valid brand file` | `scripts/catalog/validate.test.ts` | A fixture with two lines and three paints (one with every optional field) returns no errors |
| T2 | R2 (1) | `rejects unknown keys and malformed JSON` | `scripts/catalog/validate.test.ts` | `discontinue: true` and unparsable text each produce an error with the file name |
| T3 | R2 (2) | `rejects a file whose name differs from the brand id` | `scripts/catalog/validate.test.ts` | `vallejo.json` holding brand `citadel` → error |
| T4 | R2 (3, 4) | `rejects malformed IDs and missing brand prefixes` | `scripts/catalog/validate.test.ts` | `Citadel_Red`, `ab`, a 101-char ID, and `vallejo-x` inside the Citadel file → one error each |
| T5 | R2 (5) | `rejects duplicate IDs across files` | `scripts/catalog/validate.test.ts` | The same paint ID in two files → one error naming both files |
| T6 | R2 (6) | `rejects a paint whose line does not exist` | `scripts/catalog/validate.test.ts` | `lineId: "citadel-nope"` → error at `paints[0].lineId` |
| T7 | R2 (7) | `rejects invalid hex, type, finish and hue override` | `scripts/catalog/validate.test.ts` | `#9a1115`, `#FFF`, `9A1115`, `type: "glaze"`, `hueOverride: "pink"`, a blank name → one error each |
| T8 | R2 (8) | `rejects unresolved and self-referencing curated equivalents` | `scripts/catalog/validate.test.ts` | Unknown ID and the paint's own ID → one error each; an ID from another file is accepted |
| T9 | R2 (9) | `fails when a published ID is removed` | `scripts/catalog/validate.test.ts` | Ledger holds an ID absent from the files → error containing "removed" |
| T10 | R2 (10) | `fails when a paint ID is not yet recorded` | `scripts/catalog/validate.test.ts` | Paint ID absent from the ledger → error naming `npm run catalog:ids` |
| T11 | R1 | `reports every error, not only the first` | `scripts/catalog/validate.test.ts` | A file with three independent faults returns three errors |
| T12 | R4 | `adds brandId and D65 Lab values` | `scripts/catalog/compile.test.ts` | `#FFFFFF` → `lab` ≈ `[100, 0, 0]`; `#000000` → `[0, 0, 0]`; a red's `lab` equals culori `lab65` rounded to 2 decimals; lines and paints carry `brandId` |
| T13 | R5 | `produces a stable, content-based version` | `scripts/catalog/compile.test.ts` | Same input in a different file order → same `version` and identical output; one hex changed → different `version` |
| T14 | R8 | `compiles an empty catalog` | `scripts/catalog/compile.test.ts` | No files → empty arrays and a `version` |
| T15 | R6 | `records new IDs without removing old ones` | `scripts/catalog/ledger.test.ts` | Ledger `[b]` plus paints `a, c` → `[a, b, c]`; running it again changes nothing |

**Not unit testable:**

- R1 exit codes and R3 "writes nothing on failure": CLI file I/O. Verified by hand per AC2–AC4 with scratch files, removed afterwards.
- R7: script wiring. Verified by running `npm run check` and `npm run build` (AC5).

## Implementation plan

1. [x] Install `zod@4.6.5`, `culori@4.0.2` and `@types/culori@4.0.1` with exact versions. Touches `package.json`, `package-lock.json`.
2. [x] Let Node run the scripts as TypeScript and type-check them: `tsconfig.node.json` includes `scripts`, adds `allowImportingTsExtensions` (needs `noEmit`, already set) and `erasableSyntaxOnly`. ESLint gives `scripts/**` Node globals and allows `console.log` there, since printing is the CLI's job. Vitest includes `scripts/**/*.test.ts`. Touches `tsconfig.node.json`, `eslint.config.js`, `vite.config.ts`.
3. [x] Schema and types: `src/features/catalog/schema.ts` holds the Zod source schema (strict objects, enums from DATABASE §3, `HueFamily` included for `hueOverride`) and the `Catalog` output types. It lives in `src/` because the app will read the same types; it imports only `zod`, so Node can load it without the `@/` alias. Touches `src/features/catalog/schema.ts`.
4. [x] Validator with T1–T11: a pure `validateCatalog(files, ledger)` taking `{ fileName, text }[]` and the ledger IDs, returning `{ file, path, message }[]`. Touches `scripts/catalog/validate.ts`, `validate.test.ts`.
5. [x] Compiler with T12–T14: a pure `compileCatalog(files)` over validated files: adds `brandId`, `lab`, sorting, and the SHA-256 `version` (`node:crypto`). Touches `scripts/catalog/compile.ts`, `compile.test.ts`.
6. [x] Ledger update with T15: a pure `recordIds(ledger, paintIds)`. Touches `scripts/catalog/ledger.ts`, `ledger.test.ts`.
7. [x] CLI and data folder: `scripts/build-catalog.ts` reads `data/catalog/*.json` (skipping `published-ids.json`) and runs one of `--validate`, `--build` or `--record-ids`. It prints errors and a summary (brand, line and paint counts; gzipped size on build), and exits 1 on any error. Add `data/catalog/published-ids.json` as `[]`, gitignore `public/catalog.json`, and add the npm scripts: `catalog:validate`, `catalog:build`, `catalog:ids`; `build` becomes `npm run catalog:build && tsc -b && vite build`; `check` gains `npm run catalog:validate`. Touches `scripts/build-catalog.ts`, `data/catalog/published-ids.json`, `.gitignore`, `package.json`.
8. [x] Docs. Touches the files listed.
    - **DECISIONS 015 (Accepted):** seed data comes from the earlier Grimify dataset, mostly PaintPad-derived; record provenance in `SOURCES.md`; ask PaintPad for permission before public launch; if refused, re-source hex values and keep the IDs.
    - **DECISIONS 016 (Accepted on approval of this plan):** the committed published-ID ledger, with the alternatives (diff against the deployed `catalog.json`; commit the generated `catalog.json`).
    - **DATABASE §3:** source file shape, `brandId` implied by the file, `lab` is D65 rounded to 2 decimals, the ledger replaces "compare against the previous `catalog.json`", and `hue`/`value` arrive with the hue item.
    - **DATABASE §13:** TBD resolved → DECISIONS 015.
    - **ARCHITECTURE §7:** add `scripts/catalog/`, `published-ids.json`, `src/features/catalog/schema.ts`.
    - **TESTING §7:** `check` now includes `catalog:validate`; add `catalog:build` and `catalog:ids`.
    - **CLAUDE.md:** drop "catalog validation is added with the catalog pipeline" from the `check` line.
    - **ROADMAP:** add a NOW item before Private beta, "Ask PaintPad for permission to use derived hex data" (from DECISIONS 015), so the condition can't be forgotten.
9. [x] Verify: `npm run check`, `npm run build`, `prettier --check .`, then AC1–AC5 with scratch files (deleted afterwards). Touches nothing.

**Must not change:** the app's routes and components; the DATABASE §3 paint fields and enums (only the `brandId` placement changes); the Convex schema.

## Risks and open questions

- **Decision needed: the dependency list above.** Three packages; the plan can't start without them.
- **Decision needed: DECISIONS 016, the ID ledger.** DATABASE §3 says "compare against the previous `catalog.json`", but `catalog.json` is generated and not committed, so CI has nothing to compare against. The plan replaces that with a committed `published-ids.json`. Alternatives: commit the generated `catalog.json` (merge conflicts on every data change, ~500 KB diffs), or download the deployed one during the build (needs network in CI, and is wrong for the first deploy).
- **Decided by default: new IDs must be recorded explicitly (rule 10).** It adds one command when adding paints, but makes every new permanent ID visible in review. An ID recorded on a branch that is later abandoned does no harm, since it never merges.
- **Decided by default: hue and value wait for their own item.** ARCHITECTURE §4 lists them under the pipeline, but ROADMAP makes hue classification a separate item, and DECISIONS 009's classification rules deserve their own tests.
- **Constraint for later items:** any `src/` module the build script imports must use relative imports with `.ts` extensions, not the `@/` alias, because Node runs the script without Vite. The hue classifier (`src/features/matching/classify-hue.ts`) will hit this first.
- **Open, not blocking: DECISIONS 004 is still "Proposed".** This item builds exactly what it describes. I'd mark it Accepted in step 8 if you agree.
- **Risk: culori and `@types/culori` versions differ (4.0.2 vs 4.0.1).** The type package may lag a patch; T12 will catch any API mismatch in `lab65`.
- **Estimate:** 1–1.5 sessions, assuming the dependencies install cleanly and Node's type stripping handles the scripts without surprises. Add half a session if it doesn't and a runner like `tsx` has to be proposed.

## Progress log

- 2026-10-06 — Planned. Data source decided in conversation: the earlier Grimify dataset (PaintPad-derived), with provenance recorded and permission sought before public launch.
- 2026-10-06 — Approved, including the three dependencies, DECISIONS 016 (ID ledger) and marking DECISIONS 004 Accepted.
- 2026-10-06 — Implementation started in worktree `../grimify-v2-worktrees/task-catalog-pipeline` on `task/catalog-pipeline`.
- 2026-10-06 — Steps 1–9 done. `npm run check` (44 tests in 8 files, catalog valid) and `npm run build` (catalog step before `tsc`, `dist/catalog.json` present) exit 0; `prettier --check .` clean. AC1–AC5 checked with a scratch `data/catalog/test.json`, then removed and the ledger reset to `[]`. Drift:
  - Bug found by T4/T11 and fixed before commit: error paths used the index among schema-valid items, not the source index. Parsed items now keep their source index.
  - Added so a paint that fails the schema isn't also reported as a removed ID: the validator tracks every raw paint ID, and skips the removed-ID check while any file fails to parse at all. Covered by an extra test ("does not report a paint that fails the schema as removed").
  - `scripts/catalog/fixtures.ts` holds shared test builders (not listed in the plan).
  - `published-ids.json` is in `.prettierignore`: the CLI writes it with `JSON.stringify`, which Prettier would reflow for short lists.
  - Error lines print repo-relative paths (`data/catalog/x.json paints[0].hex: …`).
  - `npm ci` warns that `esbuild@0.27.0` install scripts aren't in `allowScripts`. That predates this item (it comes through `convex` and the router plugin) and is left for the owner.
- 2026-10-06 — Staged. `npm run check` (44 tests in 8 files; catalog valid) and `npm run build` exit 0; Prettier clean. Version 0.1.1; no changelog in the repo. Not pushed: the owner's rules keep pushes to the release step, so review is the local branch `task/catalog-pipeline`. Known limitation for the reviewer: a curated equivalent pointing into a file that fails to parse entirely is reported as "does not exist" until that file is fixed.
- 2026-10-06 — Released. Owner approved the review after trying it on a local dev server. Squash-merged 12 commits from `task/catalog-pipeline` into `main` as 0.1.1 (53fdee6), tagged `v0.1.1`. Worktree and branch removed.
