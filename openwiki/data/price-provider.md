---
type: data-port
title: PriceProvider Port and Provider Registry
description: The PriceProvider interface (search/quote/history), PriceProviderError, the createProvider factory and PROVIDERS registry, and the CORS proxy/timeout helper used by both adapters.
tags: [data, provider, port, proxy]
---

# PriceProvider Port (`src/data/`)

The data layer isolates market-data IO behind a port so the [store](../app/store.md) depends on an interface, not a concrete API. Swapping in another market-data API means writing one more `PriceProvider` adapter.

## The port (`src/data/PriceProvider.ts`)

```ts
interface PriceProvider {
  readonly id: string
  readonly label: string
  search(query: string): Promise<SearchResult[]>
  quote(symbol: string): Promise<Quote>
  history(symbol: string, from: ISODate): Promise<PriceSeries>
}
```

- `search` resolves a free-text query, ISIN or WKN into candidate symbols.
- `quote` returns the current `Quote` (price, previousClose, currency, time).
- `history` returns daily closes from `from` (inclusive) to today.

### `SearchResult`

`{ symbol, name, isin?, currency?, exchange? }` — `isin` is optional and currently only Yahoo surfaces it indirectly via the search endpoint; most results carry `symbol`, `name`, `currency`, `exchange`.

### `PriceProviderError`

<!-- openwiki: broken internal link [#cors-proxy-and-timeout] heading anchor "cors-proxy-and-timeout" does not exist in /openwiki/data/price-provider.md. Fix the href or restore the target, then delete this comment. -->
All adapter failures throw `PriceProviderError` (extends `Error` with a `cause`), never raw `SyntaxError`/`TypeError`. This lets the store's `Promise.allSettled` uniformly attribute failures to symbols. The [proxy helper](#cors-proxy-and-timeout) wraps network/parse failures into this type.

## Factory and registry (`src/data/index.ts`)

```ts
function createProvider(settings: Pick<Settings, 'providerId' | 'proxyUrl' | 'apiKeys'>): PriceProvider
```

Selects on `settings.providerId`:

- `'twelvedata'` → `createTwelveDataProvider({ apiKey: settings.apiKeys.twelvedata ?? '' })`
- otherwise (default `'yahoo'`) → `createYahooProvider({ proxyUrl: settings.proxyUrl })`

`PROVIDERS` is a static registry the [SettingsView](../ui/forms.md) renders from:

```ts
[
  { id: 'yahoo',      label: 'Yahoo Finance (via CORS proxy)', needsApiKey: false, needsProxy: true },
  { id: 'twelvedata', label: 'Twelve Data (API key)',          needsApiKey: true,  needsProxy: false },
]
```

`needsApiKey` / `needsProxy` drive which input fields the settings form shows for the selected provider.

## CORS proxy and timeout (`src/data/proxy.ts`)

Yahoo Finance sends no `Access-Control-Allow-Origin` header, so browser requests to it are blocked. The proxy module wraps every Yahoo fetch.

### `proxied(url, proxyUrl)`

Returns `url` unchanged when `proxyUrl` is blank/whitespace, otherwise `proxyUrl.trim() + encodeURIComponent(url)` — the target is URL-encoded exactly once. Default proxy prefix is `https://corsproxy.io/?url=` (configurable in Settings).

### `fetchJson<T>(url, proxyUrl): Promise<T>`

Fetches `proxied(url, proxyUrl)` with `AbortSignal.timeout(15_000)` (15 s), reads the body as text, and:

- on a `TimeoutError` throws `PriceProviderError` with a hint pointing at the proxy setting ("the CORS proxy may be down, try another one in Settings");
- on any other fetch failure throws `PriceProviderError` ("check the CORS proxy setting");
- on a non-`ok` response throws `PriceProviderError` with `HTTP {status}: {first 200 chars}`;
- on a JSON parse failure throws `PriceProviderError` ("proxy likely returned HTML") with the first 200 chars — a dead proxy commonly returns an HTML error page.

The 15 s timeout exists because a public CORS proxy that has gone down tends to **hang** rather than refuse.

## Extension point: adding a new provider

1. Implement `PriceProvider` in a new adapter file under `src/data/` (e.g. `myprovider.ts`), exporting a `createMyProvider(opts)` factory. Reuse `fetchJson` from `proxy.ts` for network/parse-error normalization.
2. Register it in `index.ts`: add a branch to `createProvider` keyed on a new `providerId`, and add a `{ id, label, needsApiKey, needsProxy }` entry to `PROVIDERS`.
3. If it needs an API key, store it under `settings.apiKeys[providerId]` (the [schema](../app/schema.md) `apiKeys` is a `Record<string, string>`, so no type change is needed).
4. The [SettingsView](../ui/forms.md) form and the store's refresh wiring pick it up automatically — no store changes required.

## Focused tests

- `src/data/yahoo.test.ts` covers `proxied` (blank vs non-blank, single encoding), `fetchJson` (HTML-body parse error → `PriceProviderError`, non-ok HTTP → `PriceProviderError`), and the Yahoo adapter parsing. The Twelve Data adapter has no dedicated test file; its network path goes through the same tested `fetchJson`. Run with `npm test`.
