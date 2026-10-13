# App Shell, Routing and Shared UI

> Covers the root layout, routes, the nav bar and header, page titles, toasts and shared components.
> Visual rules: [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md). Styling rules: [CODE_STYLE.md §5a](../CODE_STYLE.md). Rationale: [DECISIONS 012, 014, 029, 039, 040, 045, 046](../DECISIONS.md).

## TL;DR

- **TanStack Router, file-based**, in `src/routes/`. **Never edit `src/routeTree.gen.ts`.**
- Every route renders inside **`<AppShell>`**: a **glass nav bar** (bottom on phones, top from tablet up), a header with **back button, small title, Offline pill and sync count**, and the **install banner**.
- Routes declare **`staticData.title`** (large page title) and **`staticData.back`** (header back link).
- **No CSS in `.tsx` files.** Each component imports a sibling `.css` file. Variants use **`data-*` attributes**. The only `style` allowed is a CSS custom property, such as `--swatch-color`.
- Feedback goes through **one toast at a time** (`useToast()`), which hides after **6 s**.

## Routes

| Path | File | staticData | Screen |
|---|---|---|---|
| `/` | `routes/index.tsx` | n/a | **Redirects** to `/paints` (`replace`) |
| `/paints/` | `routes/paints/index.tsx` | `title: "Paints"` | [Search and filters](catalog/search-and-filters.md) |
| `/paints/$paintId` | `routes/paints/$paintId.tsx` | `back: { to: "/paints", label: "Paints" }` | [Paint detail](catalog/paint-detail.md) |
| `/my-paints` | `routes/my-paints.tsx` | `title: "My Paints"` | [My Paints](collection/toggles-and-my-paints.md) |
| `/palettes/` | `routes/palettes/index.tsx` | `title: "Palettes"` | [Palettes](palettes.md) |
| `/palettes/$paletteId` | `routes/palettes/$paletteId.tsx` | `back: { to: "/palettes", label: "Palettes" }` | [Palettes](palettes.md) |
| `/settings` | `routes/settings.tsx` | `title: "Settings"` | [Settings](settings.md) |

`src/router.ts` registers the `StaticDataRouteOption` types: `title?` and `back?`. Search params are **validated with Zod** through `validateSearch`.

## Provider order

```text
<StrictMode>
  <ClerkProvider>
    <ConvexProviderWithClerk>
      <AppProviders>            ToastProvider → CollectionProvider → SignInProvider (+ StoreUser)
        <RouterProvider>        __root → <AppShell> → <Outlet>
  <ServiceWorkerUpdates>
```

## App shell

`src/components/app-shell.tsx`:

- **Tabs**: Paints, My Paints, Palettes and Settings, with lucide icons. Under 360px the icons hide (DECISIONS 050).
- **Back button**: if the previous history entry is in the app, it calls `history.back()`, which **keeps the list's search and filters**. Otherwise it links to `to`. It exists because **iOS standalone has no browser back button**.
- **Collapsing title**: an `IntersectionObserver` watches the page's `<h1>`. When it slides under the header, `data-scrolled` shows the small title (DECISIONS 040, 046).
- **Status**: "Offline" and "n change(s) waiting to sync". Both are `role="status"`.

## Shared components

| Component | File | Notes |
|---|---|---|
| `<PageTitle>` | `components/page-title.tsx` | The screen's **one `<h1>`**. Sets `document.title` to "{title} · Grimify" (WCAG 2.4.2). `documentTitle` overrides the tab text |
| `<PaintRow>` | `components/paint-row.tsx` | Swatch, name, "brand · line · type", optional `note`, match label, **Discontinued** badge. **`actions` sit outside the link**, so a toggle tap never opens the paint. With `selection` (Select mode) the row is a label for a "Select <name>" checkbox instead, with no link or actions |
| `<PaintSwatch>` | `components/paint-swatch.tsx` | **Decorative** (`aria-hidden`). Sizes `md`, `lg`, `hero`. A type icon marks metallic, wash, shade, ink, contrast and speedpaint. `data-tone` picks the ink color at luminance **0.18** |
| `<HueDots>` | `components/hue-dots.tsx` | 13 hue buttons. Layout `scroll` (Paints tab) or `wrap` (sheet). Pass `pressed` to make them toggles with `aria-pressed` |
| `<SearchChip>` | `components/search-chip.tsx` | `variant="remove"` (✕, "Remove {label}") or `"suggest"` |
| `<Button>` | `components/ui/button.tsx` | `variant`: default, secondary, outline, ghost, destructive. `size`: sm, md, lg, icon. **`sm` is below the 44px touch target.** Supports `asChild` |
| `<Input>` | `components/ui/input.tsx` | Text input |
| `<Sheet>` … | `components/ui/sheet.tsx` | Radix Dialog as a bottom sheet (DECISIONS 023): `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose` |
| `<Toast>` | `components/ui/toast.tsx` | **Always-mounted** `aria-live="polite"` region, so each message is announced |

`useToast()` comes from `src/features/feedback/toast-provider.tsx`. A new message **replaces** the current one (DECISIONS 029).

## Styling

- Tokens are defined in `src/styles/tokens.css`. Base styles are in `src/styles/base.css`, and `src/styles/index.css` imports both.
- shadcn components are **converted to plain CSS** before use. **Don't install Tailwind.**
- Sheets opened from state, not from a `SheetTrigger`, must **return focus by hand** in `onCloseAutoFocus`. See `account-section.tsx` and `delete-account.tsx`.

## Add a screen

1. Add a file in `src/routes/` with `createFileRoute`.
2. Set `staticData.title`, or `staticData.back` for a detail screen.
3. Validate search params with a Zod `validateSearch`.
4. Put the screen component in `src/features/<feature>/`, with a sibling `.css` file.
5. To add a nav tab, add it to `TABS` in `app-shell.tsx`.

## Relations to other features

- **Collection** ([sync-and-outbox.md](collection/sync-and-outbox.md)): the shell reads `pending`.
- **PWA** ([pwa.md](pwa.md)): the shell renders `<InstallBanner>` and reads `useOnlineStatus()`.
- **Catalog and matching**: `<PaintRow>`, `<PaintSwatch>` and `<HueDots>` import catalog types and the matching `MatchLabel`.
