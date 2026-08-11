---
type: architecture
title: Architecture Overview
description: Fundle's layered module map and the dependency rule (ui to app to data/domain; domain imports nothing), with the refresh data flow.
tags: [architecture, overview]
---

# Architecture Overview

Fundle is a **stateless, client-only portfolio tracker** for ETFs, stocks and similar assets. It runs entirely in the browser, keeps no server state, and deploys to GitHub Pages as static files. All persistence is `localStorage`; all market data comes from free public APIs (Yahoo Finance via a CORS proxy, or Twelve Data with an API key).

## Layers and dependency rule

```
src/
  domain/   pure model and math, no IO      types, metrics, portfolio, performance
  data/     market-data port and adapters   PriceProvider, yahoo, twelvedata, proxy
  app/      state, scheduling, persistence   store, persistence, schema
  ui/       React views                     Overview, PerformanceView, AddAssetForm, SettingsView
```

Dependencies point **inwards only**: `ui` → `app` → `data`/`domain`, and `domain` imports nothing. The domain layer has no knowledge of React, fetch, or localStorage; it is pure functions over plain data types. This makes the portfolio math independently testable and lets the UI layer be swapped without touching the model.

The single seam that breaks the inwards rule is intentional: the `app` store imports `createProvider` from `data` to wire runtime settings to an adapter, and the `ui` forms call `actions.search()` which the store forwards to a provider. Everything still flows through the store, so the data layer never reaches back into `ui`.

## Module ownership

| Layer | Module | Owns |
| --- | --- | --- |
| domain | [types](../domain/model.md) | `Lot`, `Asset`, `Portfolio`, `PricePoint`, `PriceSeries`, `Quote` |
| domain | [metrics](../domain/model.md) | `AssetSnapshot`, `PortfolioSnapshot`, `SeriesPoint` result shapes |
| domain | [portfolio](../domain/portfolio.md) | quantity, cost basis, snapshots |
| domain | [performance](../domain/performance.md) | time-weighted return series |
| data | [PriceProvider](../data/price-provider.md) | port + `PriceProviderError` + factory/registry |
| data | [yahoo](../data/yahoo.md) | Yahoo Finance adapter |
| data | [twelvedata](../data/twelvedata.md) | Twelve Data adapter |
| app | [store](../app/store.md) | reducer, context, actions, refresh scheduling |
| app | [persistence](../app/persistence.md) | serialize/parseImport trust boundary, localStorage |
| app | [schema](../app/schema.md) | `Settings`, `ExportFileV1`, `DEFAULT_SETTINGS` |
| ui | [app-shell](../ui/app-shell.md) | `App.tsx`, `main.tsx`, header, tabs, format helpers |
| ui | [overview](../ui/overview.md) | asset table + lot detail |
| ui | [performance-view](../ui/performance-view.md) | value/TWR + per-asset charts |
| ui | [forms](../ui/forms.md) | add-asset, settings, backup, portfolio dialogs |

## Refresh data flow

The central runtime workflow is the price refresh, owned by the [store](../app/store.md). On mount, on an interval (`settings.refreshMinutes`), after adding an asset/lot, and after changing provider/proxy/apiKey settings, `refresh()` fetches a quote and — only when needed — a daily price series for every symbol across all portfolios, then merges the results into `state.quotes` / `state.history`.

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
sequenceDiagram
    participant UI as App / Overview
    participant Store as AppProvider (store)
    participant Prov as PriceProvider adapter
    participant Persist as persistence / localStorage

    UI->>Store: actions.refresh()
    Store->>Store: REFRESH_START (status=loading)
    Store->>Store: earliestLotDateBySymbol(portfolios)
    loop for each unique symbol
        Store->>Prov: quote(symbol)
        alt series not fresh (last point < today)
            Store->>Prov: history(symbol, from)
        else series already reaches today
            Store->>Store: reuse known history[symbol]
        end
    end
    Store->>Store: Promise.allSettled -> quotes, history, failed[]
    alt failed.length > 0
        Store->>Store: REFRESH_DONE (status=error, merged partials)
    else all fulfilled
        Store->>Store: REFRESH_DONE (status=idle, lastUpdated=now)
    end
    Store->>Persist: saveLocal(portfolios, settings, quotes, history)
    Persist-->>UI: re-render via useApp()
    UI->>UI: portfolioSnapshot + buildPortfolioSeries
```

### Series freshness optimization

The daily series only gains a point once a day, so the interval tick refetches the quote but reuses a series that already reaches today. This halves the requests a rate-limited public CORS proxy sees. A series is considered fresh when its last point's date `>= today`.

## Key invariants

- **Buy-only scope.** Every position is buy-only; sells and dividends are not modelled (`Lot` has no sell type).
- **No FX conversion.** Amounts are used as returned by the provider, with no currency conversion, so mixing currencies inside one portfolio mixes units. `baseCurrency` only labels chart axes; it does not convert.
- **Cash-flow-neutral return.** The [performance](../domain/performance.md) `twrPct` line never moves on a purchase — only on price moves. See [Performance math](../domain/performance.md) for the algorithm and the forward-fill / cash-flow rules.
- **Persistence doubles as the export format.** `localStorage` and the JSON export/import file use the same `ExportFileV1` shape, so restoring on another device needs no refetch (prices are cached in the file).
- **Import is a trust boundary.** [persistence](../app/persistence.md) `parseImport` validates every field and never casts; bad price-cache entries are dropped rather than thrown.

## Scope boundaries

Sells and dividends are out of scope (see README "Scope"). There is no FX conversion. The in-app help screen (the **?** button in the header, rendered by `HelpDialog`) covers the same ground for end users.

## Build and deploy

<!-- openwiki: broken internal link [../operations/build-deploy.md] file "../operations/build-deploy.md" does not exist. Fix the href or restore the target, then delete this comment. -->
Vite builds static files into `dist/` with a relative `base: './'` so the same build works on a user site and a project subpath. The [deploy workflow](../operations/build-deploy.md) builds, tests, and publishes to GitHub Pages on every push to `main`.
