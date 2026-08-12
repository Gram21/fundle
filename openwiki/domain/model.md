---
type: domain-model
title: Domain Model and Types
description: Core data types (Lot, Asset with full-position sale, Portfolio, PricePoint, PriceSeries, Quote) and result shapes (AssetSnapshot, SoldAssetSnapshot, PortfolioSnapshot, SeriesPoint) that the domain layer owns and the rest of the app consumes.
tags: [domain, types, model]
---

# Domain Model and Types

The domain layer (`src/domain/`) is pure data and math with no IO and no framework types. It owns two families of types: **entity types** in `types.ts` that describe the portfolio the user builds, and **result shapes** in `metrics.ts` that the snapshot and performance functions produce for the UI.

## Entity types (`src/domain/types.ts`)

```mermaid
erDiagram
    Portfolio ||--o{ Asset : "assets"
    Asset ||--o{ Lot : "lots"
    Asset }o--o| Sale : "sale (full position)"
    PriceSeries ||--o{ PricePoint : "points"
    Quote }o--|| Asset : "looked up by symbol"
    PriceSeries }o--|| Asset : "looked up by symbol"

    Portfolio {
        string id
        string name
        Asset[] assets
    }
    Asset {
        string id
        string symbol
        string name
        string currency
        string isin
        string wkn
        Lot[] lots
        Sale sale
    }
    Lot {
        string id
        ISODate date
        number quantity
        number price
        number fee
    }
    Sale {
        ISODate date
        number quantity
        number price
        number fee
    }
    PricePoint {
        ISODate date
        number close
    }
    PriceSeries {
        string symbol
        PricePoint[] points
    }
    Quote {
        string symbol
        number price
        number previousClose
        string currency
        number time
    }
```

### `ISODate`

`ISODate` is a `string` in `'YYYY-MM-DD'` form. Dates are compared as strings, which works because the format is lexicographically ordered. Lot dates are user-entered and may land on non-trading days (weekends/holidays); the [performance](performance.md) builder accounts for this by treating any lot dated between two charted dates as a cash flow into the later one. The same applies to sale dates.

### `Lot`

A single buy order ("lot"). Fields: `id`, `date`, `quantity`, `price` (per share in the asset's currency), optional `fee` (in the asset's currency, counts towards cost basis). Partial sales are out of scope — a sale always closes the whole position (see `Asset.sale`).

### `Asset`

A holding. `symbol` is the provider symbol used for price lookups (e.g. `EUNL.DE`, or an `ISIN@MIC` composite for a [Börse Frankfurt](../data/boerse-frankfurt.md)-resolved instrument). `currency` is the asset's own currency — there is no FX conversion, so mixing currencies inside one portfolio mixes units. `isin`/`wkn` are optional identifiers; `isin` is used for display and by the BF adapter's search/history.

### `Asset.sale` — full-position sale

An optional `{ date, quantity, price, fee? }` recording a **completed full sale** that closes the position. Once set:

- `assetQuantity` drops to `0` from the sale date onward (clamped, never negative).
- The asset moves out of the held-asset table and into the sold-asset table in the [Overview](../ui/overview.md).
- The [performance](performance.md) builder books the sale proceeds as a negative cash flow on the sale date, then values the asset at `0`.
- A later buy into the same asset **reopens** the position: the store's `ADD_LOT` reducer clears `sale` when appending a lot, so a sold asset can't also be held.

### `Portfolio`

A named collection of assets. The app supports multiple portfolios; the store tracks `activePortfolioId` and a Performance view can aggregate "All portfolios".

### `PriceSeries` / `PricePoint`

Daily closes, ascending by date, with gaps (weekends/holidays) simply absent — the performance builder forward-fills missing days. `PricePoint` is `{ date, close }`.

### `Quote`

A current price snapshot: `price`, `previousClose` (previous trading day's close, for day-change figures), `currency`, and `time` (epoch milliseconds).

## Result shapes (`src/domain/metrics.ts`)

These are produced by [portfolio.ts](portfolio.md) (snapshots) and [performance.ts](performance.md) (series) and consumed by the UI. They are kept separate from entity types so the model never carries derived/display state.

### `AssetSnapshot`

Per-asset current view of a **held** asset: `quantity`, `price`, `previousClose`, `marketValue`, `costBasis` (sum over lots of `quantity * price + fee`), `dayChangeAbs`/`dayChangePct`, `totalChangeAbs`/`totalChangePct`, plus the originating `asset`.

### `SoldAssetSnapshot`

Per-asset view of a **fully sold** asset — its realized P/L, with no live price. Produced by `soldAssetSnapshot` (see [portfolio](portfolio.md)):

- `proceeds` — `sale.quantity * sale.price - (sale.fee ?? 0)`
- `costBasis` — the original buy cost (unchanged by the sale)
- `realizedChangeAbs` — `proceeds - costBasis`
- `realizedChangePct` — `costBasis ? (realizedChangeAbs / costBasis) * 100 : 0`

### `PortfolioSnapshot`

Aggregated view: `totalValue`, `totalCost`, `dayChangeAbs`/`dayChangePct`, `totalChangeAbs`/`totalChangePct`, `assets` (the per-asset snapshots of **held** assets, sorted by `marketValue` descending), and `soldAssets` (the `SoldAssetSnapshot` list). Sold assets contribute their `costBasis` to `totalCost` and their `realizedChangeAbs` to `totalChangeAbs`, but nothing to `totalValue` or day-change figures.

### `SeriesPoint`

One point of a performance chart line (`src/domain/metrics.ts`):

- `value` — market value of everything held on that date.
- `cost` — cost basis of everything held on that date.
- `twrPct` — cumulative time-weighted return in percent, cash-flow neutral: buying more does not move this line, only price moves do. Inflows are valued at the same close as the position, so a buy price that differs from the provider's close (adjusted history, another exchange, fees) lands in `cost`, not here.
- `simplePct` — `value/cost - 1`, in percent. Moves when new money comes in.
