# Auth and Account

> Covers sign-in, creating the Convex user, sign-out, and account deletion.
> User journeys: [UX_FLOWS.md Flows 4 and 9](../UX_FLOWS.md). Rules: [SECURITY.md](../SECURITY.md). Env vars: [ENVIRONMENT.md](../ENVIRONMENT.md). Rationale: [DECISIONS 005, 027, 028, 030, 037, 038](../DECISIONS.md).

## TL;DR

- **Clerk** handles identity. Sign-in is **email code only** (DECISIONS 027), in a **bottom sheet**, so users **never leave the app** (iOS PWA rule).
- **`ConvexProviderWithClerk`** passes Clerk's JWT to Convex. `convex/auth.config.ts` trusts **`CLERK_JWT_ISSUER_DOMAIN`**.
- After sign-in, **`useStoreUser`** calls **`users.store`** once per session to create the Convex `users` row.
- A toggle tapped while signed out **finishes after sign-in**, but only once **`users.me` is non-null**.
- **Delete account** removes **Convex data first, then the Clerk account**, from the browser (DECISIONS 037).

## Where the code lives

| Path | Role |
|---|---|
| `src/main.tsx` | `ClerkProvider` → `ConvexProviderWithClerk` → `AppProviders` → router |
| `src/app-providers.tsx` | `ToastProvider` → `CollectionProvider` → `SignInProvider` (+ `<StoreUser>`) |
| `src/features/auth/env.ts` | `readAuthEnv()`: requires `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CONVEX_URL` |
| `src/features/auth/sign-in-provider.tsx` | `<SignInProvider>`, `useSignIn()`, the pending action |
| `src/features/auth/sign-in-sheet.tsx` | Clerk `<SignIn routing="hash" withSignUp>` inside a `<Sheet>` |
| `src/features/auth/clerk-theme.css` | Styles Clerk's form with app tokens |
| `src/features/auth/use-store-user.ts` | `useStoreUser()`, `<StoreUser>` |
| `src/features/auth/account-section.tsx` | Settings **Account** section: sign in or out |
| `src/features/auth/delete-account.tsx` | `<DeleteAccount>` with a **type DELETE** confirmation |
| `convex/lib/auth.ts`, `convex/users.ts` | Server side; see [convex-api.md](collection/convex-api.md) |

## Startup

`main.tsx` calls `readAuthEnv(import.meta.env)`. **If a variable is missing, the error message is rendered on screen** and thrown, so the page isn't left blank. Clerk's `routerPush` and `routerReplace` go through TanStack Router, so finishing sign-in **doesn't reload the page**.

## Sign in

1. Something calls `useSignIn()(pending?)`: a toggle, My Paints, or Settings.
2. The provider saves `returnTo` (the current path and search) and the optional **pending action**, then opens the sheet.
3. Clerk's form runs. A new email **signs up in the same flow** (`withSignUp`).
4. When Clerk reports `isSignedIn`, the sheet **closes**.
5. `<StoreUser>` calls `users.store` once Convex is authenticated. On failure it logs and retries on the next run.
6. When `users.me` becomes non-null, the pending action runs through `useSetPaintFlags()`.

Closing the sheet while signed out **discards** the pending action.

## Sign out

- In **Settings → Account**, the screen shows "Signed in as {email}" with a **Sign out** button.
- With **unsynced changes** (`pending > 0`), a sheet first asks **"Discard unsynced changes?"**.
- Sign-out runs inside **`useEndSession(() => signOut())`**. The device record is cleared **only if sign-out succeeds**.
- On failure, a toast shows **"Couldn't sign out. Check your connection."**
- After sign-out, focus moves to the **Account** heading.
- **Offline**, the Sign in button is disabled with "Signing in needs an internet connection."

## Delete account

The **Delete account** button is disabled, with a note, when the user is **offline** or when Clerk's `user.deleteSelfEnabled` is false.

1. The user types **`DELETE`** to enable confirm. The sheet warns when unsynced changes will be lost.
2. Inside `useEndSession`:
   1. `users.deleteAccount({})` runs.
   2. `clearDevice()` runs. The server copy is gone, so the **device copy goes too**.
   3. `user.delete()` deletes the Clerk account.
   4. `signOut()` runs; a failure here is only logged.
3. On success, the app navigates to `/paints` and shows a toast **"Account deleted"**.
4. On failure, the error depends on the step:
   - Before the server step: **"Couldn't delete your account. Check your connection and try again."**
   - After it: **"Couldn't finish deleting your account. Try again."**

   `deleteAccount` is idempotent, so a retry is safe.
5. The sheet **can't be closed** while deletion runs.

## Relations to other features

- **Collection** ([sync-and-outbox.md](collection/sync-and-outbox.md)): `useEndSession`, `useClearDevice`, the `pending` count, and the device user.
- **Convex** ([convex-api.md](collection/convex-api.md)): `users.store`, `users.me`, `users.deleteAccount`.
- **Settings** ([settings.md](settings.md)): hosts `<AccountSection>`.
- **PWA** ([pwa.md](pwa.md)): `useOnlineStatus()` gates sign-in and deletion.
- **Hosting** ([hosting.md](hosting.md)): the CSP allows Clerk's script, frame and connect origins.
