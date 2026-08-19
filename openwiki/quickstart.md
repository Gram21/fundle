---
type: quickstart
title: Fundle Wiki — Quickstart
description: "Entry point for the Fundle repository wiki: a stateless, client-only portfolio tracker (React 19 + Vite + TypeScript) with a clean layered architecture and time-weighted return math."
tags: [quickstart, navigation, fundle]
---

# Fundle Wiki — Quickstart

**Fundle** is a stateless, client-only portfolio tracker for ETFs, stocks and similar assets. It runs entirely in the browser, keeps no server state, persists to `localStorage`, and deploys to GitHub Pages as static files. The core intellectual content is a **time-weighted return** (TWR) calculation that stays flat on purchase days — buying more moves the value line, never the percentage line.

## High-level map

```mermaid
flowchart TD
  Main["main.tsx — StrictMode + AppProvider"] --> App["App.tsx (shell)"]
  App --> Store["app/store.tsx — reducer + actions"]
  Store --> Persist["app/persistence.ts — localStorage + import/export"]
  Store --> Schema["app/schema.ts — Settings + ExportFileV1"]
  Store --> Data["data/index.ts — createProvider + resolveProvider"]
  Data --> Yahoo["data/yahoo.ts"]
  Data --> Twelve["data/twelvedata.ts"]
  Data --> EODHD["data/eodhd.ts"]
  Data --> AV["data/alphaVantage.ts"]
  Data --> BF["data/boerseFrankfurt.ts"]
  Data --> Figi["data/openfigi.ts"]
  Yahoo --> Proxy["data/proxy.ts — fetchJson + fallback list"]
  Twelve --> Proxy
  EODHD --> Proxy
  BF --> Proxy
  BF --> Yahoo
  Figi --> Yahoo
  App --> Overview["ui/Overview.tsx"]
  App --> Perf["ui/PerformanceView.tsx"]
  App --> Settings["ui/SettingsView.tsx"]
  App --> Menu["ui/PortfolioMenu.tsx"]
  Overview --> Portfolio["domain/portfolio.ts — snapshots"]
  Perf --> Performance["domain/performance.ts — buildPortfolioSeries"]
  Portfolio --> Types["domain/types.ts — Lot/Asset/Portfolio/Quote"]
  Performance --> Types
```
*The dependency rule: `ui` → `app` → `data`/`domain`, and `domain` imports nothing. Swapping in another market-data API means writing one more `PriceProvider` adapter. Börse Frankfurt and OpenFIGI are supplementary sources routed automatically, not chosen in Settings.*

## Major sections

| Section | Page | What it covers |
| --- | --- | --- |
| **Architecture** | [Architecture overview](architecture/overview.md) | Layered architecture, dependency rule, data flow diagram, scope boundaries (buy + full sale, no FX) |
| **Domain** | [Domain model](domain/model.md) | `Lot`, `Asset`, `Portfolio`, `Quote`, `PriceSeries` types and `AssetSnapshot`/`PortfolioSnapshot`/`SeriesPoint` result shapes |
| | [Portfolio snapshots](domain/portfolio.md) | `assetQuantity`, `assetCostBasis`, `assetSnapshot`, `portfolioSnapshot`, `soldAssetSnapshot` — the point-in-time math behind the Overview table and header stats |
| | [Performance & TWR](domain/performance.md) | `buildPortfolioSeries` / `buildAssetSeries` — the time-weighted return algorithm, forward-fill, cash-flow neutrality, sale handling, and every tested invariant |
| **Data** | [PriceProvider port](data/price-provider.md) | The `PriceProvider` interface, `PriceProviderError`, `createProvider` factory, `resolveProvider` dispatch, `PROVIDERS` registry, `MANUAL_REFRESH_ONLY_PROVIDERS`, and the multi-proxy `fetchJson` helper (with `RequestInit` for POST APIs) |
| | [Yahoo adapter](data/yahoo.md) | Yahoo Finance endpoints, CORS-proxy dependency, `adjclose` preference, `previousClose` vs `chartPreviousClose` |
| | [Twelve Data adapter](data/twelvedata.md) | Twelve Data endpoints, native CORS, `requireApiKey`, error-response detection |
| | [EODHD adapter](data/eodhd.md) | Paid, ISIN-native adapter; `TICKER.EXCHANGE@CCY` composite symbols, proxy-routed, adjusted-close history |
| | [Alpha Vantage adapter](data/alphavantage.md) | Free, rate-capped (25 req/day) adapter; native CORS, `Information`/`Note` cap detection, compact history |
| | [OpenFIGI adapter](data/openfigi.md) | Supplementary ISIN → Yahoo-ticker resolver; POST mapping endpoint, exchange-suffix map, delegates pricing to Yahoo |
| | [Börse Frankfurt adapter](data/boerse-frankfurt.md) | Supplementary ISIN-native quote source, `ISIN@MIC` symbols, history delegation to Yahoo |
| **App** | [Store](app/store.md) | `AppState`, the reducer, `AppActions` (incl. `sellAsset`, `updateAsset`, `renamePortfolio`), the refresh flow (concurrency guard, sold-out logic, `resolveProvider` dispatch, manual-refresh-only skip, history reuse, `allSettled` partial-failure), persistence/interval effects |
| | [Persistence](app/persistence.md) | `serialize`/`parseImport` trust boundary, `loadLocal`/`saveLocal`, legacy `fin-tracker/v1` migration, stale-proxy auto-upgrade, strict-vs-lenient validation |
| | [Schema](app/schema.md) | `Settings`, `ExportFileV1`, `DEFAULT_SETTINGS` (4-proxy fallback list led by the Cloudflare Worker), schema IDs |
| **UI** | [App shell](ui/app-shell.md) | `main.tsx` bootstrap, `App.tsx` header/tabs, `format.ts` Intl helpers, `HelpDialog`, `Logo` |
| | [Overview tab](ui/overview.md) | Asset table, sold-assets table, expandable `AssetDetail` (lot editor, sell form, add-asset dialog) |
| | [Performance tab](ui/performance-view.md) | Dual-axis value/TWR chart, per-asset/per-portfolio lines, `viewAll` aggregation, range selection, line toggles, `simplePct` comparison |
| | [Forms & dialogs](ui/forms.md) | `AddAssetForm` (add + edit modes), `SettingsView` (incl. OpenFIGI key), `BackupMenu`, `PortfolioMenu`, `PortfolioDialogs` (add/rename/remove) |
| **Operations** | [Build, test & deploy](operations/build-test-deploy.md) | Vite/tsc scripts, strict `tsconfig`, vitest suite, Playwright e2e + API health checks, GitHub Pages deploy (integration-tests gated), OpenWiki update + wiki-sync workflows |
| | [Self-hosted CORS proxy](operations/cors-proxy.md) | The Cloudflare Worker relay (`worker/cors-proxy.js`): allowlisted hosts, POST forwarding for OpenFIGI, deploy steps |

## Core concepts

- **Time-weighted return (TWR)**: daily returns are chained after subtracting that day's cash flow, so a purchase or a full sale leaves the percentage untouched. Inflows are valued at the same daily close the position is valued at, not at the price paid — the paid-vs-market gap stays in `cost`/`simplePct`. See [Performance & TWR](domain/performance.md).
- **Full-position sale**: an `Asset.sale` records a single completed sale of the whole position; the asset drops out of the held table, its realized P/L shows in a sold-assets table, and the TWR line books the sale price against the last mark-to-market value exactly once. See [Portfolio snapshots](domain/portfolio.md).
- **PriceProvider port**: a `search`/`quote`/`history` interface with four user-selectable adapters (Yahoo via CORS proxy, Twelve Data, EODHD, Alpha Vantage) and two automatic supplementary sources (Börse Frankfurt for ISIN-native quotes, OpenFIGI for ISIN → ticker resolution). See [PriceProvider port](data/price-provider.md).
- **Multi-proxy fallback**: `proxyUrl` is a comma-separated list of CORS-proxy prefixes tried in order until one works, since free public proxies routinely go down or get rate-limited. The default list is led by Fundle's own [Cloudflare Worker](operations/cors-proxy.md), the only relay that can forward OpenFIGI's POST. See [PriceProvider port](data/price-provider.md).
- **Rate-capped providers**: Alpha Vantage's 25 requests/day is too low for periodic polling, so it is listed in `MANUAL_REFRESH_ONLY_PROVIDERS` and the store skips the auto-refresh interval while it is selected. See [PriceProvider port](data/price-provider.md).
- **Import trust boundary**: `parseImport` validates and reconstructs every portfolio/lot/sale field (throwing on bad data) but drops malformed price-cache entries (the cache is disposable). See [Persistence](app/persistence.md).
- **Stateless client-only model**: no server, no account; all state in `localStorage` under `fundle/v1`, with the export format doubling as the on-disk schema. See [Store](app/store.md) and [Schema](app/schema.md).

## Task routing

| Change intent | Page | Source entrypoints/symbols | Focused tests | Validation |
| --- | --- | --- | --- | --- |
| Change TWR math or add a performance invariant | [Performance & TWR](domain/performance.md) | `src/domain/performance.ts` `buildPortfolioSeries` / `saleProceedsUntil` | `src/domain/performance.test.ts` | `npm test` |
| Change snapshot math (cost basis, day change, sold assets) | [Portfolio snapshots](domain/portfolio.md) | `src/domain/portfolio.ts` `portfolioSnapshot` / `soldAssetSnapshot` | `src/domain/portfolio.test.ts` | `npm test` |
| Add or change a sale / sell flow | [Portfolio snapshots](domain/portfolio.md) / [Store](app/store.md) / [Overview](ui/overview.md) | `src/domain/types.ts` `Asset.sale`, `src/app/store.tsx` `sellAsset`, `src/ui/Overview.tsx` `AssetDetail` | `src/domain/portfolio.test.ts`, `src/domain/performance.test.ts` | `npm test` `npm run build` |
| Add a new market-data provider | [PriceProvider port](data/price-provider.md) | `src/data/PriceProvider.ts`, `src/data/index.ts` `PROVIDERS`/`createProvider`/`MANUAL_REFRESH_ONLY_PROVIDERS`, `src/ui/SettingsView.tsx` | `src/data/yahoo.test.ts` (pattern) | `npm test` `npm run typecheck` |
| Change proxy fallback / timeout / POST forwarding | [PriceProvider port](data/price-provider.md) | `src/data/proxy.ts` `fetchJson`/`proxyCandidates` | `src/data/proxy.test.ts` | `npm test` |
| Change Börse Frankfurt lookup / dispatch | [Börse Frankfurt](data/boerse-frankfurt.md) | `src/data/boerseFrankfurt.ts`, `src/data/index.ts` `resolveProvider`, `src/app/store.tsx` `search` | `src/data/boerseFrankfurt.test.ts` | `npm test` |
| Change OpenFIGI ISIN lookup | [OpenFIGI](data/openfigi.md) | `src/data/openfigi.ts`, `src/app/store.tsx` `search` | `src/data/openfigi.test.ts` | `npm test` |
| Change Yahoo/Twelve Data parsing | [Yahoo](data/yahoo.md) / [Twelve Data](data/twelvedata.md) | `src/data/yahoo.ts` / `src/data/twelvedata.ts` | `src/data/yahoo.test.ts` | `npm test` |
| Change EODHD parsing / composite symbol | [EODHD](data/eodhd.md) | `src/data/eodhd.ts` `encodeSymbol`/`decodeSymbol` | `src/data/eodhd.test.ts` | `npm test` |
| Change Alpha Vantage parsing / rate-cap detection | [Alpha Vantage](data/alphavantage.md) | `src/data/alphaVantage.ts` `checkForApiMessage` | `src/data/alphaVantage.test.ts` | `npm test` |
| Change the CORS proxy Worker (allowlist/headers) | [CORS proxy](operations/cors-proxy.md) | `worker/cors-proxy.js` `ALLOWED_HOSTS` | — | `wrangler deploy` (in `worker/`) |
| Edit an asset's entry (symbol/name/ISIN) | [Store](app/store.md) / [Overview](ui/overview.md) / [Forms](ui/forms.md) | `src/app/store.tsx` `updateAsset`, `src/ui/AddAssetForm.tsx` (edit mode) | (none; thin glue) | `npm run build` |
| Rename a portfolio | [Store](app/store.md) / [Forms](ui/forms.md) | `src/app/store.tsx` `renamePortfolio`, `src/ui/PortfolioDialogs.tsx` | (none; thin glue) | `npm run build` |
| Change the store reducer or refresh flow | [Store](app/store.md) | `src/app/store.tsx` `reducer` / `refresh` | (indirect via persistence tests) | `npm test` `npm run typecheck` |
| Change import/export, localStorage schema, or proxy auto-migration | [Persistence](app/persistence.md) / [Schema](app/schema.md) | `src/app/persistence.ts` `parseImport`/`migrateProxyUrl`, `src/app/schema.ts` | `src/app/persistence.test.ts` | `npm test` |
| Change a UI view | [Overview](ui/overview.md) / [Performance](ui/performance-view.md) / [Forms](ui/forms.md) | `src/ui/*.tsx` | (none; thin glue) | `npm run build` |
| Change build, deploy, or CI | [Build, test & deploy](operations/build-test-deploy.md) | `vite.config.ts`, `tsconfig.json`, `.github/workflows/` | — | `npm run build` |

## Running locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest run
npm run build        # tsc -b && vite build -> dist/
npm run preview      # serve the production build
npm run test:e2e     # Playwright smoke (boots preview on :4173)
npm run test:api-health  # connectivity check for every data API host
```

## Backlog

No deferred areas. The repository is fully covered: all four layers (domain, data, app, ui), all six market-data adapters (Yahoo, Twelve Data, EODHD, Alpha Vantage, Börse Frankfurt, OpenFIGI), the multi-proxy fallback (including the self-hosted Cloudflare Worker), the store/persistence/schema (including `updateAsset`, `renamePortfolio`, and the manual-refresh-only skip), every UI view, the PortfolioMenu with rename, and all GitHub workflows (deploy with integration-tests gating, openwiki-update, wiki-sync). The intentionally untested areas are the UI components (thin glue over tested store/domain code) and the Twelve Data adapter (exercises the same tested `proxy.ts` `fetchJson` path as Yahoo).
