---
type: data-port
title: PriceProvider Port and Provider Registry
description: The PriceProvider interface (search/quote/history), PriceProviderError, the createProvider factory, resolveProvider per-symbol dispatch, the PROVIDERS registry, and the multi-proxy CORS fallback helper used by the adapters.
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

`{ symbol, name, isin?, currency?, exchange? }` — `isin` is optional; Yahoo surfaces it indirectly via its search endpoint, while the [Börse Frankfurt](boerse-frankfurt.md) adapter always sets it (its symbols *are* ISIN-based).

### `PriceProviderError`

All adapter failures throw `PriceProviderError` (extends `Error` with a `cause`), never raw `SyntaxError`/`TypeError`. This lets the store's `Promise.allSettled` uniformly attribute failures to symbols. The [proxy helper](#cors-proxy-and-timeout-srcdataproxyts) wraps network/parse failures into this type.

## Factory and registry (`src/data/index.ts`)

```ts
function createProvider(settings: Pick<Settings, 'providerId' | 'proxyUrl' | 'apiKeys'>): PriceProvider
```

Selects on `settings.providerId`:

- `'twelvedata'` → `createTwelveDataProvider({ apiKey: settings.apiKeys.twelvedata ?? '' })`
- `'eodhd'` → `createEodhdProvider({ apiKey: settings.apiKeys.eodhd ?? '', proxyUrl: settings.proxyUrl })` (see [EODHD](eodhd.md))
- `'alphavantage'` → `createAlphaVantageProvider({ apiKey: settings.apiKeys.alphavantage ?? '' })` (see [Alpha Vantage](alphavantage.md))
- otherwise (default `'yahoo'`) → `createYahooProvider({ proxyUrl: settings.proxyUrl })`

### `resolveProvider` — per-symbol supplementary dispatch

```ts
function resolveProvider(symbol: string, settings): PriceProvider
```

Not every provider is user-selectable. The [Börse Frankfurt](boerse-frankfurt.md) adapter is an automatic *supplementary* source: any symbol that matches its `ISIN@MIC` composite form (`isBoerseFrankfurtSymbol`) always routes there, no matter which provider is selected as primary. Every other symbol goes through `createProvider` as before. The store's `refresh` calls `resolveProvider(symbol, settings)` per symbol; its `search` action constructs the BF provider and the [OpenFIGI](openfigi.md) provider directly to merge results alongside the primary.

### `PROVIDERS` registry

`PROVIDERS` is the static list the [SettingsView](../ui/forms.md) renders from — only the *user-selectable* providers appear here:

```ts
[
  { id: 'yahoo',       label: 'Yahoo Finance (via CORS proxy)',                    needsApiKey: false, needsProxy: true },
  { id: 'twelvedata',  label: 'Twelve Data (API key)',                             needsApiKey: true,  needsProxy: false },
  { id: 'eodhd',       label: 'EODHD (API key, paid, best ISIN/fund coverage)',     needsApiKey: true,  needsProxy: true },
  { id: 'alphavantage',label: 'Alpha Vantage (API key, free: 25 requests/day)',     needsApiKey: true,  needsProxy: false },
]
```

`needsApiKey` / `needsProxy` drive which input fields the settings form shows for the selected provider. Supplementary providers like BF and [OpenFIGI](openfigi.md) are intentionally absent — they are not choices the user makes.

### `MANUAL_REFRESH_ONLY_PROVIDERS`

```ts
export const MANUAL_REFRESH_ONLY_PROVIDERS = new Set(['alphavantage'])
```

Providers too rate-limited for periodic auto-refresh. While one of these is the selected provider, the [store](../app/store.md#effects-and-lifecycle) skips the auto-refresh interval entirely; only the initial load and the manual **↻** Update button call `refresh()`. Alpha Vantage's 25 requests/day cap is the reason it is here.

## CORS proxy and timeout (`src/data/proxy.ts`)

Yahoo Finance (and the Börse Frankfurt quote endpoint) send no `Access-Control-Allow-Origin` header, so browser requests are blocked. The proxy module wraps those fetches.

### `proxied(url, proxyUrl)`

Returns `url` unchanged when `proxyUrl` is blank/whitespace, otherwise `proxyUrl.trim() + encodeURIComponent(url)` — the target is URL-encoded exactly once.

### `proxyCandidates(proxyUrl)`

Free public CORS proxies routinely go down, get rate-limited, or start gating non-localhost origins (all three have happened during this app's development), so `proxyUrl` is a **comma-separated list of fallback prefixes**. `proxyCandidates` splits, trims, and drops empty entries. An empty `proxyUrl` fetches directly (used by providers with native CORS, and in tests).

### `fetchJson<T>(url, proxyUrl, init?): Promise<T>`

If there are no candidates, fetches the URL directly. Otherwise tries each prefix **in order**, and stops at the first success:

- `fetchOnce(url, prefix, init)` fetches `proxied(url, prefix)` with `AbortSignal.timeout(8_000)` (8 s — a public proxy that has gone down tends to **hang** rather than refuse), reads the body as text, and:
  - on a `TimeoutError` throws `PriceProviderError` ("timed out after 8s");
  - on any other fetch failure throws `PriceProviderError` ("network request failed");
  - on a non-`ok` response throws `PriceProviderError` with `HTTP {status}: {first 200 chars}`;
  - on a JSON parse failure throws `PriceProviderError` ("returned non-JSON (likely an error page)") with the first 100 chars.
- On success of a candidate, returns immediately (no further candidates are tried).
- If **all** candidates fail, throws one aggregated `PriceProviderError` naming every failed proxy host and its error message, with a hint to try another proxy in Settings.

The optional `init: RequestInit` (method/body/headers) is forwarded to every candidate, needed for POST APIs like [OpenFIGI's](openfigi.md) mapping endpoint — none of the free public GET-only proxies can relay a POST body, which is why OpenFIGI realistically needs the self-hosted [CORS proxy Worker](../operations/cors-proxy.md).

The `DEFAULT_SETTINGS.proxyUrl` in [schema](../app/schema.md) ships a 4-entry fallback list led by the self-hosted [Cloudflare Worker](../operations/cors-proxy.md); [persistence](../app/persistence.md) auto-upgrades a persisted value that matches a known-obsolete past default.

## Extension point: adding a new provider

### User-selectable provider

1. Implement `PriceProvider` in a new adapter file under `src/data/`, exporting a `createXProvider(opts)` factory. Reuse `fetchJson` from `proxy.ts` for network/parse-error normalization. If the API needs a `POST` body, pass the `init` argument through to `fetchJson` (OpenFIGI is the reference).
2. Register it in `index.ts`: add a branch to `createProvider` keyed on a new `providerId`, and add a `{ id, label, needsApiKey, needsProxy }` entry to `PROVIDERS`.
3. If it needs an API key, store it under `settings.apiKeys[providerId]` (the [schema](../app/schema.md) `apiKeys` is a `Record<string, string>`, so no type change is needed).
4. If it is too rate-limited for periodic polling, add its id to `MANUAL_REFRESH_ONLY_PROVIDERS`.
5. If it needs proxying and you run your own [CORS proxy Worker](../operations/cors-proxy.md), add its API hostname to `ALLOWED_HOSTS` and redeploy.
6. The [SettingsView](../ui/forms.md) form and the store's refresh wiring pick it up automatically — no store changes required (unless it is rate-limited; see step 4).

### Supplementary (non-selectable) provider

A provider that should run *alongside* the primary one, routed per-symbol rather than chosen in Settings, needs no `PROVIDERS` entry. See the [Börse Frankfurt](boerse-frankfurt.md) adapter as the reference implementation: export an `isXSymbol` predicate for the composite symbol form, add a branch to `resolveProvider` in `index.ts`, and wire it into the store's `search` (merge results with ISIN dedup) and `refresh` (which already calls `resolveProvider` per symbol).

## Focused tests

- `src/data/yahoo.test.ts` covers `proxied` (blank vs non-blank, single encoding), `fetchJson` (HTML-body parse error → `PriceProviderError`, non-ok HTTP → `PriceProviderError`), and the Yahoo adapter parsing.
- `src/data/proxy.test.ts` covers `proxyCandidates` (split/trim/drop-empty), the fallback ordering (falls through to the next candidate on failure; stops at first success), the all-failed aggregated `PriceProviderError`, and **forwards an optional `RequestInit` (method/body/headers) to every candidate** (needed for POST APIs like OpenFIGI).
- `src/data/eodhd.test.ts` covers the [EODHD](eodhd.md) adapter.
- `src/data/alphaVantage.test.ts` covers the [Alpha Vantage](alphavantage.md) adapter.
- `src/data/openfigi.test.ts` covers the [OpenFIGI](openfigi.md) adapter.
- `src/data/boerseFrankfurt.test.ts` covers the BF adapter (see [Börse Frankfurt](boerse-frankfurt.md)).

Run with `npm test`.
