# UX Flows

> Status: **Draft v0.2**. Screen and tab names follow DESIGN_SYSTEM.md §11.

## Overview

```text
Open app (installed PWA or browser)
   ↓
Paints tab (catalog) ──► Paint detail ──► Equivalents ──► another paint
   │                          │
   │                          └─► Own / Want / Favorite ──(signed out)──► Sign in sheet
   ↓
My Paints tab (Owned | Wishlist | Favorites)
   ↓
Settings (account, install help, about)
```

Routes (TanStack Router):
- `/` → redirects to `/paints`
- `/paints?q=&brand=&line=&type=&hue=&show=` — catalog list (also handles hex color search via `q`); `show=owned|wishlist|favorites` is the signed-in Show only filter (DECISIONS 031)
- `/paints/$paintId` — paint detail
- `/my-paints?tab=owned|wishlist|favorites&q=&brand=&line=&type=&hue=` — the collection, searched like the catalog; a missing or unknown `tab` means Owned
- `/settings`
- `/sign-in`

Page titles (DECISIONS 040): every screen opens with its name as a large title at the top of the content (Paints, My Paints, Settings; a paint's page uses the paint's name). On phones, as it scrolls under the header, a small copy fades into the header. From 640px the header and nav are one bar, and the small copy fades in as a strip along the bar's bottom edge (DECISIONS 045, 046). The browser tab and app switcher read "<title> · Grimify" ("Paint not found · Grimify" for an unknown paint ID).

---

## Flow 1 — First Visit & Install

1. User opens the URL in mobile Safari or Chrome
2. App shell loads; "Downloading paint catalog…" shows while `catalog.json` downloads
3. Paints tab shows the full catalog
4. After the 2nd visit (counted once per browser session) or ~30s of use, the install hint appears at the top of the page:
   - **Android/Chrome:** "Install app" button → native install prompt. Chrome only offers this once the manifest has icons (GitHub issue #3)
   - **iOS Safari (iPhone, and iPad reporting as a Mac):** "Install Grimify: tap Share, then Add to Home Screen" with the Share icon
   - Never shown when already running from the home screen
5. User installs → the app opens standalone from the home screen

Success:
The app is installed and the catalog is cached for offline use.

Failure:
Catalog download fails → full-screen error with Retry.

Dismissal:
The banner can be dismissed; it stays hidden for 30 days (stored in localStorage).

---

## Flow 2 — Search & Filter Paints

1. User opens the Paints tab
2. Types in the search box → results update as they type (debounced ~100ms). The query is parsed:
   - `#9A1115` / `9a1115` → **color search**: entered-color swatch at top; results ranked by closeness with labels (Very close / Close / Similar)
   - `vallejo` → **brand**: chip `Brand: Vallejo`; all Vallejo paints shown
   - `red-orange` → **hue**: chip `Hue: Red-Orange`; paints sorted light to dark
   - `vallejo red` → brand + hue combined
   - Hue words only filter when nothing else is typed: `mephiston red` and `death guard green` are name searches (DECISIONS 009, paints-search work item)
   - anything else → fuzzy name search; `brown` is a name search (DECISIONS 021)
   - Typeahead suggestions show matching brands and hue names as tappable chips
   - With an empty box, 13 hue dots offer one-tap color browsing
   - Typed terms live in `?q=`; chips and hue dots edit `q`
3. Taps the Filters button (beside the box; shows "Filters · 2" when two are active) → bottom sheet with Brand, Product line (only for ticked brands), Type and Hue (toggle dots). "Show only: Owned / Wishlist / All" joins it with the collection item
4. Taps "Show N paints" (live count) → the sheet closes and filter chips join the search chips; each chip can be removed. Escape, Close or tapping outside discards the changes
5. URL holds the filters as comma-separated lists, e.g. `?q=red&brand=citadel,vallejo&type=metallic`; Back undoes the last apply or chip removal
   - Filters combine with the typed query (DECISIONS 024): OR within a filter, AND across; a ticked line narrows only its own brand; a hue picked in the sheet always filters

Loading State:
None after the catalog is cached (instant).

Empty State:
"No paints match" + Clear filters.

Error State:
N/A (local data).

---

## Flow 3 — View Paint & Find Equivalents

1. User taps a paint in the list
2. Detail screen: large swatch, name, brand, line, type, finish, hex (tap to copy), Own/Want toggles
3. "Equivalents" section lists the closest paints from **other** brands **in the same type family** (e.g., contrast ↔ speedpaint), grouped by brand, ranked by Delta-E, with labels (Very close / Close / Similar). A "Show all types" toggle widens the comparison.
4. Owned equivalents show a "You own this" badge
5. Tap an equivalent → navigates to its detail (back returns)
6. The header's "Back to Paints" returns to the list with its search and filters; from a freshly opened link it goes to `/paints`

Details (DECISIONS 025): up to 3 matches per brand, brands ordered by their closest match; "Show all types" is `?types=all` and doesn't apply to technical or other special paints, which only list curated equivalents ("No automatic equivalents for technical and special paints" when there are none).

Edge:
No match under the threshold (ΔE 10, the edge of "Similar") → "No close match in [Brand]" plus the nearest result, muted.
Unknown paint ID → "This paint isn't in the catalog" with a link to Paints.

Note:
Disclaimer under the swatch: "Colors are approximate."

---

## Flow 4 — Sign In (Email Code)

1. Signed-out user taps Own/Want (or Settings → Sign in)
2. Sign-in bottom sheet opens: email field → "Send code"
3. User receives the email and types the 6-digit code into the app (the user never leaves the PWA)
4. On success: the sheet closes, `users.store` runs, and the pending Own/Want action completes automatically once the `users` row exists (`users.me` non-null). Closing the sheet without signing in drops it. Sign-in returns to the page it was opened from

Success:
Signed in; the action they started is done.

Failure:
- Wrong or expired code → inline error + "Resend code"
- Email not delivered → "Resend" after 30s

Loading State:
"Send code" and "Verify" buttons show a spinner.

---

## Flow 5 — Mark Owned / Wishlist / Favorite

1. Signed-in user taps the Own (plus) toggle on a list row or the detail screen
2. Toggle fills immediately (the change is queued on the phone first)
3. `userPaints.set` runs; the My Paints tab and other devices update in real time
4. Tapping again → un-own (`owned: false`)
5. Own, Want (bookmark) and Favorite (heart) are independent: a paint can be any combination (e.g., you own it and want a replacement)

Error State:
A change the server rejects as invalid reverts the toggle with the toast "Couldn't save that change." A lost connection is not an error: the change waits.

Offline:
The toggle still updates immediately. The change is queued on the phone and a small "1 change waiting to sync" badge appears in the header. It syncs automatically when the connection returns, then the badge disappears. Opening the app offline shows the collection last loaded on this phone, and My Paints works.

---

## Flow 6 — My Paints

1. User opens the My Paints tab
2. Segmented control: **Owned (n)** | **Wishlist (n)** | **Favorites (n)**, three links (`nav` "Collection", `aria-current` on the active one), each its own URL
3. The catalog's search screen scoped to that view: same rows, toggles, search box, chips, hue dots and filters sheet (without Show only). Filtered by brand through the search or the sheet; no brand headers
4. Tap a paint → detail
5. Un-owning, un-wanting or un-favoriting a paint removes it from that view right away

Empty State:
- Owned: "You haven't added any paints yet" → Browse paints
- Wishlist: "Nothing on your wishlist" → Browse paints
- Favorites: "No favorites yet" → Browse paints

Signed Out:
"Sign in to see the paints you own and want, on any device." plus a Sign in button (the app-wide sheet). Offline and signed out: "Signing in needs an internet connection."

Loading State:
Three skeleton rows (hidden from screen readers) and a "Loading your paints…" status while the Convex query loads.

---

## Flow 7 — Browse by Hue

1. On the Paints tab with an empty search, a row of hue-family color dots is shown (Red, Red-Orange, Orange… Neutral)
2. Tap a dot → same result as typing the hue name (chip `Hue: …`)
3. Combine with a brand chip to see, e.g., all of Citadel's blues

---

## Flow 8 — App Update

1. A new version is deployed
2. The service worker detects it in the background
3. Toast: "Update available" + **Reload**
4. User taps it → the app reloads with the new version (and a refreshed catalog)

---

## Flow 9 — Settings & Account Deletion

Settings shows three sections:
- **Account:** the email, Sign out, Delete account (signed in), or Sign in (signed out).
- **Appearance:** "Theme: Follows your system" (dark mode is a NEXT item).
- **About:** the version, where paint colors come from (PaintPad, manufacturer pages) and "Grimify isn't affiliated with any paint manufacturer."
"How to install" (the install banner covers it) and Privacy (public launch) aren't in the MVP.

Sign out:
- With changes waiting to sync, a dialog asks "Discard unsynced changes?" — "2 changes haven't synced. Sign out and discard them?" — with Cancel and Sign out.
- The collection stored on the phone is cleared once sign-out succeeds. If it fails: toast "Couldn't sign out. Check your connection.", nothing is lost.
- Afterwards focus is on the Account heading.

Delete account:
1. Tap Delete account → sheet "Delete your account?": "This permanently deletes your Grimify account and your saved paints. It can't be undone." plus, with pending changes, "n changes that haven't synced will be lost too."
2. Type DELETE in "Type DELETE to confirm"; the sheet's Delete account button enables
3. `users.deleteAccount` runs, the phone's copy is cleared, then the Clerk account is deleted
4. User lands on the Paints tab, signed out, with the toast "Account deleted"

Errors (shown in the sheet, which stays open):
- Server step failed: "Couldn't delete your account. Check your connection and try again."
- Clerk step failed: "Couldn't finish deleting your account. Try again."

Disabled: offline → "Deleting your account needs an internet connection."; self-deletion off in Clerk → "Account deletion isn't available right now."
