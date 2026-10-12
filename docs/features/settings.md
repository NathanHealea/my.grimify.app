# Settings

> Covers the `/settings` screen.
> User journey: [UX_FLOWS.md Flow 9](../UX_FLOWS.md).

## TL;DR

- **Three sections**: **Account**, **Appearance** and **About**.
- **Account** is `<AccountSection>` from the [auth feature](auth-account.md): sign in, sign out and delete account.
- **Appearance** is read-only: "Theme: Follows your system". **Dark mode is a NEXT item** (ROADMAP).
- **About** shows **`Version {__APP_VERSION__}`**, the color-accuracy note and the trademark note.
- The PaintPad credit is **plain text, not a link**, because an outside link would take an installed iOS app out of itself.

## Where the code lives

| Path | Role |
|---|---|
| `src/routes/settings.tsx` | Route `/settings`, title "Settings" |
| `src/features/settings/settings-screen.tsx` | `<SettingsScreen>` |
| `src/features/auth/account-section.tsx` | Account section |
| `vite.config.ts` (`define`) | `__APP_VERSION__` from `package.json` `version` |

## App version

`__APP_VERSION__` is read from `package.json` at build time. **`wi stage` bumps `package.json`**, so the version shown always matches the release.

## Relations to other features

- **Auth** ([auth-account.md](auth-account.md)): all account actions.
- **App shell** ([app-shell-ui.md](app-shell-ui.md)): the Settings tab in the nav bar.
