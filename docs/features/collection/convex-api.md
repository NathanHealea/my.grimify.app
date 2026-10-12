# Collection: Convex Backend

> Covers the Convex schema and the `users` and `userPaints` functions.
> Full contracts: [API.md §2](../../API.md). Schema rules: [DATABASE.md §4](../../DATABASE.md). Auth rules: [SECURITY.md](../../SECURITY.md).

## TL;DR

- **Two tables**: **`users`** (only `tokenIdentifier`) and **`userPaints`** (one row per user and paint).
- **No profile data in Convex.** Email and name stay in Clerk (DECISIONS 028).
- **The user is never taken from arguments.** Every function derives it with **`requireUser(ctx)`** or `requireIdentity(ctx)`.
- **`userPaints.set` is last-write-wins** on `clientUpdatedAt`. It **never deletes**: all-false rows stay as **tombstones** (DECISIONS 035).
- The **catalog isn't in Convex**. `paintId` is checked for **shape only**, not against the catalog.

## Where the code lives

| Path | Role |
|---|---|
| `convex/schema.ts` | Tables and indexes |
| `convex/lib/auth.ts` | `requireIdentity`, `findUser`, `requireUser` |
| `convex/users.ts` | `store`, `me`, `deleteAccount`, internal `deletePaints` |
| `convex/userPaints.ts` | `set`, `listMine` |
| `convex/auth.config.ts` | Clerk as the JWT provider (`CLERK_JWT_ISSUER_DOMAIN`, audience `convex`) |
| `convex/*.test.ts` | `convex-test` suites |

**Never edit `convex/_generated/*`.** Read `convex/_generated/ai/guidelines.md` before changing Convex code.

## Schema

| Table | Fields | Index |
|---|---|---|
| `users` | `tokenIdentifier: string` | `by_tokenIdentifier` |
| `userPaints` | `userId: Id<"users">`, `paintId: string`, `owned: boolean`, `wishlisted: boolean`, `favorite?: boolean`, `updatedAt: number` | `by_userId_and_paintId` |

`favorite` is optional because rows written before favorites existed lack it. **Missing means `false`.**

## Functions

| Function | Kind | Auth | Returns |
|---|---|---|---|
| `users.store` | mutation | Required | `Id<"users">`; **idempotent** |
| `users.me` | query | Optional | `{ _id }` or `null` |
| `users.deleteAccount` | mutation | Required | `null` |
| `users.deletePaints` | **internal** mutation | n/a | `null` |
| `userPaints.set` | mutation | Required | `null` |
| `userPaints.listMine` | query | Optional | rows; **`[]` when signed out** |

### `userPaints.set`

Args: `{ paintId, owned?, wishlisted?, favorite?, clientUpdatedAt }`.

1. `requireUser(ctx)`, or `UNAUTHENTICATED`.
2. `paintId` must match `^[a-z0-9-]{3,100}$`, or `INVALID_PAINT_ID`.
3. At least one flag is required, or `NO_FLAGS`.
4. `clientUpdatedAt` may be **at most 5 minutes** in the future, or `CLOCK_IN_FUTURE`.
5. If the existing row's `updatedAt` is **newer**, it **ignores** the call.
6. It merges the given flags over the existing row; missing flags default to `false`.
7. It patches or inserts, with `updatedAt = clientUpdatedAt`.

Errors are thrown as `ConvexError` with a **string** payload, e.g. `new ConvexError("NO_FLAGS")`.

### `userPaints.listMine`

- Reads up to **5,000** rows through `by_userId_and_paintId`.
- **Filters out tombstones** (rows where all three flags are false).
- Returns `favorite ?? false`.

### `users.deleteAccount`

1. Finds the caller's user. If there is none, it returns `null` (**safe to retry**).
2. Deletes up to **500** (`DELETE_BATCH`) `userPaints` rows, tombstones included.
3. Deletes the `users` row.
4. If a full batch was deleted, it schedules `internal.users.deletePaints` to continue until none are left.

The **Clerk account is deleted by the client afterwards** (DECISIONS 037); see [auth-account.md](../auth-account.md).

## Change it safely

- Always use **argument and return validators** and **`withIndex`**.
- A **schema change** needs DATABASE.md updated first. Keep `favorite`-style fields **optional** for existing rows.
- The **merge rule** in `set` is copied by `applyOutbox` in `src/features/collection/outbox.ts`. **Change both together.**
- Run backend tests with `npm test`; they include `convex/userPaints.test.ts` and `convex/users.test.ts`.

## Relations to other features

- **Outbox** ([sync-and-outbox.md](sync-and-outbox.md)): the only client caller of `userPaints.set`.
- **Auth** ([auth-account.md](../auth-account.md)): Clerk issues the JWT; `useStoreUser` calls `users.store`; delete account calls `users.deleteAccount`.
