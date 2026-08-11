---
type: ui-forms
title: Forms and Dialogs — AddAssetForm, SettingsView, BackupMenu, PortfolioDialogs
description: The modal forms for adding assets with provider search and multi-lot entry, the settings form (provider/API key/proxy/refresh/currency), the export/import backup dropdown, and the portfolio add/delete confirmation dialogs.
tags: [ui, forms, settings, backup, dialogs]
---

# Forms and Dialogs

The modal forms and the settings view. All consume [store actions](../app/store.md#appactions-the-ui-surface) and local React state.

## `AddAssetForm.tsx`

A modal form (rendered inside a `<dialog>` by [Overview](overview.md)) for adding a new asset with one or more buy orders. Fields:

- **Search row**: free-text query (ISIN, WKN, or symbol) calling `actions.search(query)`; renders a `<ul>` of `SearchResult`s. Clicking a result populates `symbol`, `name`, `currency`, and `isin`. A hint explains that German WKNs often don't resolve and suggests typing the symbol directly (e.g. `EUNL.DE`).
- **Form grid**: Symbol (required, placeholder `EUNL.DE`), Name (required), Currency (required, default `EUR`), ISIN (optional), WKN (optional).
- **Buy order rows**: an array of `{ date, quantity, price, fee }` rows, defaulting to one row with today's date. "Add another buy order" appends; "Remove" drops a row (min one). Date is `<input type="date">`, quantity/price/fee are `<input type="number" step="any" min="0">`.

Validation: `isValid = symbol && name && currency && at least one row with quantity > 0 && price > 0`. On submit, calls `actions.addAsset({ symbol, name, currency, isin?, wkn?, lots: validRows.map(...) })`, which dispatches `ADD_ASSET` and triggers a [refresh](../app/store.md#the-refresh-flow). The form resets and closes on success; errors set `submitError`.

## `SettingsView.tsx`

The Settings tab. Renders from the `PROVIDERS` [registry](../data/price-provider.md#factory-and-registry-srcdataindexts):

- **Provider `<select>`**: `actions.updateSettings({ providerId })`.
- **API key** (`type="password"`): shown only when `provider.needsApiKey`; updates `settings.apiKeys[provider.id]`.
- **CORS proxy URL**: shown only when `provider.needsProxy`; updates `settings.proxyUrl`.
- **Refresh interval** (minutes, `min=1 max=120`): `actions.updateSettings({ refreshMinutes })`.
- **Base currency**: `actions.updateSettings({ baseCurrency })`.

A hint under the proxy field explains the Yahoo CORS situation. Changing `providerId`, `proxyUrl`, or `apiKeys` triggers a refresh (per [store wiring](../app/store.md#appactions-the-ui-surface)); changing `refreshMinutes` or `baseCurrency` does not.

## `BackupMenu.tsx`

A header dropdown (`<details>`, so no click-outside plumbing) with export/import:

- **Export**: `actions.exportJson()` → `Blob` → `fundle-{YYYY-MM-DD}.json` download. Closes the menu.
- **Import**: `<input type="file" accept="application/json">` → `file.text()` → `actions.importJson(text)`. Shows success or error (the error comes from [parseImport](../app/persistence.md#parseimport--the-trust-boundary) validation). Importing replaces all portfolios and settings.
- A hint reminds the user that data lives only in this browser's localStorage and the export includes fetched prices (so importing elsewhere shows the same history without refetching).

## `PortfolioDialogs.tsx`

A `forwardRef` component exposing `PortfolioDialogsHandle` (`{ openAdd(), openRemove() }`) so the [App shell](app-shell.md) header buttons can open the dialogs imperatively. The docstring explains these replace `window.prompt()`/`confirm()` which throw or no-op in sandboxed iframes / some embedded browsers.

- **Add dialog**: a name input (autofocus, required) → `actions.addPortfolio(trimmed)`.
- **Remove dialog**: a confirmation showing the active portfolio's name → `actions.removePortfolio(portfolio.id)`. Delete is final (the store falls back to `portfolios[0]` as active).

## Focused tests

No dedicated UI tests; these forms are thin adapters over the tested [store actions](../app/store.md) and [persistence](../app/persistence.md) validation. The import error paths are covered by `src/app/persistence.test.ts`.
