---
type: ui-view
title: Overview Tab — Asset Table and Lot Editor
description: Overview renders the portfolio snapshot as a sortable asset table with expandable per-asset AssetDetail (lot list, add-lot form, remove asset), plus the Add-asset dialog trigger.
tags: [ui, overview, table, lots]
---

# Overview Tab (`src/ui/Overview.tsx`)

The default tab. Renders the active portfolio's [snapshot](../domain/portfolio.md) as an asset table, with expandable rows revealing each asset's lots and an inline lot editor. Hosts the "Add asset" dialog.

## Layout

- **Empty state**: if the portfolio has no assets, shows "No assets yet — add one below to get started."
- **Asset table** (`<table className="asset-table">`): columns Name, Quantity, Avg buy price, Price, Day %, Value, Total +/-. Each row is a `<button className="row-expand">` toggling `openAssetId`; the asset's `symbol` and optional `isin` render as a sub-line.
- **Footer**: a Total row summing Value, Day %, and Total +/- from the `PortfolioSnapshot`.
<!-- openwiki: broken internal link [forms.md#addassetform] heading anchor "addassetform" does not exist in "forms.md". Fix the href or restore the target, then delete this comment. -->
- **Add asset button** opens a `<dialog>` containing [AddAssetForm](forms.md#addassetform).

Rows are sourced from `portfolioSnapshot(portfolio, quotes).assets`, which is already sorted by `marketValue` descending. The `avgBuyPrice` shown is `row.costBasis / row.quantity` (guarded to `0` when quantity is `0`). Numbers use the **asset's** currency via `money()`; the footer total uses `portfolio.assets[0]?.currency ?? 'EUR'` (a pragmatic pick of the first asset's currency for the total label — there is no FX conversion).

## `AssetDetail`

The expanded panel (`<tr className="asset-detail-row">` with `colSpan={7}`), rendered when `openAssetId === asset.id`:

- **Lot table**: Date, Quantity, Price, Fee (or `–`), and a Remove button per lot (`actions.removeLot(asset.id, lot.id)`).
- **Add-lot form**: date (defaulting to today), quantity, price, optional fee. Validates `quantity > 0 && price > 0` before calling `actions.addLot(asset.id, { date, quantity, price, fee })`. Adding a lot triggers a [store refresh](../app/store.md#the-refresh-flow).
- **Remove asset**: a `window.confirm()` guard, then `actions.removeAsset(asset.id)`.

## Focused tests

No dedicated UI tests; the table reads directly from the tested [portfolioSnapshot](../domain/portfolio.md#focused-tests-srcdomainportfoliotestts), and the form validation is local (`Number(quantity) > 0 && Number(price) > 0`).
