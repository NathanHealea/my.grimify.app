# Code Style & Conventions

> Status: **Draft v0.2**

## 1. General Principles

- Prefer readable code
- Keep functions focused
- Avoid unnecessary abstractions
- Reuse existing components and utilities
- Prefer consistency over novelty
- TypeScript `strict: true`; no `any` (use `unknown` and narrow it)
- Pure logic (search, filtering, color math) lives outside React components so it can be unit-tested

---

## 2. Naming

| Thing | Convention | Example |
|---|---|---|
| React components | PascalCase | `PaintRow`, `PaintSwatch` |
| Hooks | camelCase with `use` prefix | `useCatalog`, `useMyPaints` |
| Functions | camelCase, verb first | `findEquivalents`, `parseHex` |
| Variables | camelCase | `selectedBrand` |
| Constants | UPPER_SNAKE_CASE | `DELTA_E_CLOSE = 5` |
| Types / interfaces | PascalCase, no `I` prefix | `Paint`, `PaintType` |
| Files | kebab-case | `paint-row.tsx`, `find-equivalents.ts` |
| Route files | TanStack Router conventions | `src/routes/paints/$paintId.tsx` |
| Convex tables & fields | camelCase | `userPaints.paintId` |
| Convex functions | `module.verb` or `module.verbNoun` | `userPaints.set`, `users.deleteAccount` |
| Catalog IDs | kebab-case slug | `citadel-base-mephiston-red` |

---

## 3. Folder Structure

Follow ARCHITECTURE.md §7.
- Feature code goes in `src/features/<feature>/` (components, hooks and logic for that feature)
- Shared, generic UI goes in `src/components/`
- shadcn-based primitives live in `src/components/ui/` as `<name>.tsx` + `<name>.css` pairs (see §5a, "Adding a new shadcn component")
- Never edit `convex/_generated/` or `src/routeTree.gen.ts`

---

## 4. Imports

- Use the `@/` alias for `src/` (e.g., `import { Button } from "@/components/ui/button"`)
- Order: external packages → `@/` imports → relative imports (enforced by `eslint-plugin-simple-import-sort`)
- Use `import type` for type-only imports
- No barrel `index.ts` files that re-export everything (they slow builds and cause cycles)

---

## 5. Components

Components should:
- Have a single responsibility
- Be function components with named exports (`export function PaintRow…`)
- Type props with an explicit `Props` type
- **No styling in .tsx files** (see §5a)
- Keep data fetching in hooks, not components
- Be under ~150 lines; split them if they grow larger

---

## 5a. Styling (CSS files, not TSX)

Rules:
- Every component that needs styles has a **sibling CSS file with the same name**: `button.tsx` + `button.css`, `paint-row.tsx` + `paint-row.css`
- The component imports its own CSS file: `import "./button.css";`
- **Not allowed in .tsx:** Tailwind classes, inline `style={{…}}` objects with style rules, CSS-in-JS (styled-components, Emotion, `css` props), `cva` variant class maps
- **One exception:** passing a *data value* as a CSS custom property, e.g., a paint's color: `style={{ "--swatch-color": paint.hex }}`. The CSS file decides how it's used.
- Variants, sizes and states are expressed with **data attributes**, styled in CSS:
  `<button className="ui-button" data-variant="destructive" data-size="sm">`
- Class names: one root class per component, prefixed to avoid collisions in global CSS
  - UI primitives: `ui-<name>` (e.g., `ui-button`, `ui-card`)
  - App components: `<component-name>` (e.g., `paint-row`, `paint-swatch`)
  - Child parts: BEM-style `ui-card__header`, `paint-row__name`
- Use only design tokens from `src/styles/tokens.css` (`var(--color-primary)`, `var(--space-4)`), never raw hex, px spacing or font sizes, except inside `tokens.css`
- Use native CSS nesting, `:focus-visible`, `@media` queries with the breakpoint values in DESIGN_SYSTEM.md
- No `!important` (except in the reduced-motion reset)

Example (abridged; the real files are `src/components/ui/button.tsx` and `button.css`):
```tsx
// src/components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import "./button.css";

type Props = React.ComponentProps<"button"> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  asChild?: boolean;
};

export function Button({ variant = "default", size = "md", asChild, className, ...props }: Props) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={className ? `ui-button ${className}` : "ui-button"}
      data-variant={variant}
      data-size={size}
      {...props}
    />
  );
}
```

```css
/* src/components/ui/button.css */
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: 0 var(--space-4);
  border: var(--border-width) solid transparent;
  border-radius: var(--radius-md);
  font: inherit;
  font-weight: var(--weight-semibold);
  background: var(--color-primary);
  color: var(--color-primary-foreground);
  cursor: pointer;

  &:disabled { opacity: var(--opacity-disabled); cursor: not-allowed; }
  &:hover:not(:disabled) { background: var(--color-primary-hover); }

  &[data-variant="secondary"]   { background: var(--color-secondary); color: var(--color-text); }
  &[data-variant="outline"]     { background: transparent; border-color: var(--color-border); color: var(--color-text); }
  &[data-variant="ghost"]       { background: transparent; color: var(--color-text); }
  &[data-variant="destructive"] { background: var(--color-error); color: var(--color-error-foreground); }

  &[data-size="sm"]   { min-height: var(--touch-target-sm); padding: 0 var(--space-3); font-size: var(--text-small); }
  &[data-size="lg"]   { min-height: calc(var(--touch-target) + var(--space-2)); padding: 0 var(--space-6); }
  &[data-size="icon"] { width: var(--touch-target); padding: 0; }
}
```
Focus rings come from the global `:focus-visible` rule in `base.css`; components only override it when needed. `sm` (36px) is for secondary controls only (DESIGN_SYSTEM §8).

### Adding a new shadcn component
1. Get the component source: `npx shadcn@latest add <component>` if the CLI works without Tailwind in the project. Otherwise copy the source from the shadcn/ui docs, or build it directly on the matching Radix primitive, using shadcn as the reference.
2. **Convert it immediately:** move every class into `<component>.css` using tokens; replace `cva` variants with `data-*` attributes; remove `cn()` / Tailwind imports
3. Keep the Radix behavior and accessibility attributes unchanged
4. Commit the converted version only

---

## 6. Functions

Functions should:
- Do one logical thing
- Have clear names
- Be pure where possible (especially in `features/matching` and `features/catalog`)
- Use early returns over nested conditionals

---

## 7. Error Handling

Use:
- `ConvexError("<CODE>")` in Convex functions, with the code as a plain string (see API.md §3)
- On the client, handle each failure where it happens: `console.error` the cause, then show fixed, plain text written for that action (e.g., "Couldn't sign out. Check your connection.")
- `useToast()` (the in-app toast, DECISIONS 029) for a failed action that has no screen of its own: sign-out, a dropped outbox change
- Inline text in a `role="alert"` or `role="status"` element when the failure belongs to a screen or sheet: the catalog gate's offline message, the delete-account sheet
- Check `error.data` against known codes only where the code changes what happens (the outbox drops validation errors, `src/features/collection/outbox.ts`)

Do not:
- Swallow errors silently. A `catch {}` needs a comment saying why the failure is safe to ignore (e.g., optional storage in `src/features/pwa/install-hint.ts`)
- Show raw error messages or stack traces to users
- Use `alert()`

---

## 8. Comments

Comments should explain:
- Why something exists
- Important trade-offs (e.g., why Delta-E thresholds are set where they are)
- Non-obvious behavior (iOS PWA workarounds especially)

Avoid comments that simply repeat the code.

---

## 9. Logging

Use: `console.warn` / `console.error` only. No `console.log` in committed code (lint rule).
Rules:
- Never log user emails, tokens or codes
- Convex: log errors with a code and context, without personal data

---

## 10. Formatting & Tooling

Formatter: Prettier (default config, `printWidth: 100`) for TS and CSS
CSS linter: Stylelint (`stylelint-config-standard`) with a rule that disallows hex colors outside `tokens.css`
TSX lint rule: `local/style-prop-custom-properties-only` (`lint/style-prop-custom-properties-only.js`) allows `style` only as an object literal of `--custom-property` keys
Stylelint: hex colors, named colors, color functions and `px` lengths are rejected outside `tokens.css` (`px` stays allowed in media queries); class names are kebab-case with optional BEM `__element`
Linter: ESLint (typescript-eslint type-checked, react-hooks, `@tanstack/eslint-plugin-router`, simple-import-sort, `@convex-dev/eslint-plugin` if available); `no-restricted-imports` blocks Tailwind, cva, clsx, tailwind-merge, CSS-in-JS, React Router and Next
Type Checking: `tsc -b` (strict)
Pre-commit (optional): lint-staged + simple-git-hooks

---

## 11. Do

- Reuse existing patterns
- Keep changes focused
- Follow project conventions
- Remove dead code
- Validate URL search params with Zod in the route definition
- Use Convex indexes (`withIndex`) for every query
- Give each new component its own sibling `.css` file

---

## 12. Don't

- Create duplicate utilities
- Introduce unnecessary dependencies (ask first; check bundle size)
- Ignore existing architecture
- Change unrelated files
- Import catalog JSON directly in components
- Accept `userId` as a Convex function argument
- Put Tailwind classes, inline styles, CSS-in-JS or `cva` class maps in .tsx files
- Install Tailwind or a CSS-in-JS library
- Use `useEffect` for derived state (compute it, or use `useMemo`)
