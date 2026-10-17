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
Palettes tab ──► Palette (All paints + groups) ──► Remove a paint / Rename / Delete
   │                    └─► New group / Groups for a paint / move, copy, remove in a group
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
2. The main list, under the heading "All paints", in the user's order: swatch, paint name and brand; each known paint links to its page. A paint ID the catalog doesn't have shows a neutral dashed swatch and "Unknown paint". Each row ends with a Remove button (below), and with a Groups button before it once the palette has a group
3. Empty: "No paints in this palette yet"
4. Below the main list, each group is a section headed by its name, in the order they were made, listing its paints (swatch, name, brand; no link). An empty group says "No paints in this group yet". Then a **New group** button
5. Unknown, mangled or someone else's ID: title "Palette not found" and an "All palettes" link

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

Groups (DECISIONS 052):
1. Tap **New group** → sheet "New group" with a "Group name" field, Cancel and Create. Create adds the group at the end, and focus moves to its heading. Errors as in Create, worded for groups: blank → "Give the group a name"; the 31st group → "A palette can have up to 30 groups"; anything else → "Couldn't save the group. Check your connection and try again." Two groups can share a name
2. Tap **Actions for group Armor** (next to the group's heading) → a sheet with Rename and Delete group
3. Rename → the heading becomes a "Group name" field holding the name, with Cancel and Save, and focus moves to the field. Enter or Save saves; Escape or Cancel keeps the old name. Focus returns to the group's actions button. Errors show under the field: blank → "Give the group a name"; over 60 characters → "Use 60 characters or fewer"; anything else → "Couldn't rename the group. Check your connection and try again."
4. Delete group → sheet `Delete group "Armor"?`: "Its paints stay in the palette." with Cancel and Delete. Delete removes the group only and toasts "Deleted group Armor". Focus moves to the next group's actions button, or New group if it was the last. If it fails: "Couldn't delete the group. Check your connection and try again." in the sheet

Put a paint in groups:
1. On a main-list row, tap **Groups for Macragge Blue** → sheet "Groups for Macragge Blue" with one checkbox per group, ticked where the paint already is
2. Tick a group → the paint goes to the end of that group. Untick → it leaves that group and stays in All paints. Each change saves at once, with no toast. A paint can be in any number of groups, once each
3. If a change fails: "Couldn't update Armor. Check your connection and try again." in the sheet, and the box goes back
4. **Done** closes the sheet; focus returns to the Groups button

Move, copy or remove in a group:
1. On a paint in a group, tap **Actions for Macragge Blue in Armor** → sheet "Macragge Blue in Armor" with Move to group…, Copy to group… and Remove from group. Move and Copy are disabled when there's no other group
2. Move to group… → "Move Macragge Blue to", listing the other groups, plus Back. A group that already holds the paint reads "Trim (already in it)" and is disabled. Choose one → the paint leaves Armor and goes to the end of that group; toast "Moved to Highlights"
3. Copy to group… → "Copy Macragge Blue to", the same list. Choose one → the paint stays in Armor and goes to the end of that group too; toast "Copied to Highlights"
4. Remove from group → the paint leaves Armor and stays in All paints; toast "Removed from Armor"
5. After a move or remove, focus goes to the next paint's actions button in the group (the previous one at the end, then the group's actions button). Otherwise it returns to the paint's actions button
6. If it fails: "This paint is no longer in the palette." when it was removed elsewhere, or "Couldn't move Macragge Blue. Check your connection and try again." (copy, remove) in the sheet
7. Removing a paint from the palette with ✕ also takes it out of every group

Arrange (drag and drop, DECISIONS 053):
1. Tap **Arrange** (next to "All paints") → every paint row and group heading swaps its controls for **Move <name>** (or **Move group <name>**) and a **Drag <name>** handle. Links, Groups, Remove, Actions and New group are hidden. The button reads **Done**; tapping it puts everything back and keeps focus on it. Offline, Arrange is disabled
2. Drag a handle (hold briefly on touch; the rest of the row scrolls the page). A frosted preview of the paint (swatch, name, brand) or the group's name follows the finger
   - Within All paints or one group, or among groups: rows shift to make room; drop to reorder
   - Dragging a group: every group shows only its heading until the drop or cancel, so groups shift by one row
   - From All paints into a group: the group is outlined and a line marks the spot. Drop adds the paint there; it stays in All paints. Dropping on the group's heading or empty space puts it at the end
   - From one group to another: the same, but the paint leaves the first group
   - Onto a group that already holds it, or from a group back to All paints: nothing changes
3. Keyboard: focus a handle, Space to pick up, arrow keys to move, Space to drop, Escape to cancel. A screen reader hears the paint, list and position at each step, e.g. "Dropped Macragge Blue at position 4 of 5 in All paints." or "Macragge Blue is already in Trim; nothing changed." After a keyboard drop, focus is on the paint's handle in its new place
4. Without dragging: **Move <name>** → sheet "Move <name>" with "Position 2 of 5", **Move to top**, **Move up**, **Move down** and **Move to bottom** (the ones that don't apply are disabled). Choosing one closes the sheet and focus returns to the Move button. Moving between lists keeps its menus outside arrange mode (Groups sheet, Move to group…)
5. A move shows at once. If the server refuses it, the item goes back and a toast says "Couldn't move Macragge Blue. Check your connection and try again."

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
- Loaded list or palette stays visible, groups included; New palette, Palette actions, each paint's Remove and Groups buttons, New group and every group and group-paint actions button are disabled, and a status line says "Connect to the internet to edit palettes."; back online re-enables them
- In group sheets already open, the checkboxes, Remove from group, the move and copy targets and Delete are disabled, with the same status line
- Add to palette on paint detail, in the selection bar and in the picker is disabled, with the same status line. Select mode can still be turned on and paints ticked; only adding waits for the connection
- Nothing loaded yet (for example after a reload offline): "Palettes need an internet connection."

---

## Flow 11 — Bring Over Old Grimify Data

For people who used the old Grimify (epic `legacy-import`, DECISIONS 059). Code: `src/features/legacy-import/legacy-import-prompt.tsx`, mounted once in `AppProviders`.

1. Once per signed-in session, after the `users` row exists (`users.me` non-null), the app calls `legacyClaim.findMine`. A reload or the next sign-in counts as a new session
2. When a verified email address of the account matches staged old data, a bottom sheet opens: "Bring over your old Grimify data?", "We found 120 owned paints and 5 palettes from your old Grimify account. Importing adds them to what you have here and changes nothing you already have." Buttons: **Import**, **Not now**, **Discard**, and the sheet's Close. Focus starts on Import
3. **Import** → the paints are marked owned (wishlist and favorite stay as they are) and the palettes are added as new palettes, oldest first, up to 50. The sheet shows the result step, titled "Your old Grimify data", with "Added 120 paints and 5 palettes.", or "Added 120 paints and 2 palettes. 3 palettes didn't fit." when the 50-palette cap was reached, and one **Done** button, which gets focus and closes the sheet
4. **Discard** → the sheet asks "Discard your old data for good?" ("Your old paints and palettes will be deleted and can't be brought over later.") with **Discard for good** and **Cancel**; focus moves to Cancel, so a second press of Enter or Space can't discard by accident (WCAG 3.3.4). Cancel goes back with focus on Discard. Discard for good → the result step with "Old Grimify data discarded." and **Done**
5. **Not now**, Close or Escape → the sheet closes and nothing changes; it's offered again next session

After Import or Discard the old data is gone from the server: no account sees the prompt for it again.

Failure:
- The lookup fails (offline, Clerk down) → no sheet; the error is logged and the app works as before
- Import or Discard fails → the sheet shows "Couldn't import your old data. Try again." or "Couldn't discard your old data. Try again." above its buttons; the buttons stay and the data stays staged
- Import or Discard finds the data already gone (`LEGACY_IMPORT_NOT_FOUND`: another tab or device resolved it first) → the result step with "Your old data was already brought over or discarded." and **Done**

Loading State:
While Import or Discard runs, the buttons are disabled and the sheet can't be closed.

Signed Out:
Nothing is shown, and the server isn't asked.

Accessibility:
Outcomes and errors are announced from a `role="status"` region inside the sheet that's always mounted, never by toast: while the sheet is open, Radix Dialog hides the rest of the page, toasts included, from assistive tech.
