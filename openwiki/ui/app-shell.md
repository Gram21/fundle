---
type: ui-shell
title: App Shell — Layout, Tabs, Header and Format Helpers
description: main.tsx bootstraps the AppProvider; App.tsx renders the header (portfolio selector, stats, Update, Backup, Help), the tab bar, and the active view; format.ts provides Intl-based money/pct/date/signClass helpers.
tags: [ui, app-shell, layout, format]
---

# App Shell (`src/main.tsx`, `src/App.tsx`, `src/ui/format.ts`)

The app shell wires the [store](../app/store.md) to the React tree and renders the persistent chrome (header, tabs) around the three views.

## Bootstrap (`src/main.tsx`)

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
```

`StrictMode` double-invokes effects in dev, which is why the store's `refresh` has a `refreshingRef` concurrency guard. `AppProvider` wraps the whole tree so `useApp()` is always available.

## `App.tsx`

Holds the top-level UI state: `tab` (`'overview' | 'performance' | 'settings'`), `viewAll` (the "All portfolios" Performance flag), and `errorDismissed`. It computes `portfolioSnapshot(portfolio, quotes)` for the header stats and renders the active view.

### Header

<!-- openwiki: broken internal link [#logo] heading anchor "logo" does not exist in /openwiki/ui/app-shell.md. Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [forms.md#portfoliodialogs] heading anchor "portfoliodialogs" does not exist in "forms.md". Fix the href or restore the target, then delete this comment. -->
- **Left**: [Logo](#logo), the app name, a `<select>` for the active portfolio with an "All portfolios" option (sets `viewAll`; selecting a real portfolio calls `actions.setActivePortfolio`), `+` (add portfolio) and `🗑` (delete active portfolio, disabled when only one remains) buttons wired to [PortfolioDialogs](forms.md#portfoliodialogs).
<!-- openwiki: broken internal link [forms.md#backupmenu] heading anchor "backupmenu" does not exist in "forms.md". Fix the href or restore the target, then delete this comment. -->
- **Right**: header stats (Value / Day % / Total %), an "Updated {time}" stamp, the **Update** button (`actions.refresh()`, disabled while `status === 'loading'`), [BackupMenu](forms.md#backupmenu), and the **?** Help button.

> **Known limitation**: in the "All portfolios" view, the header stats still show only the *active* portfolio, not a cross-portfolio sum (the code comments this as a deliberate non-one-liner). The PerformanceView does aggregate across portfolios; the header does not.

### Error banner and Help dialog

<!-- openwiki: broken internal link [#helpdialog] heading anchor "helpdialog" does not exist in /openwiki/ui/app-shell.md. Fix the href or restore the target, then delete this comment. -->
A `role="alert"` banner shows `state.error` (resetting `errorDismissed` whenever `error` changes). The Help `<dialog>` opens via `helpDialogRef.current?.showModal()` and renders [HelpDialog](#helpdialog).

### Tab bar and main

Three tabs switch `tab`; `main` renders `<Overview />`, `<PerformanceView viewAll={viewAll} />`, or `<SettingsView />`.

## `format.ts` — formatting helpers

Intl-only, no dependencies:

- `money(n, currency)` — `Intl.NumberFormat('de-DE', { style: 'currency', currency })`. German locale formatting (e.g. `1.234,56 €`).
- `pct(n)` — always-signed percentage (`+1.24 %` / `-1.24 %`) via `signDisplay: 'exceptZero'`, en-US locale, 2 fraction digits.
- `signClass(n)` — returns `'up'` / `'down'` / `'flat'` for CSS coloring (positive/negative/zero).
- `date(iso)` — short German date `'DD.MM.YY'` via `Intl.DateTimeFormat('de-DE')`.

These helpers are used throughout the views; `money` takes the **asset's** currency (not `baseCurrency`) for per-asset figures, and `baseCurrency` for portfolio totals on the PerformanceView value axis.

## `HelpDialog.tsx`

Static content rendered inside the Help `<dialog>`: an "About Fundle" summary, how to add assets, how prices refresh, an explanation of the two performance lines (Value vs time-weighted Gain/loss %), and a Backup reminder. Mirrors the README's user-facing sections.

## `Logo.tsx`

An inlined SVG mark (a blue rounded square with a stylized bar chart), same as `public/favicon.svg`, inlined so the header needs no extra request. Takes an optional `size` (default 28).

## Focused tests

No dedicated UI tests; the shell is thin glue over the tested [store](../app/store.md) and [domain](../domain/portfolio.md). The `format` helpers are pure functions exercised indirectly by the domain tests' expected values.
