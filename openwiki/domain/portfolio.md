---
type: domain-logic
title: Portfolio Snapshots
description: Current-value computations in portfolio.ts — assetQuantity, assetCostBasis, assetSnapshot and portfolioSnapshot — including fee handling, missing-quote fallbacks and zero-division guards.
tags: [domain, portfolio, snapshots]
---

# Portfolio Snapshots (`src/domain/portfolio.ts`)

`portfolio.ts` computes the *current* view of a portfolio from its lots and a set of quotes. It produces [AssetSnapshot / PortfolioSnapshot](model.md) result shapes for the Overview table and the header stats.

## Functions

### `assetQuantity(asset, asOf?)`

Sums `lot.quantity` over lots dated `<= asOf`. When `asOf` is omitted, sums all lots. `asOf` is used by the [performance](performance.md) builder to value a position as of a chart date, not just today.

### `assetCostBasis(asset, asOf?)`

Sums `lot.quantity * lot.price + (lot.fee ?? 0)` over lots dated `<= asOf`. The fee is part of the cost basis: `fee` defaults to `0` when absent. This is the denominator of `totalChangePct` and the `cost` field of a `SeriesPoint`.

### `assetSnapshot(asset, quote)`

Produces the per-asset current snapshot:

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

### `portfolioSnapshot(portfolio, quotes)`

Maps each asset to `assetSnapshot` using `quotes[asset.symbol]`, **sorts the resulting array by `marketValue` descending**, then reduces:

| Field | Formula |
| --- | --- |
| `totalValue` | sum of `marketValue` |
| `totalCost` | sum of `costBasis` |
| `dayChangeAbs` | sum of `dayChangeAbs` |
| `dayChangePct` | `prevValue ? (dayChangeAbs / prevValue) * 100 : 0` where `prevValue` = sum of `quantity * previousClose` |
| `totalChangeAbs` | sum of `totalChangeAbs` |
| `totalChangePct` | `totalCost ? (totalChangeAbs / totalCost) * 100 : 0` |

Note `dayChangePct` is weighted by the *previous* day's value (`prevValue`), not today's, so the percentage reflects the change relative to yesterday's close.

## Invariants and edge cases

- **Missing quote → zero fallback.** When `quotes[symbol]` is undefined, `price` and `previousClose` fall back to `0`. `marketValue` becomes `0`, `dayChangeAbs` `0`, but `totalChangeAbs` becomes `-costBasis` (the cost is still counted). This is why a portfolio with assets that have never refreshed shows a negative total change.
- **Zero-division guards.** `dayChangePct` guards on `previousClose` and `prevValue`; `totalChangePct` guards on `costBasis`/`totalCost`. An empty portfolio returns a snapshot of all zeros and an empty `assets` array.
- **Sort by marketValue.** Assets render largest-first; a missing-quote asset (marketValue 0) sinks to the bottom.

## Focused tests (`src/domain/portfolio.test.ts`)

The tests construct a helper `asset()` with two lots (`{date:'2024-01-01', quantity:10, price:100}` and `{date:'2024-02-01', quantity:5, price:120, fee:5}`, cost basis `10*100 + (5*120 + 5) = 1605`) and assert:

- `assetQuantity` sums all lots or filters by `asOf` (boundary: lot dated exactly `asOf` is included; a date before all lots yields `0`).
- `assetCostBasis` includes fees and respects `asOf`.
- `assetSnapshot` with a quote computes `marketValue`, `dayChangeAbs`, `dayChangePct`, `totalChangeAbs`, `totalChangePct` against expected values; with `undefined` quote falls back to zeros and `-costBasis` total change; with an empty `lots` array guards `totalChangePct` to `0`.
- `portfolioSnapshot` aggregates two assets, sorts by `marketValue` (the quoted asset first), computes `dayChangePct` from the previous-close-weighted `prevValue` (the unquoted asset's `previousClose` fallback `0` excludes it from the day-% denominator weight), and guards an empty portfolio to all zeros.

Run the suite with `npm test` (vitest); the portfolio tests are `src/domain/portfolio.test.ts`.
