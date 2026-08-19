---
type: app-schema
title: Settings and Export Schema
description: The Settings interface, DEFAULT_SETTINGS, the ExportFileV1 document shape, and the fundle/v1 / fin-tracker/v1 schema ids.
tags: [app, schema, settings, config]
---

# Settings and Export Schema (`src/app/schema.ts`)

`schema.ts` defines the persisted configuration and the export/import document contract. It is a leaf module — only type imports from `domain/types`.

## `Settings`

```ts
interface Settings {
  providerId: string       // PriceProvider.id of the active adapter
  proxyUrl: string         // CORS proxy prefix; target URL appended URL-encoded
  apiKeys: Record<string, string>  // per-provider API keys, keyed by PriceProvider.id
  refreshMinutes: number   // auto-refresh interval (clamped 1-120 on import)
  baseCurrency: string     // label for chart axes; no FX conversion is performed
}
```

- `providerId` selects the adapter in [`createProvider`](../data/price-provider.md#factory-and-registry-srcdataindexts). Current values: `'yahoo'` (default), `'twelvedata'`, `'eodhd'` (paid), `'alphavantage'` (free, rate-capped). The [Börse Frankfurt](../data/boerse-frankfurt.md) and [OpenFIGI](../data/openfigi.md) adapters are supplementary sources, not user-selectable, so they have no `providerId` and no `PROVIDERS` entry.
- `proxyUrl` is only used by the CORS-proxy adapters (Yahoo, Börse Frankfurt, EODHD); blank means "no proxy". It is a **comma-separated list of fallback prefixes** tried in order (see [proxy helper](../data/price-provider.md#cors-proxy-and-timeout-srcdataproxyts)). Default is a 4-entry list led by Fundle's own [Cloudflare Worker](../operations/cors-proxy.md).
- `apiKeys` is an open record so adding a provider needs no type change; Twelve Data reads `apiKeys.twelvedata`, EODHD `apiKeys.eodhd`, Alpha Vantage `apiKeys.alphavantage`, OpenFIGI `apiKeys.openfigi` (optional).
- `baseCurrency` labels the PerformanceView value axis and is **not** used to convert amounts — there is no FX conversion, so mixing currencies inside one portfolio mixes units.

## `DEFAULT_SETTINGS`

```ts
{
  providerId: 'yahoo',
  proxyUrl: 'https://fundle-cors-proxy.gram21.workers.dev/?url=,https://api.allorigins.win/raw?url=,https://api.cors.lol/?url=,https://api.codetabs.com/v1/proxy?quest=',
  apiKeys: {},
  refreshMinutes: 5,
  baseCurrency: 'EUR',
}
```

The `proxyUrl` default is a 4-entry fallback list led by Fundle's own [Cloudflare Worker](../operations/cors-proxy.md) (reliable and the only way to relay OpenFIGI's `POST`), then three public proxies as fallback. Free CORS proxies are unreliable individually — each is tried in order per request, stopping at the first that works. [persistence](persistence.md) auto-upgrades a persisted value that matches a known-obsolete past default (see `migrateProxyUrl` / `OBSOLETE_PROXY_URLS`, which now includes the previous 3-entry public-only default).

The store's `buildInitialState` uses this when there is no persisted state; `mergeSettings` in [persistence](persistence.md) spreads imported settings over it.

## `ExportFileV1`

```ts
interface ExportFileV1 {
  schema: 'fundle/v1'
  exportedAt: string          // ISO timestamp
  portfolios: Portfolio[]
  settings: Settings
  quotes?: Record<string, Quote>     // optional: last fetched prices
  history?: Record<string, PriceSeries>
}
```

`quotes`/`history` are optional so older exports and hand-edited files still import (a missing cache just means the next refresh fetches it). This is the on-disk shape for both the JSON export file and `localStorage`.

## Schema ids

- `SCHEMA_ID = 'fundle/v1'` — current.
- `LEGACY_SCHEMA_ID = 'fin-tracker/v1'` — accepted on import (see [persistence](persistence.md#storage-keys-and-legacy-migration)) for files created before the rename.

## Focused tests

The schema constants and defaults are exercised by `src/app/persistence.test.ts` (round-trip, legacy schema acceptance, settings merge, `refreshMinutes` clamping). Run with `npm test`.
