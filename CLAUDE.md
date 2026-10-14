# Grimify

A mobile-first PWA for miniature painters: search paints across brands, find cross-brand equivalents, and track owned and wishlisted paints.

**Before any work, read the agent instructions and the docs they point to:**

@docs/AGENTS.md

## Quick facts
- Stack: Vite + React + TypeScript, TanStack Router, shadcn/ui (Radix) + plain CSS files (no Tailwind), vite-plugin-pwa, Convex, Clerk, Cloudflare Workers (static assets)
- Paint catalog = JSON in `data/catalog/` (NOT in Convex). Paint IDs never change.
- Styling: every component has a matching `.css` file (e.g., `button.tsx` + `button.css`). **No styling in .tsx files**: no Tailwind classes, no inline `style`, no CSS-in-JS. One exception: `style` may pass a data value as a CSS custom property, e.g., `style={{ "--swatch-color": paint.hex }}`.
- Anything marked **TBD** in /docs is undecided. Ask; don't guess.

## Commands
- `npm run dev`: start the frontend (run `npx convex dev` in a second terminal)
- `npm run check`: lint + typecheck + tests + catalog validation
- `npm run catalog:ids`: record new paint IDs in `data/catalog/published-ids.json` (needed before new paints validate)
- `npm run build`: production build
- `npm run deploy:dev` / `deploy:stage` / `deploy:prod`: deploy that environment from its branch (`dev`, `stage`, `main`); see docs/ENVIRONMENT.md § Deploying

## Workflow
1. Plan first. Don't write code until I approve the plan.
2. Make small, focused changes.
3. Run `npm run check` and `npm run build` before saying you're done.
4. Update /docs when behavior, schema or decisions change.

## Work Item Workflow
- work_items_root: docs/implementation-plans
- base_branch: dev
- verify_commands:
  - npm run check
  - npm run build
- Branches: work items merge into `dev`; `dev` is promoted to `stage`, `stage` to `main` by fast-forward. Hotfixes branch from and merge into `main` by hand, then `main` is merged back into `dev` only (docs/DEPLOYMENT.md § Branches).
- `bug_tracking`: GitHub Issues on `NathanHealea/v2.grimify.app` (label `bug`, or `enhancement` for follow-ups). Found a bug or follow-up outside the current item? File an issue instead of fixing it in passing. A work item that fixes an issue links it (DECISIONS 026).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

<!-- convex-ai-end -->
