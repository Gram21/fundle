---
type: ui-view
title: Overview Tab — Asset Table, Sold Table, and Lot/Sale Editor
description: Overview renders the portfolio snapshot as a held-assets table and a sold-assets table, with expandable per-asset AssetDetail (lot list, add-lot form, sell form, remove asset), plus the Add-asset dialog trigger.
tags: [ui, overview, table, lots, sale]
---

# Overview Tab (`src/ui/Overview.tsx`)

The default tab. Renders the active portfolio's [snapshot](../domain/portfolio.md) as a held-assets table and a separate sold-assets table, with expandable rows revealing each asset's lots and an inline lot/sale editor. Hosts the "Add asset" dialog.

## Header stats

A `.portfolio-summary` row of Value / Day / Total header stats, computed from `portfolioSnapshot(portfolio, quotes)`. The display currency is `snapshot.assets[0]?.asset.currency ?? snapshot.soldAssets[0]?.asset.currency ?? 'EUR'` (a pragmatic pick of the first asset's currency — there is no FX conversion).

## Empty states

- No assets at all (held or sold): "No assets yet — add one below to get started."
- No held assets but some sold: "No held assets — everything below has been sold."

## Held-assets table

`<table className="asset-table">` rendered when `hasHeld`: columns Name, Quantity, Avg buy price, Price, Day %, Value, Total +/-. Each row is a `<button className="row-expand">` toggling `openAssetId`; the asset's `symbol` and optional `isin` render as a sub-line. A footer Total row sums Value, Day %, and Total +/- from the `PortfolioSnapshot`.

Rows are sourced from `portfolioSnapshot(portfolio, quotes).assets`, which is already sorted by `marketValue` descending. The `avgBuyPrice` shown is `row.costBasis / row.quantity` (guarded to `0` when quantity is `0`). Numbers use the **asset's** currency via `money()`.

## Sold-assets table

`<table className="asset-table">` rendered when `hasSold` (`snapshot.soldAssets`), with columns Name, Sold date, Quantity, Avg buy price, Sale price, Proceeds, Realized +/-, and a Remove button. Each row uses `asset.sale!` for the sale details. The realized P/L (`realizedChangeAbs`/`realizedChangePct`) comes from `soldAssetSnapshot`. A Remove button calls `actions.removeAsset(asset.id)` after a `window.confirm()` guard — deleting a sold asset removes it and its history entirely.

## `AssetDetail`

The expanded panel (`<tr className="asset-detail-row">` with `colSpan={7}`), rendered when `openAssetId === asset.id`:

- **Edit asset button**: opens a `<dialog>` rendering [`AddAssetForm` in edit mode](forms.md#edit-mode-asset-prop), which edits the asset's full entry (symbol, name, currency, ISIN, WKN) and dispatches `updateAsset` + a refresh.
- **Lot table**: Date, Quantity, Price, Fee (or `–`), and a Remove button per lot (`actions.removeLot(asset.id, lot.id)`).
- **Add-lot form**: date (defaulting to today), quantity, price, optional fee. Validates `quantity > 0 && price > 0` before calling `actions.addLot(asset.id, { date, quantity, price, fee })`. Adding a lot triggers a [store refresh](../app/store.md#the-refresh-flow). Buying more into a closed position clears `sale` and reopens it (store `ADD_LOT` invariant).
- **Sell form**: sale date (defaulting to today), sale price, optional fee. Pre-fills `heldQuantity` from `assetQuantity(asset)`. Validates `heldQuantity > 0` and `price > 0` before calling `actions.sellAsset(asset.id, { date, quantity: heldQuantity, price, fee })`. A sale error (e.g. nothing to sell) sets `saleError`. Selling records a full-position sale — the asset moves to the sold-assets table and stops being price-tracked.
- **Remove asset**: a `window.confirm()` guard, then `actions.removeAsset(asset.id)`.

## Add-asset dialog

An "Add asset" `<dialog>` button at the bottom opens `<AddAssetForm onDone={close} />` (see [Forms & dialogs](forms.md)).

## Focused tests

No dedicated UI tests; the table reads directly from the tested [portfolioSnapshot](../domain/portfolio.md#focused-tests-srcdomainportfoliotestts), and the form validation is local (`Number(quantity) > 0 && Number(price) > 0`).
