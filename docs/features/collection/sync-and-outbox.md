# Collection: Sync and Outbox

> Covers how Own/Want/Favorite changes are stored on the device and sent to Convex.
> Contract: [API.md §2b](../../API.md). Rationale: [DECISIONS 010, 035, 036, 038](../../DECISIONS.md).

## TL;DR

- **Every collection write goes through the outbox**, online or offline. **Never call `userPaints.set` from a component** (AGENTS §3). Use **`useSetPaintFlags()`**.
- The device keeps **one IndexedDB record**, key **`grimify-device`**: `{ userId, rows?, outbox }`.
- The UI shows **server rows (or the stored copy) with the outbox applied on top**. A change shows **at once**, and there's no Convex optimistic update.
- The outbox sends **oldest first, one at a time**. Sync is **last-write-wins by client time** (`clientUpdatedAt`).
- **Validation errors drop** the change and toast **"Couldn't save that change."** **Other errors stop** the flush until the next trigger.

## Where the code lives

| Path | Role |
|---|---|
| `src/features/collection/outbox.ts` | **Pure logic**: `enqueue`, `removeSent`, `applyOutbox`, `flushOutbox` |
| `src/features/collection/device-store.ts` | IndexedDB read, write and clear (`idb-keyval`) |
| `src/features/collection/collection-provider.tsx` | `<CollectionProvider>`: wires Convex, Clerk, the device record and the flush |
| `src/features/collection/use-set-paint-flags.ts` | `useSetPaintFlags()` (**the only write path**), `useCanSavePaints()` |
| `convex/userPaints.ts` | Server side; see [convex-api.md](convex-api.md) |

## Data shapes

```ts
type StoredRow   = { paintId; owned; wishlisted; favorite; updatedAt };
type OutboxEntry = { paintId; owned?; wishlisted?; favorite?; clientUpdatedAt };
type DeviceRecord = { userId: string; rows?: StoredRow[]; outbox: OutboxEntry[] };
```

`userId` is the **Clerk user ID**. `rows` is the last `listMine` answer.

## How a change flows

1. A toggle calls `useSetPaintFlags()(paintId, { owned: true })`.
2. `write()` stamps `clientUpdatedAt: Date.now()` and **`enqueue`s** it:
   - **One entry per paint.** A second change to a queued paint merges: later flags win, and the **newer `clientUpdatedAt`** is kept.
3. The record is saved to IndexedDB. The UI re-renders through `applyOutbox`.
4. If flushing is allowed, `flush()` runs `flushOutbox`:
   - Entries go **oldest first**.
   - An entry is skipped if it changed or was discarded since the flush started.
   - On success, `removeSent` drops the entry **only if the paint wasn't changed again** while the send was in flight.
   - On `INVALID_PAINT_ID`, `NO_FLAGS` or `CLOCK_IN_FUTURE` the entry is **dropped** and a toast shows.
   - On **any other error** the flush **stops**. The entry stays.

## When the outbox flushes

`canFlush` is true when **all** of these hold:

- Convex is authenticated.
- `users.me` is non-null, meaning `users.store` has run.
- Clerk has a signed-in user.
- The device record has been read.
- No sign-out or account deletion is running.

Flushes are triggered by:

- `canFlush` becoming true.
- Each new change.
- The browser's **`online`** event.

## Who owns the device record

- **Device user** is Clerk's user once Clerk loads. **Offline, Clerk never loads**, so the stored `userId` stands in (DECISIONS 036).
- **A different user signs in**: the record is **cleared**.
- **Clerk reports signed out**: the collection is hidden, but the **record is kept**.
- **Sign-out and account deletion** run through **`useEndSession(action)`**. Nothing is saved or sent while `action` runs, and the record is **cleared only if the action succeeds** (DECISIONS 038). On failure, saving and sending resume.

## Read the collection

| Hook | Returns |
|---|---|
| `useCollection()` | `{ loading, flags, owned, wishlisted, favorites, pending }` |
| `usePaintFlags(paintId)` | `{ owned, wishlisted, favorite }` (all `false` if absent) |
| `useCanSavePaints()` | `true` when a device user is known; when `false`, toggles open sign-in |
| `useDeviceUserId()` | The device user's Clerk ID, or `undefined` |
| `useEndSession()` / `useClearDevice()` | Session-ending wrapper, and immediate clear |

`pending` is the outbox length. The app header shows **"n change(s) waiting to sync"** while it's above 0 (`src/components/app-shell.tsx`).

## Change it safely

- **Keep `outbox.ts` pure.** Test merge and flush rules in `outbox.test.ts`.
- `applyOutbox` copies the **server merge rule** in `userPaints.set`. **Change both together.**
- Tests: `outbox.test.ts`, `device-store.test.ts`, `collection-provider.test.tsx`, `use-set-paint-flags.test.tsx`.

## Relations to other features

- **Convex API** ([convex-api.md](convex-api.md)): `userPaints.set`, `userPaints.listMine`, `users.me`.
- **Auth** ([auth-account.md](../auth-account.md)): Clerk supplies the user; `useStoreUser` creates the `users` row; sign-out and delete use `useEndSession`.
- **Feedback** ([app-shell-ui.md](../app-shell-ui.md)): `useToast()` shows the dropped-change message.
- **Search** ([search-and-filters.md](../catalog/search-and-filters.md)): reads `useCollection()` for **Show only** and My Paints scope.
