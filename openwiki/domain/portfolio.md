---
type: domain-logic
title: Portfolio Snapshots
description: Current-value computations in portfolio.ts — assetQuantity (sale-aware), assetCostBasis, assetSnapshot, soldAssetSnapshot and portfolioSnapshot — including fee handling, missing-quote fallbacks, sold-asset splitting and zero-division guards.
tags: [domain, portfolio, snapshots, sale]
---

# Portfolio Snapshots (`src/domain/portfolio.ts`)

`portfolio.ts` computes the *current* view of a portfolio from its lots and a set of quotes. It produces [AssetSnapshot / SoldAssetSnapshot / PortfolioSnapshot](model.md) result shapes for the Overview table and the header stats. It is sale-aware: an asset with `Asset.sale` set is no longer price-tracked and is reported through `soldAssetSnapshot` instead of `assetSnapshot`.

## Functions

### `assetQuantity(asset, asOf?)`

Sums `lot.quantity` over lots dated `<= asOf`. When `asOf` is omitted, sums all lots. If `asset.sale` is set **and** `asOf` is omitted or `>= sale.date`, the quantity drops to `Math.max(0, bought - sale.quantity)` — clamped to `0`, never negative, so an inconsistent sale quantity can't produce a negative holding. `asOf` is used by the [performance](performance.md) builder to value a position as of a chart date, not just today.

### `assetCostBasis(asset, asOf?)`

Sums `lot.quantity * lot.price + (lot.fee ?? 0)` over lots dated `<= asOf`. The fee is part of the cost basis: `fee` defaults to `0` when absent. This is the denominator of `totalChangePct` and the `cost` field of a `SeriesPoint`. Note the cost basis is *not* reduced by a sale — the original buy cost is kept, and the sale's proceeds are handled separately in `soldAssetSnapshot`.

### `assetSnapshot(asset, quote)`

Produces the per-asset current snapshot of a **held** asset (one without `sale`):

| Field | Formula |
| --- | --- |
| `quantity` | `assetQuantity(asset)` |
| `price` | `quote?.price ?? 0` |
| `previousClose` | `quote?.previousClose ?? price` |
| `marketValue` | `quantity * price` |
| `costBasis` | `assetCostBasis(asset)` |
| `dayChangeAbs` | `quantity * (price - previousClose)` |
| `dayChangePct` | `previousClose ? (price / previousClose - 1) * 100 : 0` |
| `totalChangeAbs` | `marketValue - costBasis` |
| `totalChangePct` | `costBasis ? (totalChangeAbs / costBasis) * 100 : 0` |

### `soldAssetSnapshot(asset)`

Produces the `SoldAssetSnapshot` for a fully sold asset (requires `asset.sale` to be set):

| Field | Formula |
| --- | --- |
| `proceeds` | `sale.quantity * sale.price - (sale.fee ?? 0)` |
| `costBasis` | `assetCostBasis(asset)` (original buy cost, unreduced) |
| `realizedChangeAbs` | `proceeds - costBasis` |
| `realizedChangePct` | `costBasis ? (realizedChangeAbs / costBasis) * 100 : 0` |

### `portfolioSnapshot(portfolio, quotes)`

Splits the portfolio's assets into held (`!a.sale`) and sold (`a.sale`). Maps held assets to `assetSnapshot` using `quotes[asset.symbol]`, **sorts the resulting array by `marketValue` descending**, and maps sold assets to `soldAssetSnapshot`. Then reduces:

| Field | Formula |
| --- | --- |
| `totalValue` | sum of held `marketValue` (sold contribute `0`) |
| `totalCost` | sum of held `costBasis` **+** sum of sold `costBasis` |
| `dayChangeAbs` | sum of held `dayChangeAbs` (sold contribute `0`) |
| `dayChangePct` | `prevValue ? (dayChangeAbs / prevValue) * 100 : 0` where `prevValue` = sum of held `quantity * previousClose` |
| `totalChangeAbs` | sum of held `totalChangeAbs` **+** sum of sold `realizedChangeAbs` |
| `totalChangePct` | `totalCost ? (totalChangeAbs / totalCost) * 100 : 0` |

Sold assets therefore count in `totalCost` (their original buy cost) and in `totalChangeAbs` (their realized P/L), but not in `totalValue` or day-change figures. `dayChangePct` is weighted by the *previous* day's held value (`prevValue`), not today's, so the percentage reflects the change relative to yesterday's close.

## Invariants and edge cases

- **Missing quote → zero fallback.** When `quotes[symbol]` is undefined, `price` and `previousClose` fall back to `0`. `marketValue` becomes `0`, `dayChangeAbs` `0`, but `totalChangeAbs` becomes `-costBasis` (the cost is still counted). This is why a portfolio with assets that have never refreshed shows a negative total change.
- **Zero-division guards.** `dayChangePct` guards on `previousClose` and `prevValue`; `totalChangePct` guards on `costBasis`/`totalCost`. An empty portfolio returns a snapshot of all zeros and empty `assets`/`soldAssets` arrays.
- **Sort by marketValue.** Held assets render largest-first; a missing-quote asset (marketValue 0) sinks to the bottom. Sold assets are not sorted — they keep their portfolio order.
- **Sale quantity clamp.** `assetQuantity` clamps to `0` on a sale, so an inconsistent `sale.quantity` larger than the bought quantity cannot go negative.

## Focused tests (`src/domain/portfolio.test.ts`)

The tests construct a helper `asset()` with two lots (`{date:'2024-01-01', quantity:10, price:100}` and `{date:'2024-02-01', quantity:5, price:120, fee:5}`, cost basis `10*100 + (5*120 + 5) = 1605`) and assert:

- `assetQuantity` sums all lots or filters by `asOf` (boundary: lot dated exactly `asOf` is included; a date before all lots yields `0`); with a sale, drops to `0` from the sale date onward and unaffected before; clamps to `0` on an inconsistent sale quantity.
- `assetCostBasis` includes fees and respects `asOf`.
- `assetSnapshot` with a quote computes `marketValue`, `dayChangeAbs`, `dayChangePct`, `totalChangeAbs`, `totalChangePct` against expected values; with `undefined` quote falls back to zeros and `-costBasis` total change; with an empty `lots` array guards `totalChangePct` to `0`.
- `portfolioSnapshot` aggregates two held assets, sorts by `marketValue` (the quoted asset first), computes `dayChangePct` from the previous-close-weighted `prevValue`, and guards an empty portfolio to all zeros.
- **Sale integration**: one held + one sold asset — `totalValue` is held-only, `totalCost` includes both, `totalChangeAbs` includes the sold asset's realized P/L, `soldAssets` carries `proceeds` and `realizedChangeAbs`.

Run the suite with `npm test` (vitest); the portfolio tests are `src/domain/portfolio.test.ts`.
