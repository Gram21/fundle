---
type: data-adapter
title: OpenFIGI Adapter — supplementary ISIN resolver
description: A supplementary PriceProvider that maps an ISIN to a Yahoo-compatible ticker via OpenFIGI's free POST mapping endpoint, then delegates quote/history to Yahoo. It is auto-merged into search results alongside the primary provider and Börse Frankfurt, and needs a custom CORS proxy that forwards POST bodies.
tags: [data, openfigi, adapter, market-data, isin, supplement]
---

# OpenFIGI Adapter (`src/data/openfigi.ts`)

A **supplementary** [PriceProvider](price-provider.md) — not one the user picks in Settings, but one that runs *alongside* the primary provider and [Börse Frankfurt](boerse-frankfurt.md) during search, so an ISIN that none of them resolve directly can still turn up a match. OpenFIGI (Bloomberg's free financial instrument global identifier database) is the most complete free ISIN resolver available, but it only maps an ISIN to a ticker/exchange — it carries **no price data at all**. So `search()` resolves the ISIN and hands back a plain, Yahoo-compatible symbol; `quote()`/`history()` delegate straight to [Yahoo](yahoo.md). Once resolved, the stored symbol is indistinguishable from one a user typed directly — no special per-symbol dispatch is needed afterwards, unlike BF (`ISIN@MIC`) or [EODHD](eodhd.md) (`TICKER.EXCHANGE@CCY`) which encode extra state into the symbol.

The factory:

```ts
createOpenFigiProvider(opts: { apiKey?: string; proxyUrl: string }): PriceProvider
```

Constructs an internal [Yahoo](yahoo.md) provider (using the same `proxyUrl`) for `quote`/`history` delegation.

## `search(query)`

If the query is not a valid ISIN (`/^[A-Z]{2}[A-Z0-9]{9}\d$/`), returns `[]` without touching the network. Otherwise it POSTs to OpenFIGI's mapping endpoint:

```ts
fetchJson('https://api.openfigi.com/v3/mapping', opts.proxyUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-OPENFIGI-APIKEY': apiKey } : {}) },
  body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
})
```

The optional API key (stored under `settings.apiKeys.openfigi`) is sent in the `X-OPENFIGI-APIKEY` header and only raises OpenFIGI's rate limit — it is not required.

### Exchange → Yahoo suffix mapping

OpenFIGI returns a `ticker` and an `exchCode`. `EXCH_TO_YAHOO_SUFFIX` maps the common codes to the Yahoo Finance exchange suffix (e.g. `US` → bare ticker, `GR`/`GY` → `.DE`, `LN` → `.L`, `PA` → `.PA`). Unmapped codes are **dropped** rather than guessed — a wrong Yahoo symbol would fail harmlessly anyway, but dropping avoids offering a hit that can't be priced. Hits are deduplicated by the resulting Yahoo symbol.

Each surviving hit becomes `{ symbol: `${ticker}${suffix}`, name, isin, exchange: exchCode }`.

### POST requires a custom proxy

The mapping endpoint is **POST-only with a JSON body**, which none of the free public GET-only CORS proxies can relay. If the request fails (no custom proxy configured, or OpenFIGI unreachable), `search` returns `[]` rather than throwing — this is an automatic supplement, not something the user explicitly chose, so it fails quiet like BF's search does. To make OpenFIGI work reliably, deploy the self-hosted [CORS proxy Worker](../operations/cors-proxy.md) and put its URL first in the proxy fallback list.

## `quote(symbol)` / `history(symbol, from)`

Delegate directly to the internal Yahoo provider — a resolved OpenFIGI symbol is a plain Yahoo ticker. No composite decoding is needed.

## How it plugs in

The store's [search](../app/store.md#appactions-the-ui-surface) action runs the primary provider, BF, and OpenFIGI in parallel (`Promise.allSettled`), then merges results, **deduplicating by ISIN then by exact symbol** — a FIGI hit whose ISIN or symbol an earlier source already returned is dropped. OpenFIGI is **not** listed in `PROVIDERS` (it is not user-selectable) and **not** in `resolveProvider` (resolved symbols are plain Yahoo tickers, so they route through the primary provider like any other). Adding it required only the `search` wiring in the store and the `fetchJson` `RequestInit` parameter in [proxy.ts](price-provider.md#cors-proxy-and-timeout-srcdataproxyts) to forward the POST method/body/headers.

## Focused tests (`src/data/openfigi.test.ts`)

Uses `vi.stubGlobal('fetch', ...)` (no network) and `afterEach` unstubbing:

- **search**: a non-ISIN query returns `[]` without a network call; POSTs a mapping request with the ISIN body; maps a US hit to a bare Yahoo ticker (`NVDA`); maps a German exchange hit to `.DE` (`SAP.DE`); sends the `X-OPENFIGI-APIKEY` header when a key is configured; drops hits on an unmapped exchange; deduplicates hits resolving to the same Yahoo symbol; returns `[]` (not a throw) when the request fails.
- **quote/history**: delegate to Yahoo since a resolved symbol is a plain Yahoo ticker.

Run with `npm test`.
