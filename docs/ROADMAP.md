# Roadmap

> Status: **Draft v0.2**. Order within NOW follows the build sequence.

## NOW (MVP)
- Project scaffold: Vite + React + TS, shadcn/ui converted to plain CSS files, design tokens (`tokens.css`), TanStack Router, ESLint/Prettier, Vitest
- Nav bar: floating at the bottom on mobile, in the top glass bar on tablet and desktop (DESIGN_SYSTEM §11, DECISIONS 014, 045)
- Catalog pipeline: `data/catalog` schema, validator, `catalog.json` build
- Seed catalog: Citadel, The Army Painter, Vallejo, AK Interactive, Scale75, Green Stuff World
- Pro Acryl catalog (needs a data source; DECISIONS 018)
- Hue-family classification at build time (before the Paints tab, whose hue search needs it)
- Paints list and smart search (name, hex, brand, hue), query in the URL
- Paints filters: bottom sheet with brand, line, type and hue (URL state)
- Paint detail + computed equivalents (CIEDE2000)
- PWA: manifest, icons, service worker, offline catalog, update prompt, iOS install banner
- Clerk auth (email code) + Convex `users`
- Own / Want toggles (independent) + My Paints tab, with Favorites (added in review, DECISIONS 033)
- Offline outbox for Own/Want/Favorite changes (DECISIONS 035, 036)
- Settings: sign out, delete account, about/data sources (DECISIONS 037, 038)
- Deploy to Cloudflare (Worker static assets) + Convex production at grimify.app (DECISIONS 041, 043); dev and stage environments (DECISIONS 044)
- Ask PaintPad for permission to use the derived hex data (DECISIONS 015); before anything public
- Private beta with friends

## NEXT
- Visual color picker for color search
- Dark mode
- Curated equivalents overriding computed matches
- Quantity, notes and "running low" per paint
- More brands (Two Thin Coats, Kimera, Reaper…)
- Public launch (privacy page, polish)

## LATER
- Barcode scanning to add paints (camera)
- Pick a color from a photo (client-side only)
- Painting recipes and schemes (lists of paints for a model or army)
- Share a collection or wishlist via a read-only link
- Export collection (CSV)

## DEFERRED
- Desktop-optimized layout (two-pane list/detail). Navigation is decided: the nav sits in the full-width glass bar at the top (DECISIONS 014, 045)
- Community-submitted catalog corrections in the app (for now, use GitHub issues/PRs)

## NOT PLANNED
- Native iOS/Android apps
- Payments, subscriptions, ads
- Social features (follows, comments, public profiles)
- Price tracking or store inventory
- Hosting manufacturer images or marketing copy
