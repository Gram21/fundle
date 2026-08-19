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

- **Search row**: free-text query (ISIN, WKN, or symbol) calling `actions.search(query)`; renders a `<ul>` of `SearchResult`s. Clicking a result populates `symbol`, `name`, `currency`, and `isin`. The store's `search` runs the primary provider, [Börse Frankfurt](../data/boerse-frankfurt.md), and [OpenFIGI](../data/openfigi.md) in parallel, merging BF/OpenFIGI-only ISIN hits (deduplicated by ISIN and symbol), so an ISIN search covers instruments the primary misses.
- **Form grid**: Symbol (required, placeholder `EUNL.DE`, labeled to clarify it wants a ticker not a website), Name (required), Currency (required, default `EUR`), ISIN (optional), WKN (optional).
- **Buy order rows**: an array of `{ date, quantity, price, fee }` rows, defaulting to one row with today's date. "Add another buy order" appends; "Remove" drops a row (min one). Date is `<input type="date">`, quantity/price/fee are `<input type="number" step="any" min="0">`.

### Add mode

Validation: `isValid = symbol && name && currency && at least one row with quantity > 0 && price > 0`. On submit, calls `actions.addAsset({ symbol, name, currency, isin?, wkn?, lots: validRows.map(...) })`, which dispatches `ADD_ASSET` and triggers a [refresh](../app/store.md#the-refresh-flow). The form resets and closes on success; errors set `submitError`.

### Edit mode (`asset` prop)

When an existing `Asset` is passed in (`isEditing`), the same form is reused to **edit the asset's full entry** — symbol, name, currency, ISIN, WKN — not just its name. The lot rows are hidden in edit mode (lots are managed separately in [AssetDetail](overview.md#assetdetail)), and validation relaxes to `symbol && name && currency` (no lot required). On submit it calls `actions.updateAsset(asset.id, { symbol, name, currency, isin, wkn })`, which dispatches `UPDATE_ASSET` and triggers a [refresh](../app/store.md#the-refresh-flow) so a changed symbol is priced immediately. This is the "Edit asset" button opened from the [AssetDetail](overview.md#assetdetail) panel.

## `SettingsView.tsx`

Rendered inside the **⚙** settings dialog (opened from the header, no longer a tab). Renders from the `PROVIDERS` [registry](../data/price-provider.md#factory-and-registry-srcdataindexts):

- **Provider `<select>`**: `actions.updateSettings({ providerId })` — Yahoo, Twelve Data, [EODHD](../data/eodhd.md) (paid), [Alpha Vantage](../data/alphavantage.md) (free, rate-capped).
- **API key** (`type="password"`): shown only when `provider.needsApiKey`; updates `settings.apiKeys[provider.id]`.
- **CORS proxy URL**: shown only when `provider.needsProxy` (Yahoo, EODHD); updates `settings.proxyUrl`.
- **Refresh interval** (minutes, `min=1 max=120`): `actions.updateSettings({ refreshMinutes })`.
- **Base currency**: `actions.updateSettings({ baseCurrency })`.

Provider-specific hints: the proxy hint names Yahoo or EODHD depending on the selection; an EODHD hint notes its paid, ISIN-native breadth (mutual funds/ETFs across US, Europe, Ireland/Luxembourg); an Alpha Vantage hint notes the 25 requests/day cap, that auto-refresh is off while it is selected, and that free-plan history is limited to ~100 trading days. A general hint notes that ISIN searches also automatically check [Börse Frankfurt](../data/boerse-frankfurt.md) (live quotes, no key). Changing `providerId`, `proxyUrl`, or `apiKeys` triggers a refresh (per [store wiring](../app/store.md#appactions-the-ui-surface)); changing `refreshMinutes` or `baseCurrency` does not.

### OpenFIGI lookup section

A separate "ISIN lookup (OpenFIGI)" section explains that ISIN searches also automatically try [OpenFIGI](../data/openfigi.md) (the most complete free ISIN resolver), no key required, and that it only maps ISIN → ticker (pricing is via Yahoo afterwards). It notes the POST-only mapping endpoint realistically needs a self-hosted proxy (see [worker/DEPLOY.md](../operations/cors-proxy.md)), and exposes an optional **OpenFIGI API key** input updating `settings.apiKeys.openfigi` (only raises the rate limit).

## `BackupMenu.tsx`

A header dropdown (`<details>`, so no click-outside plumbing) with export/import:

- **Export**: `actions.exportJson()` → `Blob` → `fundle-{YYYY-MM-DD}.json` download. Closes the menu.
- **Import**: `<input type="file" accept="application/json">` → `file.text()` → `actions.importJson(text)`. Shows success or error (the error comes from [parseImport](../app/persistence.md#parseimport--the-trust-boundary) validation). Importing replaces all portfolios and settings.
- A hint reminds the user that data lives only in this browser's localStorage and the export includes fetched prices (so importing elsewhere shows the same history without refetching).

## `PortfolioMenu.tsx`

A single header `<details>` dropdown (`src/ui/PortfolioMenu.tsx`) that replaces the former plain `<select>` plus separate add/delete buttons. It receives `viewAll`, `onSelectPortfolio`, and `onSelectAll` from `App.tsx` and renders:

- An **All portfolios** entry at the top (pinned and visually set apart), which sets `viewAll=true`.
<!-- openwiki: broken internal link [#portfoliodialogs] heading anchor "portfoliodialogs" does not exist in /openwiki/ui/forms.md. Fix the href or restore the target, then delete this comment. -->
- A divider, then one row per portfolio with the portfolio name (active highlighted), a **✎** rename button, and a **×** remove button (disabled when only one portfolio remains). Selecting a portfolio calls `onSelectPortfolio(id)` (which clears `viewAll` and sets the active id); the rename/remove buttons open the [PortfolioDialogs](#portfoliodialogs) imperatively.
- A divider, then a **+ Add portfolio** entry.

<!-- openwiki: broken internal link [#portfoliodialogs] heading anchor "portfoliodialogs" does not exist in /openwiki/ui/forms.md. Fix the href or restore the target, then delete this comment. -->
Add/rename/remove all open the imperative [PortfolioDialogs](#portfoliodialogs) via a forwarded ref (`PortfolioDialogsHandle`).

## `PortfolioDialogs.tsx`

<!-- openwiki: broken internal link [#portfoliomenu] heading anchor "portfoliomenu" does not exist in /openwiki/ui/forms.md. Fix the href or restore the target, then delete this comment. -->
A `forwardRef` component exposing `PortfolioDialogsHandle` (`{ openAdd(), openRemove(id), openRename(id) }`) so the [PortfolioMenu](#portfoliomenu) can open the dialogs imperatively. The docstring explains these replace `window.prompt()`/`confirm()` which throw or no-op in sandboxed iframes / some embedded browsers.

- **Add dialog**: a name input (autofocus, required) → `actions.addPortfolio(trimmed)`.
- **Rename dialog** (`openRename`): a name input pre-filled with the current portfolio name → `actions.renamePortfolio(id, trimmed)`.
- **Remove dialog** (`openRemove`): a confirmation showing the named portfolio → `actions.removePortfolio(id)`. Delete is final (the store falls back to `portfolios[0]` as active).

## Focused tests

No dedicated UI tests; these forms are thin adapters over the tested [store actions](../app/store.md) and [persistence](../app/persistence.md) validation. The import error paths are covered by `src/app/persistence.test.ts`.
