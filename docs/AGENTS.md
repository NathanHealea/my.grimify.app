# AI Coding Agent Instructions

> Point your tool at this file: e.g., a root `CLAUDE.md` or `.cursor/rules` containing "Read docs/AGENTS.md first."

## 1. Project Context

Project:
Grimify (see PRD.md)

Purpose:
A free, installable mobile PWA for miniature painters to search paints across brands (Citadel, The Army Painter, Vallejo…), find cross-brand color equivalents, and track owned and wishlisted paints.

Primary Users:
Hobby miniature painters, mostly on phones.

Stack (summary; details in ARCHITECTURE.md):
Vite + React + TypeScript · TanStack Router · shadcn/ui (Radix) styled with plain CSS files, no Tailwind · vite-plugin-pwa · Convex · Clerk · Fuse.js · culori · Zod · Vitest · Playwright · Cloudflare Workers (static assets)

---

## 2. Source of Truth

Before making significant changes, read the relevant documentation in `/docs`:
- PRD.md — what we're building
- UX_FLOWS.md — screens, routes, user journeys
- DESIGN_SYSTEM.md — visual rules
- ARCHITECTURE.md — structure and data flow
- DATABASE.md — catalog schema and Convex schema
- API.md — Convex function contracts
- SECURITY.md — auth and authorization rules
- CODE_STYLE.md — conventions
- TESTING.md — how to validate
- DECISIONS.md — why things are the way they are (don't re-decide these)
- features/overview.md — how each feature works in code, by feature (index of `docs/features/`)

The topic docs above win over `docs/features/` when they disagree; flag the conflict.
Don't contradict these documents without first identifying the conflict.
Anything marked **TBD** is undecided. **Ask; don't pick.**

---

## 3. General Rules

- Understand existing code before modifying it
- Reuse existing components and utilities
- Follow the design system (tokens only; shadcn components)
- Follow the architecture and dependency rules
- Follow database conventions
- Follow security requirements
- Follow coding conventions
- Don't invent business requirements
- Don't expose secrets
- Avoid unnecessary dependencies (ask before adding any)
- Avoid unrelated changes

### Project-specific rules
- **Catalog:** The paint catalog lives in `data/catalog/*.json`, not Convex. Never move it into Convex without a new DECISIONS.md entry.
- **Paint IDs are immutable.** Never rename or delete a paint ID. Rename by adding an `alias`; retire with `discontinued: true`.
- **Convex:** Read `convex/_generated/ai/guidelines.md` before writing Convex code; it overrides training-data knowledge of the Convex API. Always use argument validators and `withIndex`. Never accept `userId` from the client; derive it with `requireUser(ctx)`.
- **Never edit generated files:** `convex/_generated/*`, `src/routeTree.gen.ts`.
- **Styling: no CSS in .tsx files.** Every component has a sibling `.css` file (`button.tsx` + `button.css`) that it imports. Never write Tailwind classes, inline style objects, CSS-in-JS or `cva` class maps. Variants use `data-*` attributes. Use only tokens from `src/styles/tokens.css`. Follow CODE_STYLE.md §5a. Don't install Tailwind.
- **shadcn/ui:** Get component source via the CLI or the shadcn docs, then **immediately convert** them to a plain `.css` file per CODE_STYLE.md §5a before using them.
- **Routing:** Use TanStack Router file-based routes in `src/routes/`. Validate search params with Zod via `validateSearch`.
- **TanStack Router, not React Router.** Don't import `react-router` or `react-router-dom`.
- **This is a Vite SPA, not Next.js.** No `"use client"`, server components, `next/*` imports or API routes.
- **iOS PWA:** Don't use magic links or flows that leave the app. Respect safe-area insets. Inputs use a 16px+ font size.
- **Color matching** and hue classification stay client-side and pure (`src/features/matching`).
- **Collection writes** always go through the outbox hook (`useSetPaintFlags` in `src/features/collection`), never call `userPaints.set` directly from components.
- **Search** goes through the single query parser (`src/features/catalog/parse-query.ts`). Don't add separate search code paths.
- **Auth:** use Clerk components and hooks (`<SignIn>`, `useAuth`) with `ConvexProviderWithClerk`. Don't build custom auth forms or magic-link flows.

---

## 4. Planning

Before implementing a non-trivial task:
1. Inspect relevant documentation
2. Inspect relevant code
3. Identify affected files
4. Identify dependencies
5. Identify catalog, Convex schema or function changes
6. Identify tests required
7. Present a concise implementation plan and **wait for approval**

---

## 5. Implementation

During implementation:
- Make focused, small changes (one feature or fix per task)
- Reuse established patterns
- Preserve existing behavior
- Avoid unnecessary rewrites
- Keep code maintainable

---

## 6. Validation

After implementation, run:
1. `npm test`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run catalog:validate` (if catalog or catalog code changed)
5. `npm run build`
6. Review changed files (`git diff`)
7. Check for unintended changes

For UI or PWA changes, describe what to verify manually on a phone.

---

## 7. Documentation

Update documentation when implementation changes:
- Product behavior → PRD.md / UX_FLOWS.md
- Architecture → ARCHITECTURE.md (+ DECISIONS.md for real decisions)
- Catalog or Convex schema → DATABASE.md
- Convex functions → API.md
- Security rules → SECURITY.md
- Coding conventions → CODE_STYLE.md
- Any change to how a feature works in code → its doc in `docs/features/`
- Env vars → ENVIRONMENT.md

---

## 8. Conflict Handling

If requirements conflict, or something is marked TBD:
Don't guess.
Identify the conflict and ask for clarification.

---

## 9. Completion Criteria

A task is complete only when:
- Requirements are satisfied
- Tests pass
- Build succeeds
- No unintended files changed
- Security rules are respected
- Documentation is updated when necessary

End every task with a summary: what changed, files changed, tests run, validation results, remaining issues, and docs updated or needing updates.
