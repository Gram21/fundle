---
type: ui-shell
title: App Shell — Layout, Tabs, Header and Format Helpers
description: main.tsx bootstraps the AppProvider; App.tsx renders the header (PortfolioMenu, refresh icon, Backup, Settings, Help), the tab bar, and the active view; format.ts provides Intl-based money/pct/date/signClass helpers.
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

Holds the top-level UI state: `tab` (`'overview' | 'performance'`), `viewAll` (the "All portfolios" flag passed to `PerformanceView`), and `errorDismissed`. Settings is a modal `<dialog>`, not a tab. It renders the active view.

### Header

<!-- openwiki: broken internal link [forms.md#portfoliomenu] heading anchor "portfoliomenu" does not exist in "forms.md". Fix the href or restore the target, then delete this comment. -->
<!-- openwiki: broken internal link [forms.md#portfoliodialogs] heading anchor "portfoliodialogs" does not exist in "forms.md". Fix the href or restore the target, then delete this comment. -->
- **Left**: [Logo](#logotsx), the app name, and the [PortfolioMenu](forms.md#portfoliomenu) dropdown (which embeds [PortfolioDialogs](forms.md#portfoliodialogs) for add/remove).
<!-- openwiki: broken internal link [forms.md#backupmenu] heading anchor "backupmenu" does not exist in "forms.md". Fix the href or restore the target, then delete this comment. -->
- **Right**: an "Updated {time}" stamp, a **↻** refresh icon button (`actions.refresh()`, disabled and spinning while `status === 'loading'`), [BackupMenu](forms.md#backupmenu), a **⚙** Settings button (opens the settings dialog), and the **?** Help button.

The portfolio selector, add, and delete affordances have moved into `PortfolioMenu`; the header stats now live in [Overview](overview.md), so `App.tsx` no longer computes a `portfolioSnapshot` itself.

### Error banner

A `role="alert"` banner shows `state.error` (resetting `errorDismissed` whenever `error` changes). A dismiss button sets `errorDismissed`.

### Tab bar and main

Two tabs switch `tab`; `main` renders `<Overview />` or `<PerformanceView viewAll={viewAll} />`. `PerformanceView` receives `viewAll` so it can aggregate across all portfolios when "All portfolios" is selected in the menu.

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
