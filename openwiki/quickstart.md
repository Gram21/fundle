---
type: quickstart
title: Fundle Wiki — Quickstart
description: "Entry point for the Fundle repository wiki: a stateless, client-only portfolio tracker (React 19 + Vite + TypeScript) with a clean layered architecture and time-weighted return math."
tags: [quickstart, navigation, fundle]
---

# Fundle Wiki — Quickstart

**Fundle** is a stateless, client-only portfolio tracker for ETFs, stocks and similar assets. It runs entirely in the browser, keeps no server state, persists to `localStorage`, and deploys to GitHub Pages as static files. The core intellectual content is a **time-weighted return** (TWR) calculation that stays flat on purchase days — buying more moves the value line, never the percentage line.

## High-level map

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
  Main["main.tsx<br/>StrictMode + AppProvider"] --> App["App.tsx (shell)"]
  App --> Store["app/store.tsx<br/>reducer + actions"]
  Store --> Persist["app/persistence.ts<br/>localStorage + import/export"]
  Store --> Schema["app/schema.ts<br/>Settings + ExportFileV1"]
  Store --> Data["data/index.ts<br/>createProvider factory"]
  Data --> Yahoo["data/yahoo.ts"]
  Data --> Twelve["data/twelvedata.ts"]
  Yahoo --> Proxy["data/proxy.ts<br/>fetchJson + timeout"]
  Twelve --> Proxy
  App --> Overview["ui/Overview.tsx"]
  App --> Perf["ui/PerformanceView.tsx"]
  App --> Settings["ui/SettingsView.tsx"]
  Overview --> Portfolio["domain/portfolio.ts<br/>snapshots"]
  Perf --> Performance["domain/performance.ts<br/>buildPortfolioSeries"]
  Portfolio --> Types["domain/types.ts<br/>Lot/Asset/Portfolio/Quote"]
  Performance --> Types
```
*The dependency rule: `ui` → `app` → `data`/`domain`, and `domain` imports nothing. Swapping in another market-data API means writing one more `PriceProvider` adapter.*

## Major sections

| Section | Page | What it covers |
| --- | --- | --- |
| **Architecture** | [Architecture overview](architecture/overview.md) | Layered architecture, dependency rule, data flow diagram, scope boundaries (buy-only, no FX) |
| **Domain** | [Domain model](domain/model.md) | `Lot`, `Asset`, `Portfolio`, `Quote`, `PriceSeries` types and `AssetSnapshot`/`PortfolioSnapshot`/`SeriesPoint` result shapes |
| | [Portfolio snapshots](domain/portfolio.md) | `assetQuantity`, `assetCostBasis`, `assetSnapshot`, `portfolioSnapshot` — the point-in-time math behind the Overview table and header stats |
| | [Performance & TWR](domain/performance.md) | `buildPortfolioSeries` / `buildAssetSeries` — the time-weighted return algorithm, forward-fill, cash-flow neutrality, and every tested invariant |
| **Data** | [PriceProvider port](data/price-provider.md) | The `PriceProvider` interface, `PriceProviderError`, `createProvider` factory, `PROVIDERS` registry, and how to add a new adapter |
| | [Yahoo adapter](data/yahoo.md) | Yahoo Finance endpoints, CORS-proxy dependency, `adjclose` preference, `previousClose` vs `chartPreviousClose` |
| | [Twelve Data adapter](data/twelvedata.md) | Twelve Data endpoints, native CORS, `requireApiKey`, error-response detection |
| **App** | [Store](app/store.md) | `AppState`, the reducer, `AppActions`, the refresh flow (concurrency guard, history reuse, `allSettled` partial-failure), persistence/interval effects |
| | [Persistence](app/persistence.md) | `serialize`/`parseImport` trust boundary, `loadLocal`/`saveLocal`, legacy `fin-tracker/v1` migration, strict-vs-lenient validation |
| | [Schema](app/schema.md) | `Settings`, `ExportFileV1`, `DEFAULT_SETTINGS`, schema IDs |
| **UI** | [App shell](ui/app-shell.md) | `main.tsx` bootstrap, `App.tsx` header/tabs, `format.ts` Intl helpers, `HelpDialog`, `Logo` |
| | [Overview tab](ui/overview.md) | Asset table, expandable `AssetDetail`, lot editor, add-asset dialog |
| | [Performance tab](ui/performance-view.md) | Dual-axis value/TWR chart, per-asset/per-portfolio lines, range selection, line toggles, `simplePct` comparison |
| | [Forms & dialogs](ui/forms.md) | `AddAssetForm`, `SettingsView`, `BackupMenu`, `PortfolioDialogs` |
| **Operations** | [Build, test & deploy](operations/build-test-deploy.md) | Vite/tsc scripts, strict `tsconfig`, vitest suite, GitHub Pages deploy, OpenWiki update workflow |

## Core concepts

- **Time-weighted return (TWR)**: daily returns are chained after subtracting that day's cash flow, so a purchase leaves the percentage untouched. Inflows are valued at the same daily close the position is valued at, not at the price paid — the paid-vs-market gap stays in `cost`/`simplePct`. See [Performance & TWR](domain/performance.md).
- **PriceProvider port**: a `search`/`quote`/`history` interface with two adapters (Yahoo via CORS proxy, Twelve Data via API key). See [PriceProvider port](data/price-provider.md).
- **Import trust boundary**: `parseImport` validates and reconstructs every portfolio/lot field (throwing on bad data) but drops malformed price-cache entries (the cache is disposable). See [Persistence](app/persistence.md).
- **Stateless client-only model**: no server, no account; all state in `localStorage` under `fundle/v1`, with the export format doubling as the on-disk schema. See [Store](app/store.md) and [Schema](app/schema.md).

## Task routing

| Change intent | Page | Source entrypoints/symbols | Focused tests | Validation |
| --- | --- | --- | --- | --- |
| Change TWR math or add a performance invariant | [Performance & TWR](domain/performance.md) | `src/domain/performance.ts` `buildPortfolioSeries` | `src/domain/performance.test.ts` | `npm test` |
| Change snapshot math (cost basis, day change) | [Portfolio snapshots](domain/portfolio.md) | `src/domain/portfolio.ts` `portfolioSnapshot` | `src/domain/portfolio.test.ts` | `npm test` |
| Add a new market-data provider | [PriceProvider port](data/price-provider.md) | `src/data/PriceProvider.ts`, `src/data/index.ts` `PROVIDERS`/`createProvider`, `src/ui/SettingsView.tsx` | `src/data/yahoo.test.ts` (pattern) | `npm test` `npm run typecheck` |
| Change Yahoo/Twelve Data parsing | [Yahoo](data/yahoo.md) / [Twelve Data](data/twelvedata.md) | `src/data/yahoo.ts` / `src/data/twelvedata.ts` | `src/data/yahoo.test.ts` | `npm test` |
| Change the store reducer or refresh flow | [Store](app/store.md) | `src/app/store.tsx` `reducer` / `refresh` | (indirect via persistence tests) | `npm test` `npm run typecheck` |
| Change import/export or localStorage schema | [Persistence](app/persistence.md) / [Schema](app/schema.md) | `src/app/persistence.ts` `parseImport`/`serialize`, `src/app/schema.ts` | `src/app/persistence.test.ts` | `npm test` |
| Change a UI view | [Overview](ui/overview.md) / [Performance](ui/performance-view.md) / [Forms](ui/forms.md) | `src/ui/*.tsx` | (none; thin glue) | `npm run build` |
| Change build, deploy, or CI | [Build, test & deploy](operations/build-test-deploy.md) | `vite.config.ts`, `tsconfig.json`, `.github/workflows/` | — | `npm run build` |

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest run
npm run build    # tsc -b && vite build -> dist/
npm run preview  # serve the production build
```

## Backlog

No deferred areas. The repository is fully covered: all four layers (domain, data, app, ui), both market-data adapters, the store/persistence/schema, every UI view, and both GitHub workflows. The only intentionally untested areas are the UI components (thin glue over tested store/domain code) and the Twelve Data adapter (exercises the same tested `proxy.ts` `fetchJson` path as Yahoo).
