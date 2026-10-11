# Product Requirements Document

> Status: **Draft v0.2**. Sections marked **TBD** still need a decision from the product owner (Nathan).
> Items under "Assumptions" are working guesses. Confirm or correct them before implementation starts.

## 1. Product Overview

Product Name:
**Grimify** (Decision 013)

One-Line Description:
A free, installable mobile web app for miniature painters to browse paints across brands, find cross-brand equivalents, and track which paints they own or want.

Product Type:
Progressive Web App (PWA), a hobby/community tool. Initial release is a **private beta for Nathan and friends**; a public launch may come later.

Primary Platform:
Mobile web (iOS Safari and Android Chrome), installed to the home screen. Desktop browsers are supported, but the design is mobile-first.

---

## 2. Problem

What problem are we solving?
Miniature paints come from many brands (Citadel/Games Workshop, The Army Painter, Vallejo, AK Interactive, Scale75, Pro Acryl, etc.), each with its own names, ranges and paint types. Painters can't easily answer:
- "Do I already own this paint?" (especially while standing in a hobby store)
- "My tutorial uses Brand A's paint, but I own Brand B. What's the closest match?"
- "What paints do I want to buy next?"

Why does this problem matter?
Painters buy duplicates, can't follow tutorials with the paints they own, and waste money and time.

How are users solving this today?
Spreadsheets, notes apps, photos of their paint rack, manufacturer conversion charts (often incomplete or brand-biased), and third-party paint apps. **TBD:** list the specific competitor apps you know of and what they get wrong.

---

## 3. Goal

Primary Goal:
Let a painter quickly search any supported paint, see its closest equivalents in other brands, and know whether they own it. It should work on their phone, including offline.

Secondary Goals:
- Cost $0 to host and run (free tiers only)
- Feel like a native app when installed to the home screen
- Keep the paint catalog easy to maintain and correct through version-controlled data files

---

## 4. Target Users

### User Type 1 — Hobby Miniature Painter

Name:
"The Hobbyist"

Description:
Paints tabletop wargaming or board-game miniatures (Warhammer, D&D, etc.). Owns somewhere from 20 to several hundred paints across multiple brands.

Needs:
- Fast lookup of a paint by name
- Cross-brand equivalents
- A personal inventory and wishlist on their phone

Pain Points:
- Buys duplicates
- Can't substitute paints when following tutorials
- Manufacturer charts are hard to use on mobile

### User Type 2 — **TBD**
(e.g., beginner painters, store staff, content creators. Remove this section if there's only one user type.)

---

## 5. User Stories

- As a painter, I want to search paints by name across all brands so that I can find a paint quickly.
- As a painter, I want to filter paints by brand, product line and paint type so that I can browse a range.
- As a painter, I want to see the closest equivalent paints from other brands so that I can substitute paints I own.
- As a painter, I want to mark a paint as owned or wishlisted so that I know what I have and what to buy.
- As a painter, I want my collection to sync between devices so that I can check it on my phone and desktop.
- As a painter, I want the app to work offline so that I can use it in a store with poor reception.
- As a painter, I want to install the app to my home screen so that it feels like a native app.
- As a painter, I want to enter a hex color and find the closest paints so that I can match a reference color.
- As a painter, I want to type a brand name and see its whole range so that I can browse what a brand offers.
- As a painter, I want to type a color name like "red-orange" and see every paint in that hue so that I can pick from all brands.

---

## 6. Core Features

### Feature 1 — Paint Catalog Browse & Smart Search

Purpose:
Browse and search every paint in the catalog from one search box, by **paint name, hex code, brand, or color (hue) name**.

User Flow:
Open app → Paints tab → type in the search box and/or apply filters → scroll the results → tap a paint to open its details.

Search modes (detected automatically from what the user types):
| User types | Behavior |
|---|---|
| A paint name, e.g., `mephiston` | Fuzzy name search (includes aliases) |
| A hex code, e.g., `#9A1115` or `9a1115` | Color search: closest paints across all brands, ranked by Delta-E, with match labels |
| A brand name, e.g., `vallejo` | Shows all paints in that brand (applied as a brand filter chip) |
| A hue name from the 12-hue artist's wheel, e.g., `red`, `red-orange`, `orange` (or `neutral`) | Shows paints in that hue family, sorted light to dark |
| A combination, e.g., `vallejo red-orange` | Brand + hue applied together |

Inputs:
Search text; filters for brand, product line, paint type, hue family, and owned/wishlist/favorite status (when signed in).

Outputs:
A list of paints showing a color swatch, name, brand, product line, type and ownership badge.

Acceptance Criteria:
- Fuzzy search matches partial and misspelled names (e.g., "mephston" finds "Mephiston Red")
- Typing a valid 3- or 6-digit hex code switches to color search; a swatch of the entered color is shown above the results
- Typing a brand name shows that brand's full range
- Typing a hue family name shows every paint in that family; each paint's hue family is computed from its hex at build time
- The detected mode is shown as removable chips (e.g., `Brand: Vallejo` `Hue: Red-Orange`), so the user can see and undo it
- Filters can be combined and are stored in the URL (shareable, survive reload and back button)
- Results appear in under 100 ms after typing on a mid-range phone
- Works fully offline after the first load

Edge Cases:
- No results → empty state with a "clear filters" action
- Paints with the same name in different brands → brand is always shown
- Discontinued paints → shown with a "Discontinued" badge (**TBD:** hidden by default?)

### Feature 2 — Paint Detail & Cross-Brand Equivalents

Purpose:
Show a paint's details and its closest matches in other brands.

User Flow:
Tap a paint → detail screen → see the swatch, metadata and an "Equivalents" list grouped by brand → tap an equivalent to open it.

Acceptance Criteria:
- Equivalents are ranked by color distance (CIEDE2000 Delta-E)
- Each equivalent shows its Delta-E as a plain-language label (e.g., "Very close", "Close", "Similar")
- Only paints in the same type family are compared by default (opaque ↔ opaque, contrast/speedpaint ↔ each other, washes/shades/inks ↔ each other, metallics ↔ metallics). A "Show all types" toggle removes this restriction. Technical paints get curated equivalents only.
- Owned equivalents are highlighted ("You own this")

Edge Cases:
- No equivalent within the threshold → show "No close match" with the nearest result anyway
- Metallics and washes don't match well by hex → show a disclaimer

### Feature 3 — My Paints (Collection & Wishlist)

Purpose:
Track the paints the user owns, wants and loves using.

User Flow:
On any paint (list or detail), tap "Own", "Want" and/or "Favorite" → the change saves immediately → the My Paints tab shows Owned, Wishlist and Favorites lists. A paint can be both owned and wishlisted (e.g., want a replacement pot).

Acceptance Criteria:
- Requires sign-in; signed-out users are prompted to sign in when they tap Own/Want
- Toggling is optimistic (the UI updates immediately)
- Collection syncs across devices
- Collection is viewable offline (cached)

Edge Cases:
- Toggling while offline → saved on the phone, queued, and synced automatically when back online ("n changes waiting to sync")
- Same paint changed on two devices while one was offline → the most recent change wins
- A paint removed or renamed in the catalog → collection entries keep working because paint IDs are immutable

### Feature 4 — Installable PWA & Offline Support

Purpose:
Make the app feel native and usable without a connection.

Acceptance Criteria:
- Installable on Android (install prompt) and iOS (guided "Add to Home Screen" banner)
- Opens full-screen (standalone) with an app icon and splash/theme color
- Catalog, search and equivalents work offline
- A new version is detected and the user is offered a "Reload to update" prompt

### Feature 5 — Sign In

Purpose:
Let users save their collection.

Acceptance Criteria:
- Email one-time code sign-in (via Clerk) works inside the installed iOS PWA
- Browsing the catalog does **not** require an account
- Email code only for MVP; OAuth revisited after the beta (DECISIONS 027)

---

## 7. Non-Goals

The following are intentionally NOT part of this version:
- Native iOS/Android apps
- Payments, subscriptions or ads
- Social features (following, comments, public profiles)
- User-submitted paints or catalog edits inside the app (catalog changes go through the Git repo)
- Product photos or descriptions copied from manufacturer sites
- Price tracking or store inventory

---

## 8. MVP Scope

Must Have:
- Paint catalog for the launch brands: **Citadel, The Army Painter, Vallejo, AK Interactive, Scale75, Green Stuff World, Pro Acryl (Monument Hobbies)**. Every product line in the seed data is included except AK Abteilung 502 (oils); Pro Acryl follows once it has a data source (DECISIONS 018)
- Smart search: by name, hex, brand and hue family; plus filters
- Paint detail with computed cross-brand equivalents
- Sign in (email one-time code)
- Owned and wishlist tracking
- Installable PWA with an offline catalog

Nice to Have:
- Per-paint quantity, notes and a "running low" flag
- Visual color picker (in addition to typing a hex code)
- Dark mode
- Manual "curated" equivalents that override computed ones

Future:
- Barcode scanning to add paints
- Pick a color from a photo
- Painting recipes and schemes
- Sharing a collection or wishlist via link
- Additional brands beyond launch (e.g., Two Thin Coats, Kimera, Reaper)

---

## 9. Success Metrics

Primary Metrics:
- **TBD:** e.g., number of weekly active users, number of installs
- Catalog coverage: % of each launch brand's current range included

Secondary Metrics:
- Number of paints marked owned or wishlisted per user
- Hosting cost stays at $0/month

---

## 10. Constraints

Technical:
- Free-tier services only (Cloudflare Workers, Convex free plan, free auth tier)
- Must work as an installed iOS PWA (affects auth and storage choices)
- TypeScript throughout

Business:
- No budget
- Built mostly by AI coding agents under Nathan's direction

Design:
- Mobile-first; one-handed use with a floating nav bar at the bottom on phones (in the top glass bar on tablet and desktop)
- Paint swatches are the visual focus; the UI chrome stays neutral

Timeline:
- **TBD**

---

## 11. Assumptions

- Paint colors are stored as approximate hex values. Hex can't fully represent metallics, washes or contrast paints.
- Paint names and approximate colors can be listed; manufacturer images and marketing copy are not used.
- The catalog has a few thousand paints at most, small enough to ship to the client as one JSON file.
- Most users browse on mobile.
- The catalog is public; only collections require sign-in.
- Initial users are Nathan and friends (dozens, not thousands), comfortably within free tiers. Sign-up is open to anyone with the link; the URL is simply not advertised.

---

## 12. Open Questions

- What is the product name?
- Which brands and product lines are in the launch catalog?
- Where does the hex data come from (manual entry, community datasets, color-picking from swatches)? Licensing must be checked.
- ~~Email code only, or also OAuth providers?~~ Email code only for MVP (DECISIONS 027).
- Which product lines of each brand are in the launch set (e.g., all current Citadel ranges, or only Base/Layer/Shade/Contrast)?
- ~~Should "brown" also work as a search alias?~~ Not for MVP: "brown" is a name search (DECISIONS 021).

---

## 13. Definition of Done

The feature/product is considered complete when:
- [ ] Requirements are implemented
- [ ] Critical user flows work on iOS Safari (installed) and Android Chrome
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Security requirements are satisfied
- [ ] Documentation is updated
