---
type: data-adapter
title: Alpha Vantage Adapter — free, rate-capped provider
description: A user-selectable PriceProvider backed by Alpha Vantage's free API — native CORS, 25 requests/day cap, rate-limit body detection, and manual-refresh-only scheduling so the auto-refresh interval is disabled while it is selected.
tags: [data, alphavantage, adapter, market-data, rate-limit]
---

# Alpha Vantage Adapter (`src/data/alphaVantage.ts`)

A **user-selectable** [PriceProvider](price-provider.md) (`providerId: 'alphavantage'`). Alpha Vantage has a free tier with native CORS (no proxy needed — `fetchJson` is called with `proxyUrl: ''`), but it is capped at **25 requests/day total** across every endpoint. That is far too little for periodic polling, so the [store](../app/store.md#effects-and-lifecycle) skips the auto-refresh interval entirely while Alpha Vantage is selected (see `MANUAL_REFRESH_ONLY_PROVIDERS`); only the initial load and the manual **↻** Update button call `refresh()`.

The factory:

```ts
createAlphaVantageProvider(opts: { apiKey: string }): PriceProvider
```

`requireApiKey()` throws `PriceProviderError('Alpha Vantage API key missing')` at the start of every method. `url(params)` builds `https://www.alphavantage.co/query?{...params}&apikey={key}`.

## Rate-limit / daily-cap detection

A spent quota or rate limit comes back as **HTTP 200 with an informational body** instead of a real error status, so a naive adapter would surface empty data instead of a clear failure. `checkForApiMessage(data)` inspects every response for an `Information`, `Note`, or `Error Message` string field and throws `PriceProviderError('Alpha Vantage: {message}')`. This catches both the demo-key message and the older `Note: ... 25 requests per day` rate-limit shape.

## `search(query)`

Calls `function=SYMBOL_SEARCH&keywords={query}`, maps `data.bestMatches` to `SearchResult` (dropping entries without a `1. symbol`), using `2. name` (falling back to the symbol), `8. currency`, and `4. region` (as `exchange`).

## `quote(symbol)`

Calls `function=GLOBAL_QUOTE&symbol={symbol}`. Parses the `Global Quote` object (all values are strings, coerced with `Number(...)`):

- `price` ← `Number('05. price')`
- `previousClose` ← `Number('08. previous close')`
- `currency` ← `'USD'` — the quote endpoint reports no currency; `USD` is a reasonable placeholder given Alpha Vantage's catalogue is overwhelmingly US-listed tickers. (The app formats with the asset's own currency, so this is not user-visible.)
- `time` ← `Date.parse('07. latest trading day') || Date.now()`

Throws `PriceProviderError` if `Global Quote` is missing or the price/previousClose are non-finite.

## `history(symbol, from)`

Calls `function=TIME_SERIES_DAILY&symbol={symbol}&outputsize=compact`. The free tier only supports `compact` (last ~100 trading days); "full" history needs a premium key — good enough for "what's this done recently", not a multi-year buy-and-hold chart. Upgrade path: `outputsize=full` on a paid key.

Maps `Time Series (Daily)` entries to `{ date, close: Number('4. close') }`, **filters by `from`-date**, and sorts ascending (the API returns newest-first).

## How it plugs in

`createProvider` in [`index.ts`](price-provider.md#factory-and-registry-srcdataindexts) branches on `providerId === 'alphavantage'`. It is listed in `PROVIDERS` with `needsApiKey: true, needsProxy: false`, so the [SettingsView](../ui/forms.md#settingsviewtsx) shows only an API-key field. Its id is the sole member of `MANUAL_REFRESH_ONLY_PROVIDERS`, which the store's interval effect checks to skip auto-refresh.

## Focused tests (`src/data/alphaVantage.test.ts`)

Uses `vi.stubGlobal('fetch', ...)` (no network) and `afterEach` unstubbing:

- **API key**: every method rejects with `PriceProviderError` when the key is blank, without hitting the network.
- **Rate-limit detection**: an `Information` body (HTTP 200) is treated as a real failure (`/demo/`), not empty data; the older `Note` shape is also caught (`/25 requests per day/`).
- **quote**: parses price/previousClose and the trading-day timestamp; throws when `Global Quote` is missing/empty.
- **history**: parses the daily series, filters by `from`-date, sorts ascending.
- **search**: maps `bestMatches`, drops entries missing a symbol.

Run with `npm test`.
