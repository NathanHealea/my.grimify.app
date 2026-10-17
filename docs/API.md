# API Documentation

> Status: **Draft v0.2**
> The app has no REST API. The "API" is (1) the static catalog file and (2) Convex functions called through the typed Convex client (`useQuery` / `useMutation`).

## 1. Static Catalog

### GET /catalog.json

Authentication:
None (public)

Caching:
Fetched once per session as `catalog.json` (`src/features/catalog/load-catalog.ts`); a failed fetch is retried on the next call. The service worker precaches it with the app shell (`workbox.globPatterns` in `vite.config.ts` includes `json`), so a new catalog reaches users with the next app update. `version` changes whenever the content does.

Response:
```json
{
  "version": "a1b2c3d4",
  "brands":   [{ "id": "citadel", "name": "Citadel", "manufacturer": "Games Workshop" }],
  "lines":    [{ "id": "citadel-base", "brandId": "citadel", "name": "Base" }],
  "paints": [
    {
      "id": "citadel-base-mephiston-red",
      "brandId": "citadel",
      "lineId": "citadel-base",
      "name": "Mephiston Red",
      "hex": "#9A1115",
      "lab": [31.2, 50.1, 33.4],
      "hue": "red",
      "value": "dark",
      "type": "base",
      "finish": "matte"
    }
  ]
}
```
(Example values are illustrative. The schema is in DATABASE.md §3.)

---

## 2. Convex Functions

All functions live in `convex/`. Every function except where noted calls `requireUser(ctx)`, which throws `UNAUTHENTICATED` if there's no identity.

### users.store — mutation
Authentication: Required
Purpose: Create the `users` row for the current identity if it doesn't exist (called once after sign-in). Returns the user ID. Idempotent.
Args: none
Returns: `Id<"users">`

### users.me — query
Authentication: Optional (returns `null` when signed out)
Returns:
```ts
{ _id: Id<"users"> } | null   // null when signed out or not stored yet; profile data comes from Clerk on the device
```

### users.deleteAccount — mutation
Authentication: Required (`UNAUTHENTICATED` when signed out)
Args: none
Purpose: Delete all of the caller's `userPaints` (tombstones included), their `palettes` and their `users` row. The Clerk account is deleted afterwards by the client with `user.delete()` (DECISIONS 037).
Behavior:
- No `users` row for the caller → returns `null` without changes, so a retry after a failed Clerk step is safe
- Deletes up to `DELETE_BATCH` (500) `userPaints` rows, then every `palettes` document of the caller (at most 50, so no batching; DECISIONS 048), then the `users` row, all in one transaction. If a full batch was deleted, the internal mutation `users.deletePaints({ userId })` continues in scheduled batches until none are left
Returns: `null`

### userPaints.listMine — query
Authentication: Required (returns `[]` when signed out, so the UI doesn't error)
Args: none
Bounded: at most 5,000 rows (a user has at most one per catalog paint).
Returns:
```ts
Array<{ paintId: string; owned: boolean; wishlisted: boolean; favorite: boolean; updatedAt: number }>
// favorite is false for rows saved before favorites existed
```

### userPaints.set — mutation
Authentication: Required
Args:
```ts
{
  paintId: string;
  owned?: boolean;        // omit to leave unchanged
  wishlisted?: boolean;   // omit to leave unchanged
  favorite?: boolean;     // omit to leave unchanged (DECISIONS 033)
  clientUpdatedAt: number; // ms timestamp of when the user made the change (may be in the past if queued offline)
}
```
Behavior:
- Look up the row via `by_userId_and_paintId`
- Errors: `UNAUTHENTICATED`, `INVALID_PAINT_ID`, `NO_FLAGS`, `CLOCK_IN_FUTURE` (as `ConvexError` data)
- If the row exists and `row.updatedAt > clientUpdatedAt` → ignore (a newer change already won; last-write-wins)
- Otherwise apply the provided flags and set `updatedAt = clientUpdatedAt`
- If no row exists → insert (missing flags default to `false`)
- If all three flags end up `false` → keep the row with every flag `false` (a tombstone), so its `updatedAt` still beats an older queued change (DECISIONS 035). Never deletes
- Idempotent: replaying the same call has no further effect
Validation:
- `paintId` matches `^[a-z0-9-]{3,100}$`
- At least one of `owned` / `wishlisted` / `favorite` is provided
- `clientUpdatedAt` is not more than 5 minutes in the future (clock-skew guard)
Returns: `null`

### palettes.listMine — query
Authentication: Required (`UNAUTHENTICATED` when signed out; the client skips the query until Convex is authenticated)
Args: none
Bounded: at most 50 rows (the per-user cap).
Returns the caller's palettes, most recently updated first:
```ts
Array<{
  _id: Id<"palettes">;
  name: string;
  paintCount: number;          // length of the main list
  previewPaintIds: string[];   // first 5 paint IDs of the main list
  updatedAt: number;
}>
```

### palettes.get — query
Authentication: Required (`UNAUTHENTICATED` when signed out)
Args: `{ paletteId: string }` — a plain string, not `v.id`, because it comes from the URL
Returns: the palette document (`_id`, `_creationTime`, `userId`, `name`, `paintIds`, `groups`, `updatedAt`), or `null` when the string isn't a palette ID, the palette doesn't exist, or it belongs to someone else. The three cases look the same, so a guessed ID reveals nothing (DECISIONS 048).

### palettes.create — mutation
Authentication: Required
Args: `{ name: string }`
Behavior:
- Trims the name; empty or over 60 characters → `PALETTE_NAME_INVALID`
- The caller already has 50 palettes → `PALETTE_LIMIT`
- Inserts `{ userId, name, paintIds: [], groups: [], updatedAt: now }`
Returns: `Id<"palettes">`

### palettes.rename — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, name: string }`
Behavior: trims and checks the name like `create` (`PALETTE_NAME_INVALID`); a missing palette or someone else's → `NOT_FOUND`; otherwise sets `name` and `updatedAt = now`
Returns: `null`

### palettes.remove — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes"> }`
Behavior: a missing palette or someone else's → `NOT_FOUND`; otherwise deletes the document
Returns: `null`

### palettes.addPaints — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, paintIds: string[] }`
Behavior:
- More than 200 IDs in one call → `PALETTE_FULL`
- Any ID that doesn't match `^[a-z0-9-]{3,100}$` → `INVALID_PAINT_ID`, and nothing is added. IDs aren't checked against the catalog (same as `userPaints.set`; DECISIONS 051)
- A missing palette or someone else's → `NOT_FOUND`
- Appends the IDs not already in the main list to its end, in the order given. A repeated ID within the call is added once
- The result would hold more than 200 paints → `PALETTE_FULL`, and nothing is added
- Sets `paintIds` and `updatedAt = now` only when at least one paint was added; otherwise the document is unchanged
Returns: `{ added: number }` — how many paints were new (0 when all were already there)

### palettes.removePaint — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, paintId: string }`
Behavior:
- A `paintId` that doesn't match `^[a-z0-9-]{3,100}$` → `INVALID_PAINT_ID`
- A missing palette or someone else's → `NOT_FOUND`
- Removes the paint from the main list and from every group's `paintIds`; the other paints keep their order
- Sets `updatedAt = now`; a paint that isn't in the palette changes nothing, `updatedAt` included
Returns: `null`

### palettes.createGroup — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, name: string }`
Behavior:
- Trims the name; empty or over 60 characters → `GROUP_NAME_INVALID`. Names don't have to be unique (DECISIONS 052)
- A missing palette or someone else's → `NOT_FOUND`
- The palette already has 30 groups → `GROUP_LIMIT`
- Makes a group ID on the server: 8 base-36 characters from `Math.random`, which Convex seeds per function run, picked again if it matches a group already in the palette. Clients never choose group IDs
- Appends `{ id, name, paintIds: [] }` to `groups` and sets `updatedAt = now`
Returns: `string` — the new group's ID

### palettes.renameGroup — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, groupId: string, name: string }`
Behavior: trims and checks the name like `createGroup` (`GROUP_NAME_INVALID`); a missing palette or someone else's → `NOT_FOUND`; an unknown `groupId` → `GROUP_NOT_FOUND`; the group's current name changes nothing, `updatedAt` included; otherwise sets that group's `name` and `updatedAt = now`
Returns: `null`

### palettes.removeGroup — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, groupId: string }`
Behavior: a missing palette or someone else's → `NOT_FOUND`; an unknown `groupId` → `GROUP_NOT_FOUND`; otherwise deletes the group and sets `updatedAt = now`. The main list doesn't change, so the group's paints stay in the palette
Returns: `null`

### palettes.addPaintToGroup — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, groupId: string, paintId: string, toIndex?: number }`
Behavior:
- A `paintId` that doesn't match `^[a-z0-9-]{3,100}$` → `INVALID_PAINT_ID`; a `toIndex` that isn't a whole number ≥ 0 → `INVALID_INDEX`
- A missing palette or someone else's → `NOT_FOUND`; an unknown `groupId` → `GROUP_NOT_FOUND`
- A paint not in the main list → `PAINT_NOT_IN_PALETTE`
- Inserts the paint at `toIndex` (past the end appends), or at the end without it, and sets `updatedAt = now`; a paint already in the group changes nothing, `updatedAt` included
Returns: `null`

### palettes.removePaintFromGroup — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, groupId: string, paintId: string }`
Behavior:
- A `paintId` that doesn't match `^[a-z0-9-]{3,100}$` → `INVALID_PAINT_ID`
- A missing palette or someone else's → `NOT_FOUND`; an unknown `groupId` → `GROUP_NOT_FOUND`
- Removes the paint from that group only; it stays in the main list and any other groups. Sets `updatedAt = now`; a paint not in the group changes nothing, `updatedAt` included
Returns: `null`

### palettes.movePaintToGroup — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, paintId: string, fromGroupId: string, toGroupId: string, toIndex?: number }`
Behavior:
- A `paintId` that doesn't match `^[a-z0-9-]{3,100}$` → `INVALID_PAINT_ID`; a `toIndex` that isn't a whole number ≥ 0 → `INVALID_INDEX`
- A missing palette or someone else's → `NOT_FOUND`; an unknown `fromGroupId` or `toGroupId` → `GROUP_NOT_FOUND`
- In one write: removes the paint from `fromGroupId` and inserts it into `toGroupId` at `toIndex` (past the end appends), or at the end without it, then sets `updatedAt = now`. If the target already holds it, it's only removed from the source
- A paint not in the source group, or the same group for both, changes nothing, `updatedAt` included
Returns: `null`

### palettes.movePaint — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, paintId: string, toIndex: number }`
Behavior:
- A `paintId` that doesn't match `^[a-z0-9-]{3,100}$` → `INVALID_PAINT_ID`; a `toIndex` that isn't a whole number ≥ 0 → `INVALID_INDEX`
- A missing palette or someone else's → `NOT_FOUND`
- Moves the paint within the main list so it ends up at `toIndex` (past the end means last) and sets `updatedAt = now`. A paint not in the list, or already at that place, changes nothing, `updatedAt` included. Groups don't change
Returns: `null`

### palettes.moveGroupPaint — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, groupId: string, paintId: string, toIndex: number }`
Behavior: as `movePaint`, within one group's `paintIds`; an unknown `groupId` → `GROUP_NOT_FOUND`
Returns: `null`

### palettes.moveGroup — mutation
Authentication: Required
Args: `{ paletteId: Id<"palettes">, groupId: string, toIndex: number }`
Behavior: `INVALID_INDEX`, `NOT_FOUND` and `GROUP_NOT_FOUND` as above; moves the group, with its paints, to `toIndex` among the palette's groups (past the end means last) and sets `updatedAt = now`. Already there → no change
Returns: `null`

Moves send one item and its target position, never the whole order, so an add from another device at the same moment isn't overwritten (DECISIONS 053).

Palette errors are thrown as `ConvexError` with the code string as data: `UNAUTHENTICATED`, `PALETTE_NAME_INVALID`, `PALETTE_LIMIT`, `NOT_FOUND`, `INVALID_PAINT_ID`, `PALETTE_FULL`, `GROUP_NAME_INVALID`, `GROUP_LIMIT`, `GROUP_NOT_FOUND`, `PAINT_NOT_IN_PALETTE`, `INVALID_INDEX`. The name sheet shows "Give the palette a name" for `PALETTE_NAME_INVALID`, "You can have up to 50 palettes" for `PALETTE_LIMIT`, and "Couldn't save the palette. Check your connection and try again." for anything else. The Add to palette sheet shows "This palette is full (200 paints)" for `PALETTE_FULL` and "Couldn't add to the palette. Check your connection and try again." for anything else. A failed remove toasts "Couldn't remove <name>. Check your connection and try again." In group mode the name sheet shows "Give the group a name" for `GROUP_NAME_INVALID`, "A palette can have up to 30 groups" for `GROUP_LIMIT`, and "Couldn't save the group. Check your connection and try again." for anything else. Inline rename shows "Give the group a name" for `GROUP_NAME_INVALID` and "Couldn't rename the group. Check your connection and try again." for anything else. A paint's group actions sheet shows "This paint is no longer in the palette." for `PAINT_NOT_IN_PALETTE` and "Couldn't move <name>…", "Couldn't copy <name>…" or "Couldn't remove <name>…" (each ending "Check your connection and try again.") for anything else. The Groups sheet shows "Couldn't update <group>. Check your connection and try again." for any error, and a failed group delete shows "Couldn't delete the group. Check your connection and try again." A failed drag or Move-sheet move toasts "Couldn't move <name>. Check your connection and try again." (or "group <name>"), after the optimistic update rolls back.

### legacyImports.stageChunk — internal mutation
Authentication: none; internal, so only the deployment's admin (`npx convex run` with a deploy key) can call it. Run by `npm run legacy:load` (DECISIONS 058).
Args:
```ts
{
  emailHash: string;        // 64 lowercase hex characters
  reset: boolean;           // first chunk of a record: replace any staged row for the hash
  done: boolean;            // last chunk: mark the row complete
  ownedPaintIds: string[];
  palettes: { name: string; paintIds: string[]; groups: { name: string; paintIds: string[] }[] }[];
}
```
Behavior:
- Validates everything before reading or writing, so a rejected call changes nothing: `INVALID_EMAIL_HASH`, `INVALID_PAINT_ID` (owned, palette or group paint), `PALETTE_NAME_INVALID` / `GROUP_NAME_INVALID` (empty or over 60 characters after trimming), `PALETTE_FULL` (over 200 paints), `GROUP_LIMIT` (over 30 groups)
- A hash in `legacyImportClaims` → returns `"claimed"` and writes nothing
- `reset` → deletes the hash's staged row, if any, and inserts a new one with this chunk, `palettesOmitted` 0 plus any overflow, `loadedAt = now`
- Not `reset` → appends to the staged row; no row → `NOT_STAGED`. Owned IDs already stored are skipped; `loadedAt` is kept
- Palettes past the 50th are counted in `palettesOmitted` and not stored
- `complete = done`
Returns: `"staged" | "claimed"`

### legacyClaim.findMine — action
Authentication: optional; signed out returns `null` without calling Clerk (DECISIONS 059).
Args: `{}`
Behavior:
- `LEGACY_IMPORT_HASH_KEY` unset on the deployment → `null` (the import is off); set but `CLERK_SECRET_KEY` unset → throws
- Reads the caller's addresses from Clerk's Backend API (`GET /v1/users/{identity.subject}`) and hashes only those with `verification.status === "verified"`; a non-2xx answer from Clerk throws
- Passes the hashes and the caller's `tokenIdentifier` to `legacyImports.summaryForHashes`: `null` when the caller has no `users` row or no complete staged row matches
Returns: `{ ownedCount: number; paletteCount: number } | null`. `paletteCount` includes the palettes the export counted in `palettesOmitted`.

### legacyClaim.resolveMine — action
Authentication: required.
Args: `{ choice: "import" | "discard" }`
Behavior:
- Signed out, or no `users` row → `UNAUTHENTICATED`. Hash key unset, or no complete staged row for a verified address → `LEGACY_IMPORT_NOT_FOUND`. Clerk is called as in `findMine`
- Runs `legacyImports.claim` in one transaction: deletes the staged row and records its hash in `legacyImportClaims`, so neither this nor any other account can claim it again, and loading the export again skips it
- `import`: every staged owned paint becomes `owned: true` with `updatedAt` = claim time; an existing row keeps `wishlisted` and `favorite`, and one already owned is left as it is. Staged palettes are added oldest first as new palettes (new group IDs, `updatedAt` = claim time) until the caller has 50. Existing palettes are never changed
- `discard`: writes nothing to `userPaints` or `palettes`
Returns: `{ paintsAdded: number; palettesAdded: number; palettesSkipped: number }`. `paintsAdded` counts paints that weren't owned before; `palettesSkipped` is the staged palettes past the cap plus `palettesOmitted`. Discard returns zeros.

### legacyImports.summaryForHashes — internal query
Args: `{ tokenIdentifier: string; emailHashes: string[] }`. Called only by `legacyClaim.findMine`. Returns the counts for the first complete staged row among `emailHashes`, or `null` when there is none or the `users` row is missing.

### legacyImports.claim — internal mutation
Args: `{ tokenIdentifier: string; emailHashes: string[]; choice: "import" | "discard" }`. Called only by `legacyClaim.resolveMine`, which derives both from the session and Clerk. Behavior and errors as in `resolveMine`.

---

## 2b. Offline Outbox (client)

Every Own/Want/Favorite change goes through the outbox, online or not (DECISIONS 010, 036). Code: `src/features/collection/` (`outbox.ts` pure logic, `device-store.ts` storage, `collection-provider.tsx` wiring).
- One IndexedDB record (`idb-keyval`, key `grimify-device`): `{ userId, rows?, outbox }`. `userId` is the Clerk user ID; `rows` is the last `listMine` answer; `outbox` holds one `{ paintId, owned?, wishlisted?, favorite?, clientUpdatedAt }` entry per paint
- A change to a paint already queued merges into its entry: later flags win, the newer `clientUpdatedAt` is kept
- The screen shows the live `listMine` answer, or the stored `rows` for the same user, with the outbox applied on top. There is no Convex optimistic update
- Flush: when Convex is authenticated and `users.me` is non-null; after each change, when that becomes true, and on the browser's `online` event. Oldest first, one at a time; an entry is removed only after `set` succeeds, and only if the paint wasn't changed again meanwhile
- `INVALID_PAINT_ID`, `NO_FLAGS`, `CLOCK_IN_FUTURE` → drop the entry (the toggle reverts) and toast "Couldn't save that change." Any other error keeps the entry and stops the flush until the next trigger
- Device user: Clerk's user when Clerk has loaded; the stored `userId` while it hasn't (offline launch). Clerk signed out hides the collection and keeps the record; a different user signing in clears it
- The header shows "1 change waiting to sync" / "n changes waiting to sync" while the outbox isn't empty
- Sign out clears the record; with pending changes it asks first

## 3. Error Format

Convex functions throw `ConvexError` with the error code as a plain string payload:
```ts
throw new ConvexError("UNAUTHENTICATED");
```
The client reads the code from `error.data` (`src/features/collection/outbox.ts`).

| code | Thrown by | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | `requireIdentity`, `requireUser` (`convex/lib/auth.ts`), `legacyClaim.resolveMine` | No signed-in user, or no `users` row yet |
| `INVALID_PAINT_ID` | `userPaints.set`, `legacyImports.stageChunk`, `palettes.addPaints`, `palettes.removePaint`, `palettes.addPaintToGroup`, `palettes.removePaintFromGroup`, `palettes.movePaintToGroup`, `palettes.movePaint`, `palettes.moveGroupPaint` | A paint ID doesn't match `^[a-z0-9-]{3,100}$` |
| `NO_FLAGS` | `userPaints.set` | None of `owned` / `wishlisted` / `favorite` given |
| `CLOCK_IN_FUTURE` | `userPaints.set` | `clientUpdatedAt` more than 5 minutes ahead |
| `GROUP_NAME_INVALID` | `palettes.createGroup`, `palettes.renameGroup`, `legacyImports.stageChunk` | A group name is empty or over 60 characters after trimming |
| `GROUP_LIMIT` | `palettes.createGroup`, `legacyImports.stageChunk` | The palette already has 30 groups, or a staged palette has more than 30 |
| `GROUP_NOT_FOUND` | `palettes.renameGroup`, `palettes.removeGroup`, `palettes.addPaintToGroup`, `palettes.removePaintFromGroup`, `palettes.movePaintToGroup`, `palettes.moveGroupPaint`, `palettes.moveGroup` | No group with that ID in the palette |
| `PAINT_NOT_IN_PALETTE` | `palettes.addPaintToGroup` | The paint isn't in the palette's main list |
| `INVALID_EMAIL_HASH` | `legacyImports.stageChunk` | `emailHash` isn't 64 lowercase hex characters |
| `NOT_STAGED` | `legacyImports.stageChunk` | An append (`reset: false`) for a hash with no staged row |
| `LEGACY_IMPORT_NOT_FOUND` | `legacyClaim.resolveMine` | No complete staged import for the caller's verified addresses: never staged, already claimed or discarded, or the import is off on this deployment |
| `INVALID_INDEX` | `palettes.movePaint`, `palettes.moveGroupPaint`, `palettes.moveGroup`, `palettes.addPaintToGroup`, `palettes.movePaintToGroup` | `toIndex` isn't a whole number ≥ 0 |

The outbox drops an entry on `INVALID_PAINT_ID`, `NO_FLAGS` or `CLOCK_IN_FUTURE` and toasts "Couldn't save that change." Any other error keeps the entry (§2b).

---

## 4. API Rules

- Validate all arguments with Convex validators (`v.*`)
- Authenticate every function that touches user data
- Authorize by deriving `userId` from the auth identity. **Never accept `userId` as an argument.**
- Return consistent `ConvexError` payloads
- Don't expose internal details (stack traces, IDs of other users)
- Queries must use indexes (`withIndex`), never `.filter()` on whole tables
- Keep functions small; shared logic goes in `convex/lib/`
