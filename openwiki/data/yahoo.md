---
type: data-adapter
title: Yahoo Finance Adapter
description: The default PriceProvider adapter — search, quote and history via the Yahoo Finance chart API, all routed through a CORS proxy, with adjclose preference and null-skip deduplication.
tags: [data, yahoo, adapter, market-data]
---

# Yahoo Finance Adapter (`src/data/yahoo.ts`)

<!-- openwiki: broken internal link [price-provider.md#cors-proxy-and-timeout] heading anchor "cors-proxy-and-timeout" does not exist in "price-provider.md". Fix the href or restore the target, then delete this comment. -->
The default provider (`providerId: 'yahoo'`). Yahoo Finance needs no API key but sends no CORS header, so **every call goes through the [proxy](price-provider.md#cors-proxy-and-timeout)**. One chart request conveniently returns price, previous close and the daily series.

The factory:

```ts
createYahooProvider(opts: { proxyUrl: string }): PriceProvider
```

## `search(query)`

Calls `https://query1.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`, maps `data.quotes` to `SearchResult` (dropping entries without a `symbol`), preferring `shortname` over `longname` for the display name. German WKNs usually do not resolve via this endpoint — the UI nudges users toward the ISIN or typing the symbol directly (e.g. `EUNL.DE`).

## `quote(symbol)`

Calls the chart endpoint with `range=5d&interval=1d`:

```
https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d
```

Reads `chart.result[0].meta` and builds a `Quote`:

- `price` ← `meta.regularMarketPrice`
- `previousClose` ← `meta.previousClose ?? meta.chartPreviousClose` (**prefers `previousClose` when both are present**)
- `currency` ← `meta.currency`
- `time` ← `meta.regularMarketTime * 1000` (Yahoo returns seconds; the domain `Quote.time` is milliseconds)

Throws `PriceProviderError` if `meta` is missing (attaching `chart.error.description` when present) or if any of `regularMarketPrice`, `currency`, `regularMarketTime`, `previousClose` is undefined.

## `history(symbol, from)`

Calls the chart endpoint with `period1`/`period2` epoch seconds:

```
https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={fromEpoch}&period2={nowEpoch}&interval=1d
```

Builds the `PriceSeries`:

- For each `timestamp[i]`, prefers `indicators.adjclose[0].adjclose[i]` and falls back to `indicators.quote[0].close[i]`. **Dividend-adjusted closes** are preferred so splits/dividends don't create false price jumps in the [TWR](../domain/performance.md).
- Skips `null`/`undefined` closes.
- Deduplicates by date via a `Map` (timestamps can repeat or arrive out of order).
- Converts epoch-ms to `'YYYY-MM-DD'` via `new Date(epochMs).toISOString().slice(0, 10)`.
- Sorts ascending by date.

Returns `{ symbol, points }` ascending.

## Focused tests (`src/data/yahoo.test.ts`)

Uses `vi.stubGlobal('fetch', ...)` to stub responses (no network) and `afterEach` unstubbing. Asserts:

- **`proxied`**: blank/whitespace proxy passes URL unchanged; non-blank encodes the target exactly once.
- **`fetchJson`**: an HTML body (dead proxy) throws `PriceProviderError`, not raw `SyntaxError`; a non-ok `429` throws `PriceProviderError`.
- **`yahoo quote`**: parses a minimal chart payload (`chartPreviousClose` used when `previousClose` absent); `previousClose` wins when both present; `regularMarketTime` converted seconds→ms.
- **`yahoo history`**: timestamps arriving out of order (`[day3, day1, day2]`) with a `null` adjclose at `day2` (falls back to `quote.close`) produces ascending, deduplicated, `YYYY-MM-DD`-formatted points.
- **`yahoo search`**: drops entries lacking a `symbol`, maps `shortname`/`longname`.

Run with `npm test`.
