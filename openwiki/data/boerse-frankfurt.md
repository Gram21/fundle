---
type: data-adapter
title: Börse Frankfurt Adapter — ISIN-native supplementary quotes
description: A supplementary PriceProvider that supplies live EUR quotes for Deutsche Börse Group instruments via the quote_box API, encoded as ISIN@MIC symbols and auto-routed by resolveProvider; history falls back to Yahoo's ISIN search.
tags: [data, boerse-frankfurt, adapter, market-data, isin]
---

# Börse Frankfurt Adapter (`src/data/boerseFrankfurt.ts`)

A **supplementary** [PriceProvider](price-provider.md) — not one the user picks in Settings, but one that runs *alongside* the primary provider so an ISIN search can find instruments the primary provider misses. It is ISIN-native: the quote endpoint takes an ISIN and a market identifier code (MIC), so there is no symbol-resolution step and no API key.

## Why it exists

The primary providers (Yahoo, Twelve Data) cover most instruments, but some European ETFs/stocks resolve poorly or not at all through their free search endpoints. Börse Frankfurt's public `quote_box/single` endpoint answers directly from an ISIN, which is exactly what an investor holding a German-listed instrument already has. The adapter covers Xetra (`XETR`) and the Frankfurt floor (`XFRA`) — the only markets this API recognises. Other German exchanges (e.g. Stuttgart/XSTU) belong to different operators and 400 on this endpoint.

The endpoint has **no public search or history path** (every plausible search/history URL returns an empty `{}` or a 400), so this provider only ever supplies live quotes. History is delegated to [Yahoo's](yahoo.md) own ISIN search — the best free source available — and returns an empty series when Yahoo has no match either.

## Symbol encoding

A BF-resolved symbol is encoded as `ISIN@MIC` (e.g. `DE000A0H0728@XETR`):

- `isBoerseFrankfurtSymbol(symbol)` — matches the `ISIN@MIC` shape via `/^([A-Z]{2}[A-Z0-9]{9}\d)@([A-Z]{4})$/`.
- `parseSymbol(symbol)` — extracts `{ isin, mic }`.

This composite form is what makes the per-symbol dispatch in [`resolveProvider`](price-provider.md#factory-and-registry-srcdataindexts) work: any `ISIN@MIC` symbol always routes here, regardless of the user's chosen primary provider.

## Factory

```ts
createBoerseFrankfurtProvider(opts: { proxyUrl: string }): PriceProvider
```

Reuses `proxyUrl` for the (keyless) quote endpoint. It also constructs an internal [Yahoo](yahoo.md) provider, used *only* for the `history()` fallback — never for `search()`/`quote()`, which stay BF-native.

## `search(query)`

If the query is not a valid ISIN (`/^[A-Z]{2}[A-Z0-9]{9}\d$/`), returns `[]` without touching the network. Otherwise it probes both MICS (`XETR`, `XFRA`) in parallel via `fetchQuoteBox(isin, mic)` and returns one `SearchResult` per MIC that actually has a quote:

```ts
{ symbol: `${isin}@${mic}`, name: isin, isin, currency: 'EUR', exchange: mic }
```

A 400 (ISIN not traded on that MIC) or an empty/unparseable body both mean "not here" — `fetchQuoteBox` swallows those as `undefined` rather than surfacing an error.

## `quote(symbol)`

Parses `ISIN@MIC`, fetches the quote box, and throws `PriceProviderError` if the symbol isn't a BF composite or the box has no `lastPrice`. Builds a `Quote`:

- `price` ← `lastPrice`
- `previousClose` ← `lastPrice - (changeToPrevDayAbsolute ?? 0)` (the API gives the absolute day change, not the previous close directly)
- `currency` ← `'EUR'` (Deutsche Börse Group markets quote in EUR regardless of the instrument's home market; the API carries no per-instrument currency field)
- `time` ← `Date.parse(timestampLastPrice ?? timestamp ?? '') || Date.now()`

## `history(symbol, from)`

There is no BF history endpoint. Instead it searches Yahoo by the ISIN, takes the first match, and calls Yahoo's `history(symbol, from)`, returning `{ symbol, points }` (the original `ISIN@MIC` symbol is preserved so the result keys correctly). If Yahoo search finds nothing, or any step fails, it returns `{ symbol, points: [] }` rather than throwing — so a BF-only instrument simply has an empty chart rather than a failing refresh.

## How it plugs in

The store's `search` action runs the primary provider and BF in parallel (`Promise.allSettled`), then merges results, **deduplicating by ISIN** — a BF hit whose ISIN the primary provider already returned is dropped, so the user never sees two rows for one instrument. The store's `refresh` uses [`resolveProvider`](price-provider.md#factory-and-registry-srcdataindexts) per symbol, so a `ISIN@MIC` symbol routes here automatically while every other symbol goes through the primary provider. See [Store](../app/store.md).

Because BF is a *supplementary* source (not user-selectable), it is intentionally **not** listed in the `PROVIDERS` registry that `SettingsView` renders — adding a supplementary provider does not require a `PROVIDERS` entry, only the per-symbol dispatch in `resolveProvider`.

## Focused tests (`src/data/boerseFrankfurt.test.ts`)

Uses `vi.stubGlobal('fetch', ...)` (no network) and `afterEach` unstubbing:

- **`isBoerseFrankfurtSymbol`**: accepts `DE000A0H0728@XETR`/`@XFRA`; rejects `EUNL.DE`, `AAPL`, and a bare ISIN.
- **`search`**: a non-ISIN query returns `[]` without a network call; one EUR hit per MIC that has a quote; a 400 is treated as "no hit".
- **`quote`**: derives `previousClose` from `lastPrice - changeToPrevDayAbsolute`, currency `EUR`; rejects a non-composite symbol; throws when the MIC has no data.
- **`history`**: delegates to a Yahoo symbol found via ISIN search; returns an empty series (not a throw) when Yahoo has no match.

Run with `npm test`.
