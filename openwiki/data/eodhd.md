---
type: data-adapter
title: EODHD Adapter — ISIN-native paid provider
description: A user-selectable PriceProvider backed by EODHD's paid API — ISIN-native search across US, European and Irish/Luxembourg funds/ETFs, routed through the CORS proxy, encoding currency into a TICKER.EXCHANGE@CCY composite symbol.
tags: [data, eodhd, adapter, market-data, isin]
---

# EODHD Adapter (`src/data/eodhd.ts`)

A **user-selectable** [PriceProvider](price-provider.md) (`providerId: 'eodhd'`). EODHD is a paid service (from about €20/month; 100k calls/day on every paid tier) whose search is genuinely ISIN-native and covers mutual funds and ETFs across Ireland, Luxembourg, France, Germany and the US — the coverage gap Yahoo and Twelve Data leave open. Like Yahoo and [Börse Frankfurt](boerse-frankfurt.md) it sends no CORS header, so every call is routed through the [multi-proxy fallback list](price-provider.md#cors-proxy-and-timeout-srcdataproxyts).

The factory:

```ts
createEodhdProvider(opts: { apiKey: string; proxyUrl: string }): PriceProvider
```

`requireApiKey()` throws `PriceProviderError('EODHD API key missing')` at the start of every method. `withKey(url)` appends `api_token=` and `fmt=json` to the URL.

## Composite symbol: `TICKER.EXCHANGE@CCY`

EODHD's quote/history endpoints take a `TICKER.EXCHANGE` symbol (its own exchange codes, e.g. `MCD.US`, `VWRD.LSE`) and **never return a currency field** outside of search. To avoid a second request per quote, the currency that search resolves is encoded into an opaque composite symbol `TICKER.EXCHANGE@CCY` (e.g. `MCD.US@USD`) — the same trick [Börse Frankfurt](boerse-frankfurt.md) uses for `ISIN@MIC`. The `@CCY` suffix (a 3-letter currency code) is what distinguishes an EODHD symbol from a BF `ISIN@MIC` (4-letter MIC).

- `encodeSymbol(ticker, currency)` → `` `${ticker}@${currency}` ``
- `decodeSymbol(symbol)` → `{ ticker, currency }`, throwing `PriceProviderError` if the symbol does not match `/^(.+)@([A-Z]{3})$/`.
- `isEodhdSymbol(symbol)` — exported predicate matching the same regex, used to tell an EODHD composite apart from a BF `ISIN@MIC` (the BF MIC is 4 letters, the EODHD currency is 3).

## `search(query)`

Calls `https://eodhd.com/api/search/{query}?api_token=...&fmt=json`, maps each hit to a `SearchResult`, **dropping hits missing `Code`, `Exchange` or `Currency`**:

```ts
{ symbol: `${Code}.${Exchange}@${Currency}`, name: Name ?? Code, isin: ISIN, currency: Currency, exchange: Exchange }
```

## `quote(symbol)`

Decodes the ticker/currency, calls `https://eodhd.com/api/real-time/{ticker}?api_token=...&fmt=json`. Throws `PriceProviderError` if `close` or `previousClose` is undefined. Builds a `Quote`:

- `price` ← `data.close`
- `previousClose` ← `data.previousClose`
- `currency` ← the currency decoded from the symbol (the endpoint returns none)
- `time` ← `(data.timestamp ?? floor(now/1000)) * 1000` (EODHD returns seconds; the domain `Quote.time` is milliseconds)

## `history(symbol, from)`

Calls `https://eodhd.com/api/eod/{ticker}?from={from}&api_token=...&fmt=json`. Maps `EodhdEodPoint[]` to points:

- Prefers `adjusted_close` and falls back to `close` (split/dividend-adjusted closes keep the [TWR](../domain/performance.md) free of false jumps, like Yahoo's `adjclose`).
- Skips rows missing both `adjusted_close` and `close`, or missing a string `date`.

Returns `{ symbol, points }` (EODHD already returns ascending daily bars).

## How it plugs in

`createProvider` in [`index.ts`](price-provider.md#factory-and-registry-srcdataindexts) branches on `providerId === 'eodhd'`. It is listed in `PROVIDERS` with `needsApiKey: true, needsProxy: true`, so the [SettingsView](../ui/forms.md#settingsviewtsx) shows both an API-key field and a proxy field when it is selected. The store's [search](../app/store.md#appactions-the-ui-surface) does **not** call EODHD as a supplement — it is primary-only.

## Focused tests (`src/data/eodhd.test.ts`)

Uses `vi.stubGlobal('fetch', ...)` (no network) and `afterEach` unstubbing:

- **`isEodhdSymbol`**: accepts `VWRD.LSE@USD` / `MCD.US@USD`; rejects `EUNL.DE`, `AAPL`, and the BF `DE000A0H0728@XETR` (4-letter MIC, not a 3-letter currency).
- **API key**: every method rejects with `PriceProviderError` when the key is blank, without hitting the network.
- **search**: encodes `TICKER.EXCHANGE@CCY`; drops hits missing required fields.
- **quote**: decodes currency from the symbol; converts the timestamp to ms; rejects a non-composite symbol; throws when the response has no price data.
- **history**: prefers `adjusted_close`, falls back to `close`, skips rows missing both.

Run with `npm test`.
