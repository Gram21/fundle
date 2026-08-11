---
type: data-adapter
title: Twelve Data Adapter
description: The API-key PriceProvider adapter — native CORS, no proxy, with search/quote/history endpoints and error-response detection.
tags: [data, twelvedata, adapter, market-data]
---

# Twelve Data Adapter (`src/data/twelvedata.ts`)

The alternative provider (`providerId: 'twelvedata'`). Unlike [Yahoo](yahoo.md), Twelve Data sends `Access-Control-Allow-Origin: *`, so it works **without a CORS proxy** — `fetchJson` is called with `proxyUrl: ''`, which `proxied` treats as a pass-through. It requires a free-tier API key.

The factory:

```ts
createTwelveDataProvider(opts: { apiKey: string }): PriceProvider
```

`requireApiKey()` throws `PriceProviderError('Twelve Data API key missing')` if `opts.apiKey.trim() === ''`, called at the start of `search`, `quote`, and `history`. Note: `search` calls the symbol-search endpoint **without** the API key in the URL (it is a public endpoint), but still guards on a configured key for consistency.

## `search(query)`

Calls `https://api.twelvedata.com/symbol_search?symbol={query}&outputsize=10`, maps `data.data` to `SearchResult` (dropping entries without `symbol`), using `instrument_name` for the display name.

## `quote(symbol)`

Calls `https://api.twelvedata.com/quote?symbol={symbol}&apikey={apiKey}`. Twelve Data returns close/previous_close/timestamp as **strings**, so the adapter coerces with `Number(...)`:

- `price` ← `Number(data.close)`
- `previousClose` ← `Number(data.previous_close)`
- `currency` ← `data.currency ?? ''`
- `time` ← `Number(data.timestamp) * 1000` (seconds → ms)

## `history(symbol, from)`

Calls `https://api.twelvedata.com/time_series?symbol={symbol}&interval=1day&start_date={from}&outputsize=5000&apikey={apiKey}`. Maps `data.values` (each `{ datetime, close }` as strings) to `{ date: datetime.slice(0,10), close: Number(close) }` and **reverses** the array (Twelve Data returns newest-first; the domain expects ascending). `outputsize=5000` covers ~20 years of daily bars.

## Error detection

`isErrorResponse(data)` checks for `{ status: 'error' }` and throws `PriceProviderError(data.message ?? '... failed')` for search/quote/history. The API returns this shape on bad symbols, rate limits, and invalid keys.

## Tests

There is no dedicated `twelvedata.test.ts`. Its network path goes through the shared, tested `fetchJson` (see [Yahoo tests](yahoo.md#focused-tests-srcdatayahootestts)), and its error-detection and string-coercion logic is straightforward. The store's `Promise.allSettled` attributes any thrown `PriceProviderError` to the symbol in the `failed` list. Run the data-layer suite with `npm test`.
