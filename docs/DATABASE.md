# Database

> Status: **Draft v0.2**
> This app has **two data stores**: the static paint catalog (JSON in Git) and user data (Convex). Don't add catalog tables to Convex without a new entry in DECISIONS.md.

## 1. Database Engine

Database:
- **Catalog:** JSON files in `data/catalog/`, validated with Zod and compiled to `public/catalog.json`
- **User data:** Convex (document database with a TypeScript schema)

Hosting:
- Catalog: Cloudflare Worker static assets (static file)
- User data: Convex Cloud (free plan)

---

## 2. Naming Conventions

Tables (Convex):
camelCase plural, e.g., `users`, `userPaints`

Fields:
camelCase, e.g., `paintId`, `createdAt`

Primary Keys:
- Convex: automatic `_id` (`Id<"tableName">`)
- Catalog: human-readable **slug** string IDs (see §3)

Foreign Keys:
`<entity>Id`, e.g., `userId: Id<"users">`, `paintId: string` (catalog slug)

Timestamps:
- Convex provides `_creationTime` automatically
- Add `updatedAt: number` (ms since epoch) where updates matter

Indexes:
`by_<field>` / `by_<field1>_and_<field2>`, naming every field in order (Convex guidelines), e.g., `by_userId_and_paintId`

---

## 3. Catalog Schema (JSON in Git)

### Source files
One file per brand, `data/catalog/<brandId>.json`, holding that brand and its lines and paints. Lines and paints don't repeat `brandId`; the build adds it from the file, so it can't disagree with the file. `data/catalog/published-ids.json` is the ledger of published paint IDs (DECISIONS 016).
```jsonc
{ "brand": { /* Brand */ }, "lines": [ /* Product Line, without brandId */ ], "paints": [ /* Paint, without brandId */ ] }
```
The Zod schema and generated types live in `src/features/catalog/schema.ts`; the build is `scripts/build-catalog.ts`.

### Brand
```ts
{
  id: string;          // "citadel" — immutable slug
  name: string;        // "Citadel"
  manufacturer: string;// "Games Workshop"
  website?: string;
}
```

### Product Line
```ts
{
  id: string;          // "citadel-contrast"
  brandId: string;     // "citadel"
  name: string;        // "Contrast"
}
```

### Paint
```ts
{
  id: string;          // "citadel-base-mephiston-red" — immutable, globally unique
  brandId: string;
  lineId: string;
  name: string;        // "Mephiston Red"
  sku?: string;        // manufacturer code if known
  hex: string;         // "#9A1115" — approximate, uppercase, 6 digits
  type: PaintType;
  finish?: "matte" | "satin" | "gloss" | "metallic";
  discontinued?: boolean;
  aliases?: string[];  // old names / alt spellings for search
  curatedEquivalents?: string[]; // optional manual overrides (paint IDs)
  hueOverride?: HueFamily;       // fix a misclassified hue family
}

type PaintType =
  | "acrylic" | "base" | "layer" | "shade" | "wash" | "contrast" | "speedpaint"
  | "dry" | "technical" | "metallic" | "air" | "ink" | "primer" | "other";
```

### Hue families
```ts
// 12-hue artist's color wheel + neutral (DECISIONS 009):
type HueFamily =
  | "red" | "red-orange" | "orange" | "yellow-orange" | "yellow" | "yellow-green"
  | "green" | "blue-green" | "blue" | "blue-violet" | "violet" | "red-violet"
  | "neutral";          // low chroma: whites, greys, blacks
type ValueBand = "light" | "mid" | "dark";
```

### Type families (for equivalents)
Equivalents compare paints within the same **type family** by default (the user can toggle "Show all types"):
| Type family | Paint types |
|---|---|
| `opaque` | acrylic, base, layer, dry, air, primer |
| `tint` | contrast, speedpaint |
| `wash` | shade, wash, ink |
| `metallic` | metallic (or any paint with `finish: "metallic"`) |
| `special` | technical, other: no automatic equivalents; curated only |

The mapping lives in `src/features/matching/type-families.ts`.
Classification (build time, in `src/features/matching/classify-hue.ts`):
- Convert hex → OKLCh
- Chroma `C < 0.03` → `neutral`
- Otherwise the hue angle picks a segment (start inclusive; below 7.5° wraps to red-violet): red 7.5°, red-orange 32.5°, orange 47.5°, yellow-orange 65°, yellow 87.5°, yellow-green 112.5°, green 137.5°, blue-green 170°, blue 220°, blue-violet 265°, violet 295°, red-violet 325°
- `ValueBand` from lightness: `L < 0.40` dark, `L ≥ 0.75` light, otherwise mid
- `hueOverride` in the source data wins (for `hue` only; `value` is always computed)

The constants were tuned on the 2,837-paint seed catalog on 2026-10-06. The artist's wheel gives red to yellow half its circle, but OKLCh fits those hues into about 80°, so the warm segments are narrow. At 0.03, 728 paints are neutral, along with 82% of paints named grey, black or white; the rest of those are visibly tinted (e.g., Silver Grey `#E2D7B7` → yellow). Distribution: neutral 728, yellow 327, yellow-orange 319, red 236, blue 232, orange 208, yellow-green 169, red-orange 156, green 135, blue-green 118, red-violet 99, blue-violet 58, violet 52; value bands 598 dark, 1,612 mid, 627 light. Changing a constant only regenerates `catalog.json`.

### Generated `catalog.json` (build output)
The build adds:
- `brandId` on each line and paint, from the file it came from
- `lab: [L, a, b]` — CIELAB with a D65 white point (culori `lab65`, which CIEDE2000 uses), rounded to 2 decimals
- `hue: HueFamily` — computed (or `hueOverride`)
- `value: ValueBand` — computed
- `version` — first 16 hex characters of a SHA-256 over the rest of the output, for cache-busting and update detection
Brands, lines and paints are sorted by ID, so the same data always gives the same file and `version`.

### ID rules
- Format: `<brandId>-<line-slug>-<name-slug>` (kebab-case, ASCII)
- **IDs never change once published.** Renamed paints keep their ID and get the old name added to `aliases`.
- Paints are never deleted; set `discontinued: true`
- The build fails if an ID in `data/catalog/published-ids.json` disappears, and if a paint ID isn't recorded there yet; `npm run catalog:ids` records new IDs (DECISIONS 016)

---

## 4. Convex Tables (User Data)

### users
Purpose:
One row per signed-in person; links the auth identity to app data.

Fields:
- `_id`
- `tokenIdentifier: string` — from the auth provider (unique)
- No email, name or other profile data: those stay in Clerk and are read on the device (DECISIONS 028)
- `_creationTime`

> Auth is Clerk. `tokenIdentifier` comes from the Clerk JWT via `ctx.auth.getUserIdentity()`. The row is created by `users.store` after first sign-in.

### userPaints
Purpose:
A user's relationship to a catalog paint (owned, wishlist, favorite).

Fields:
- `_id`
- `userId: Id<"users">`
- `paintId: string` — catalog paint ID
- `owned: boolean`
- `wishlisted: boolean` — both may be true (e.g., own one pot, want a replacement)
- `favorite?: boolean` — independent of the other two (DECISIONS 033). Optional because rows saved before favorites lack it; missing means `false`
- `updatedAt: number` — **client** timestamp of the latest change (used for offline last-write-wins)

No quantity, notes or "running low" fields in MVP. When all three flags become false the row stays as a tombstone with its `updatedAt`, so an older queued change can't bring it back (DECISIONS 035). `listMine` leaves tombstones out. At most one row per user and paint, so at most 2,837 per user.
- `_creationTime`

### palettes
Purpose:
A user's named color palette: a main list of catalog paints plus named groups that reference them (DECISIONS 047, 048).

Fields:
- `_id`
- `userId: Id<"users">`
- `name: string` — 1–60 characters after trimming; duplicates allowed
- `paintIds: string[]` — the main list, in the user's order; catalog paint IDs only, never copied names or hex
- `groups: { id: string; name: string; paintIds: string[] }[]` — named sections, in order, referencing paints from the main list. A paint is at most once per group and can be in any number of groups. `id` is 8 base-36 characters made by the server, unique within the palette (DECISIONS 052)
- `updatedAt: number` — **server** time of the last change (orders the Palettes list)
- `_creationTime`

Limits: 50 palettes per user, names of 1–60 characters and 200 paints per palette, enforced in the mutations (`palettes.addPaints` throws `PALETTE_FULL`). 30 groups per palette (`palettes.createGroup` throws `GROUP_LIMIT`) and group names of 1–60 characters (`createGroup` and `renameGroup`). No cap per group (DECISIONS 048, 051, 052).

### Convex schema (reference)
```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
  }).index("by_tokenIdentifier", ["tokenIdentifier"]),

  userPaints: defineTable({
    userId: v.id("users"),
    paintId: v.string(),
    owned: v.boolean(),
    wishlisted: v.boolean(),
    favorite: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_userId_and_paintId", ["userId", "paintId"]),

  palettes: defineTable({
    userId: v.id("users"),
    name: v.string(),
    paintIds: v.array(v.string()),
    groups: v.array(v.object({ id: v.string(), name: v.string(), paintIds: v.array(v.string()) })),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
});
```

---

## 5. Relationships

- users → userPaints: one user has many userPaints
- users → palettes: one user has up to 50 palettes
- palettes → catalog paint: `paintIds` and each group's `paintIds` hold catalog paint IDs (soft reference). An ID the catalog doesn't have shows as "Unknown paint"
- userPaints → catalog paint: many-to-one via `paintId` (soft reference; not enforced by the database)
- brand → productLine → paint (inside the catalog)

---

## 6. Constraints

Required:
- Catalog: `id`, `brandId`, `lineId`, `name`, `hex`, `type`
- userPaints: `userId`, `paintId`, `owned`, `wishlisted`, `updatedAt`
- palettes: `userId`, `name`, `paintIds`, `groups`, `updatedAt`

Unique:
- Catalog `id` (enforced by the build script)
- `users.tokenIdentifier` (enforced in code: look up via index before insert)
- One `userPaints` row per (`userId`, `paintId`), enforced in the mutation via `by_userId_and_paintId`. Owned, wishlisted and favorite are independent flags on that one row.

Foreign Keys:
- `userPaints.userId` → `users._id`
- `palettes.userId` → `users._id`
- `userPaints.paintId` → catalog paint `id` (validated in the mutation against an allow-list or format regex)

---

## 7. Indexes

| Index | Reason |
|---|---|
| `users.by_tokenIdentifier` | Resolve the current user from the auth identity (index names list every field, per the Convex guidelines) |
| `palettes.by_userId` | List the caller's palettes and count them against the 50 cap. Reads are bounded at 50; the list is sorted by `updatedAt` in code |
| `userPaints.by_userId_and_paintId` | Upsert/toggle a single paint, and load the whole collection by its `userId` prefix (no separate `by_userId` index needed). Lists are bounded at 5,000 rows, above the catalog's 2,837 paints |

---

## 8. Data Validation

- Catalog: Zod schema; `hex` matches `^#[0-9A-F]{6}$`; `brandId`/`lineId` must exist; IDs are unique; `hueOverride` must be a valid HueFamily
- Convex: argument validators on every function; `paintId` (in `userPaints.set`, the palette paint and group paint mutations, and every ID in `palettes.addPaints`) matches `^[a-z0-9-]{3,100}$`; palette and group names are trimmed and must be 1–60 characters; a paint must be in the main list before it can join a group
- Strings are trimmed; `notes` (if added) is capped at 500 characters

---

## 9. Soft Delete

Catalog: yes, via `discontinued: true` (never delete).
Convex: removing a paint from a collection keeps its `userPaints` row with every flag `false` (a tombstone, DECISIONS 035). Deleting the account removes all rows. Palettes have no soft delete: `palettes.remove` deletes the document.

---

## 10. Auditing

Not needed for MVP. `_creationTime` and `updatedAt` are enough. Catalog history comes from Git.

---

## 11. Sensitive Data

Sensitive fields:
- None stored in Convex. `users` holds only `tokenIdentifier`; email and name live in Clerk (DECISIONS 028)

Protection:
- `tokenIdentifier` is never returned to clients (`users.me` returns only `_id`)
- Not logged
- Deleted when the account is deleted (see SECURITY.md)

---

## 12. Migration Rules

Schema changes must:
1. Be documented here first
2. Use optional fields or a backfill when changing Convex schema (Convex validates existing docs on deploy)
3. Be tested against the dev deployment
4. Not break existing production data or paint IDs

---

## 13. Seed Data

- Catalog: `data/catalog/*.json` is the real data, seeded from the earlier Grimify dataset (mostly PaintPad-derived hex values; DECISIONS 015). Provenance per brand goes in `data/catalog/SOURCES.md`.
- Dev user data: `convex/seed.ts` (dev only) creates a test user with ~20 owned and ~10 wishlist paints
