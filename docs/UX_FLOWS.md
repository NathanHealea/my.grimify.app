# UX Flows

> Status: **Draft v0.2**. Screen and tab names follow DESIGN_SYSTEM.md §11.

## Overview

```text
Open app (installed PWA or browser)
   ↓
Paints tab (catalog) ──► Paint detail ──► Equivalents ──► another paint
   │      │                   │
   │      │                   ├─► Own / Want / Favorite ──(signed out)──► Sign in sheet
   │      │                   └─► Add to palette ──► Palette picker
   │      └─► Select ──► tick paints ──► Add to palette ──► Palette picker
   ↓
My Paints tab (Owned | Wishlist | Favorites), with the same Select mode
   ↓
Palettes tab ──► Palette (main list) ──► Remove a paint / Rename / Delete
   ↓
Settings (account, install help, about)
```

Routes (TanStack Router):
- `/` → redirects to `/paints`
- `/paints?q=&brand=&line=&type=&hue=&show=` — catalog list (also handles hex color search via `q`); `show=owned|wishlist|favorites` is the signed-in Show only filter (DECISIONS 031)
- `/paints/$paintId` — paint detail
- `/my-paints?tab=owned|wishlist|favorites&q=&brand=&line=&type=&hue=` — the collection, searched like the catalog; a missing or unknown `tab` means Owned
- `/palettes` — the signed-in user's palettes
- `/palettes/$paletteId` — one palette; any unknown, mangled or someone else's ID shows "Palette not found"
- `/settings`
- `/sign-in`

Page titles (DECISIONS 040): every screen opens with its name as a large title at the top of the content (Paints, My Paints, Palettes, Settings; a paint's or palette's page uses its name). On phones, as it scrolls under the header, a small copy fades into the header. From 640px the header and nav are one bar, and the small copy fades in as a strip along the bar's bottom edge (DECISIONS 045, 046). The browser tab and app switcher read "<title> · Grimify" ("Paint not found · Grimify" for an unknown paint ID).

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
2. Detail screen: large swatch, name, brand, line, type, finish, hex (tap to copy), Own/Want toggles, and an "Add to palette" button (Flow 10)
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
1. Tap Delete account → sheet "Delete your account?": "This permanently deletes your Grimify account, your saved paints and your palettes. It can't be undone." plus, with pending changes, "n changes that haven't synced will be lost too."
2. Type DELETE in "Type DELETE to confirm"; the sheet's Delete account button enables
3. `users.deleteAccount` runs, the phone's copy is cleared, then the Clerk account is deleted
4. User lands on the Paints tab, signed out, with the toast "Account deleted"

Errors (shown in the sheet, which stays open):
- Server step failed: "Couldn't delete your account. Check your connection and try again."
- Clerk step failed: "Couldn't finish deleting your account. Try again."

Disabled: offline → "Deleting your account needs an internet connection."; self-deletion off in Clerk → "Account deletion isn't available right now."

---

## Flow 10 — Palettes

The fourth tab, Palettes (`SwatchBook` icon), sits between My Paints and Settings. Palettes are online only (DECISIONS 047).

List (`/palettes`):
1. User opens the Palettes tab
2. A **New palette** button, then the palettes, most recently changed first. Each row links to the palette and shows its name, "n paints" ("1 paint") and up to five overlapping swatches from the start of its main list
3. Tap a row → the palette

Create:
1. Tap New palette → sheet "New palette" with a "Palette name" field, Cancel and Create
2. Create → the palette opens. Focus returns to New palette if the sheet is closed instead
3. Errors show under the field and the sheet stays open: blank → "Give the palette a name"; over 60 characters → "Use 60 characters or fewer"; the 51st palette → "You can have up to 50 palettes"; anything else → "Couldn't save the palette. Check your connection and try again."

Palette (`/palettes/$paletteId`):
1. The palette's name is the page title; the header has a back link to Palettes
2. The main list in the user's order: swatch, paint name and brand; each known paint links to its page. A paint ID the catalog doesn't have shows a neutral dashed swatch and "Unknown paint". Each row ends with a Remove button (below)
3. Empty: "No paints in this palette yet"
4. Unknown, mangled or someone else's ID: title "Palette not found" and an "All palettes" link

Add a paint (paint detail):
1. On a paint's page, tap **Add to palette** (under the Own/Want/Favorite toggles) → sheet "Add to palette" listing the user's palettes, each with its name and "n paints", then a **New palette** button. With no palettes, only New palette shows
2. Tap a palette → the paint goes to the end of its main list, the sheet closes and a toast says "Added to Ultramarines", or "Already in Ultramarines" when it was there already. A palette never holds the same paint twice
3. Tap New palette → the "New palette" name sheet (same field and errors as Create) → Create makes the palette and adds the paint to it, with the same toast. The user stays on the paint
4. Focus returns to Add to palette when the sheets close
5. Signed out: Add to palette opens the sign-in sheet. After signing in, nothing is added; the user taps Add to palette again (unlike Own/Want, Flow 4; DECISIONS 051)

Add many paints (Select mode, Paints and My Paints):
1. Signed in, tap **Add to palette** beside the result count. Signed out the button isn't shown
2. Each row's Own/Want/Favorite toggles are replaced by a checkbox named "Select <paint name>", and tapping anywhere on the row ticks it instead of opening the paint. Focus moves to the first checkbox
3. A bar that sticks just above the nav while the list scrolls (at the bottom edge from 640px), and sits after the last row at the end of the list, shows "n selected", **Add to palette** and **Done**. Add to palette is disabled until a paint is ticked
4. Ticks survive changes to the search and filters, so a user can search "blue", tick some, search "black" and tick more
5. At most 200 paints can be ticked; at 200 the unticked checkboxes are disabled
6. Add to palette → the same picker. Paints are added in the order they were ticked; new ones go to the end and ones already there are skipped. Toast: "Added 3 paints to Ultramarines", "Added to Ultramarines" for one new paint, or "Already in Ultramarines" when none were new
7. A successful add, Done, or leaving the screen ends Select mode and clears the ticks. Focus returns to the Add to palette button beside the count

Picker errors:
- The palette would go over 200 paints → nothing is added and "This palette is full (200 paints)" shows in the sheet, which stays open so another palette can be chosen
- Anything else → "Couldn't add to the palette. Check your connection and try again." in the sheet

Remove a paint:
1. On the palette, tap the **Remove** button (an ✕ icon) at the end of a paint's row. It's named "Remove Macragge Blue from palette", or "Remove unknown paint from palette" for a paint the catalog doesn't have
2. The paint leaves the palette at once, with no confirmation, and a toast says "Removed Macragge Blue". The other paints keep their order, and focus moves to the next paint's Remove button (the previous one at the end, Palette actions once the list is empty). Re-adding it is one tap from the paint's page (DECISIONS 051)
3. If it fails: the toast "Couldn't remove Macragge Blue. Check your connection and try again." and the paint stays, with focus still on its Remove button. A second tap while a remove is in flight does nothing

Rename and delete:
1. Tap the **Palette actions** button (next to the title) → a sheet with Rename and Delete palette
2. Rename → sheet "Rename palette", field filled with the current name, Cancel and Save; same errors as Create
3. Delete palette → sheet `Delete "<name>"?`: "This deletes the palette. Your paints and collection aren't affected." with Cancel and Delete
4. Delete → back on Palettes with the toast "Palette deleted". If it fails: "Couldn't delete the palette. Check your connection and try again." in the sheet

Signed Out:
"Sign in to keep color palettes on any device." plus a Sign in button. Offline and signed out: "Signing in needs an internet connection."

Loading State:
"Loading your palettes…" (list) or "Loading palette…" (a palette) as a status message.

Offline:
- Loaded list or palette stays visible; New palette, Palette actions and each paint's Remove button are disabled, and a status line says "Connect to the internet to edit palettes."; back online re-enables them
- Add to palette on paint detail, in the selection bar and in the picker is disabled, with the same status line. Select mode can still be turned on and paints ticked; only adding waits for the connection
- Nothing loaded yet (for example after a reload offline): "Palettes need an internet connection."
