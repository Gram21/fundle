---
type: app-state
title: App Store — Reducer, Context and Refresh Scheduling
description: The AppProvider owns all state via useReducer+Context, exposes AppActions, and runs the price refresh flow with series-freshness reuse, allSettled error handling, an interval timer and concurrency guards.
tags: [app, store, state, react, refresh]
---

# App Store (`src/app/store.tsx`)

The store is the runtime hub: it owns all mutable state, exposes `AppActions` to the UI, wires [settings](schema.md) to a [PriceProvider](../data/price-provider.md), and schedules refreshes. It uses `useReducer` + a single Context — no state library.

## State shape (`AppState`)

```ts
interface AppState {
  portfolios: Portfolio[]
  activePortfolioId: string
  settings: Settings
  quotes: Record<string, Quote>
  history: Record<string, PriceSeries>
  status: 'idle' | 'loading' | 'error'
  error?: string
  lastUpdated?: number
}
```

`portfolios`, `quotes`, `history` are keyed/structured for direct lookup; `quotes`/`history` are merged (not replaced) on each refresh so a partial failure keeps prior good data.

## Reducer and actions

`reducer(state, action)` handles a discriminated `Action` union:

| Action | Effect |
| --- | --- |
| `ADD_ASSET` | append asset to the active portfolio's `assets` |
| `REMOVE_ASSET` | filter asset out |
| `ADD_LOT` / `REMOVE_LOT` | append/remove a lot within an asset |
| `ADD_PORTFOLIO` / `REMOVE_PORTFOLIO` | add/remove portfolio; on removal, if active was removed, fall back to `portfolios[0]?.id ?? ''` |
| `RENAME_PORTFOLIO` | rename |
| `SET_ACTIVE_PORTFOLIO` | switch active id |
| `UPDATE_SETTINGS` | shallow-merge settings patch |
| `REFRESH_START` | `status='loading'` |
| `REFRESH_DONE` | merge quotes/history; if `failed.length > 0` set `status='error'` with a message naming the failed symbols, else `status='idle'` and `lastUpdated=Date.now()` |
| `IMPORT` | replace portfolios/settings/quotes/history wholesale (active becomes `portfolios[0]`) |

`updateActivePortfolio(state, fn)` maps only the active portfolio, leaving others untouched — all asset/lot mutations are scoped to the active portfolio.

## `AppActions` (the UI surface)

The `actions` memo exposes: `addAsset`, `removeAsset`, `addLot`, `removeLot`, `addPortfolio`, `removePortfolio`, `renamePortfolio`, `setActivePortfolio`, `updateSettings`, `refresh`, `exportJson`, `importJson`, `search`.

Key wiring details:

- **`addAsset` and `addLot` trigger `refresh()`** after dispatching, so a newly added symbol is fetched immediately.
- **`updateSettings` triggers `refresh()` only when the patch touches `providerId`, `proxyUrl`, or `apiKeys`** — changing `refreshMinutes` or `baseCurrency` does not refetch.
- **`exportJson`** reads from `stateRef.current` (not the render state) via [persistence.serialize](persistence.md).
- **`importJson`** calls [persistence.parseImport](persistence.md), dispatches `IMPORT`, then `refresh()`.
- **`search`** constructs a fresh provider from current settings and forwards the query (used by [AddAssetForm](../ui/forms.md)).

IDs are generated with `crypto.randomUUID()`.

## The refresh flow

`refresh` is the core workflow (see the [architecture diagram](../architecture/overview.md#refresh-data-flow)):

1. **Concurrency guard**: `refreshingRef.current` is a single boolean ref; if already true, return early. This is deliberately simple — good enough to stop overlapping refreshes from StrictMode double-mount and interval-vs-click races; a per-symbol queue would be overkill.
2. `dispatch({ type: 'REFRESH_START' })`.
3. Read `portfolios`/`settings` from `stateRef.current` (the ref is kept in sync via an effect, so `refresh` always sees the latest state, not a stale closure).
4. `createProvider(settings)` — a fresh provider per refresh, so a settings change takes effect immediately.
5. `earliestLotDateBySymbol(portfolios)` — scans every lot in every portfolio to find each symbol's earliest lot date, used as the history `from`.
6. Unique symbols across all portfolios (`new Set(portfolios.flatMap(p => p.assets.map(a => a.symbol)))`).
7. `Promise.allSettled` over each symbol: fetch `quote(symbol)` in parallel with `history(symbol, from)` — **but reuse the known `history[symbol]` if its last point's date `>= today`** (the daily series only gains a point once a day; this halves the requests a rate-limited proxy sees).
8. Collect fulfilled results into `quotes`/`history`, rejected symbols into `failed`.
9. `dispatch({ type: 'REFRESH_DONE', quotes, history, failed })`.
10. `finally`: clear `refreshingRef`.

## Effects and lifecycle

- **Persist on every change**: an effect watches `[state.portfolios, state.settings, state.quotes, state.history]` and calls `saveLocal(...)`. A reload does not need to refetch.
- **Refresh on mount**: `useEffect(() => { refresh() }, [refresh])`.
- **Interval**: re-armed whenever `settings.refreshMinutes` changes. Skips a tick if `status === 'loading'`. Interval = `refreshMinutes * 60_000` ms.

## Hooks

- `useApp()` — returns `AppState & { actions: AppActions }`; throws if used outside `AppProvider`.
- `useActivePortfolio()` — returns the active `Portfolio` (or an `EMPTY_PORTFOLIO` sentinel `{ id:'', name:'', assets:[] }` if none matches, so the UI never crashes on a missing active id).

## Focused tests

The store has no dedicated test file; its behavior is exercised end-to-end by the domain and persistence tests, and its wiring is simple enough that the reducer is effectively a pure function over the `Action` union. The concurrency guard and series-freshness reuse are verified by reading the implementation; the [persistence tests](persistence.md) cover the import path the store delegates to.
