/** App state: one reducer + one context. No state library. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import type { Asset, ISODate, Lot, Portfolio, PriceSeries, Quote } from '../domain/types'
import type { SearchResult } from '../data/PriceProvider'
import {
  createProvider,
  createBoerseFrankfurtProvider,
  createOpenFigiProvider,
  resolveProvider,
  MANUAL_REFRESH_ONLY_PROVIDERS,
} from '../data'
import { DEFAULT_SETTINGS, type Settings } from './schema'
import { loadLocal, parseImport, saveLocal, serialize } from './persistence'

export interface AppState {
  portfolios: Portfolio[]
  activePortfolioId: string
  settings: Settings
  quotes: Record<string, Quote>
  history: Record<string, PriceSeries>
  status: 'idle' | 'loading' | 'error'
  error?: string
  lastUpdated?: number
}

export interface NewAsset {
  symbol: string
  name: string
  currency: string
  isin?: string
  wkn?: string
  lots: Omit<Lot, 'id'>[]
}

export interface AppActions {
  addAsset(input: NewAsset): void
  removeAsset(assetId: string): void
  addLot(assetId: string, lot: Omit<Lot, 'id'>): void
  removeLot(assetId: string, lotId: string): void
  sellAsset(assetId: string, sale: NonNullable<Asset['sale']>): void
  addPortfolio(name: string): void
  removePortfolio(id: string): void
  renamePortfolio(id: string, name: string): void
  setActivePortfolio(id: string): void
  updateSettings(patch: Partial<Settings>): void
  refresh(): Promise<void>
  exportJson(): string
  importJson(text: string): void
  search(query: string): Promise<SearchResult[]>
}

const EMPTY_PORTFOLIO: Portfolio = { id: '', name: '', assets: [] }

function emptyPortfolio(name: string): Portfolio {
  return { id: crypto.randomUUID(), name, assets: [] }
}

function buildInitialState(): AppState {
  const loaded = loadLocal()
  if (loaded) {
    return {
      portfolios: loaded.portfolios,
      activePortfolioId: loaded.portfolios[0]?.id ?? '',
      settings: loaded.settings,
      quotes: loaded.quotes,
      history: loaded.history,
      status: 'idle',
    }
  }
  const portfolio = emptyPortfolio('Portfolio')
  return {
    portfolios: [portfolio],
    activePortfolioId: portfolio.id,
    settings: DEFAULT_SETTINGS,
    quotes: {},
    history: {},
    status: 'idle',
  }
}

type Action =
  | { type: 'ADD_ASSET'; asset: Asset }
  | { type: 'REMOVE_ASSET'; assetId: string }
  | { type: 'ADD_LOT'; assetId: string; lot: Lot }
  | { type: 'REMOVE_LOT'; assetId: string; lotId: string }
  | { type: 'SELL_ASSET'; assetId: string; sale: NonNullable<Asset['sale']> }
  | { type: 'ADD_PORTFOLIO'; portfolio: Portfolio }
  | { type: 'REMOVE_PORTFOLIO'; id: string }
  | { type: 'RENAME_PORTFOLIO'; id: string; name: string }
  | { type: 'SET_ACTIVE_PORTFOLIO'; id: string }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'REFRESH_START' }
  | {
      type: 'REFRESH_DONE'
      quotes: Record<string, Quote>
      history: Record<string, PriceSeries>
      failed: { symbol: string; message: string }[]
    }
  | {
      type: 'IMPORT'
      portfolios: Portfolio[]
      settings: Settings
      quotes: Record<string, Quote>
      history: Record<string, PriceSeries>
    }

function updateActivePortfolio(state: AppState, fn: (p: Portfolio) => Portfolio): Portfolio[] {
  return state.portfolios.map((p) => (p.id === state.activePortfolioId ? fn(p) : p))
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_ASSET':
      return {
        ...state,
        portfolios: updateActivePortfolio(state, (p) => ({ ...p, assets: [...p.assets, action.asset] })),
      }
    case 'REMOVE_ASSET':
      return {
        ...state,
        portfolios: updateActivePortfolio(state, (p) => ({
          ...p,
          assets: p.assets.filter((a) => a.id !== action.assetId),
        })),
      }
    case 'ADD_LOT':
      return {
        ...state,
        portfolios: updateActivePortfolio(state, (p) => ({
          ...p,
          assets: p.assets.map((a) =>
            a.id === action.assetId
              // Buying more into a closed position reopens it — a sold asset can't also be held.
              ? { ...a, lots: [...a.lots, action.lot], sale: undefined }
              : a,
          ),
        })),
      }
    case 'SELL_ASSET':
      return {
        ...state,
        portfolios: updateActivePortfolio(state, (p) => ({
          ...p,
          assets: p.assets.map((a) => (a.id === action.assetId ? { ...a, sale: action.sale } : a)),
        })),
      }
    case 'REMOVE_LOT':
      return {
        ...state,
        portfolios: updateActivePortfolio(state, (p) => ({
          ...p,
          assets: p.assets.map((a) =>
            a.id === action.assetId
              ? { ...a, lots: a.lots.filter((l) => l.id !== action.lotId) }
              : a,
          ),
        })),
      }
    case 'ADD_PORTFOLIO':
      return { ...state, portfolios: [...state.portfolios, action.portfolio] }
    case 'REMOVE_PORTFOLIO': {
      const portfolios = state.portfolios.filter((p) => p.id !== action.id)
      const activePortfolioId =
        state.activePortfolioId === action.id
          ? portfolios[0]?.id ?? ''
          : state.activePortfolioId
      return { ...state, portfolios, activePortfolioId }
    }
    case 'RENAME_PORTFOLIO':
      return {
        ...state,
        portfolios: state.portfolios.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)),
      }
    case 'SET_ACTIVE_PORTFOLIO':
      return { ...state, activePortfolioId: action.id }
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'REFRESH_START':
      return { ...state, status: 'loading' }
    case 'REFRESH_DONE':
      if (action.failed.length > 0) {
        return {
          ...state,
          quotes: { ...state.quotes, ...action.quotes },
          history: { ...state.history, ...action.history },
          status: 'error',
          error: action.failed.map((f) => `${f.symbol}: ${f.message}`).join(' — '),
        }
      }
      return {
        ...state,
        quotes: { ...state.quotes, ...action.quotes },
        history: { ...state.history, ...action.history },
        status: 'idle',
        error: undefined,
        lastUpdated: Date.now(),
      }
    case 'IMPORT':
      return {
        ...state,
        portfolios: action.portfolios,
        activePortfolioId: action.portfolios[0]?.id ?? '',
        settings: action.settings,
        quotes: action.quotes,
        history: action.history,
      }
    default:
      return state
  }
}

/** Earliest lot date per symbol, across every portfolio - refresh() uses it as the history `from`. */
function earliestLotDateBySymbol(portfolios: Portfolio[]): Map<string, ISODate> {
  const dates = new Map<string, ISODate>()
  for (const portfolio of portfolios) {
    for (const asset of portfolio.assets) {
      for (const lot of asset.lots) {
        const current = dates.get(asset.symbol)
        if (!current || lot.date < current) dates.set(asset.symbol, lot.date)
      }
    }
  }
  return dates
}

/** Symbols where every asset using them (across every portfolio) has been fully sold. */
function fullySoldSymbols(portfolios: Portfolio[]): Set<string> {
  const bySymbol = new Map<string, Asset[]>()
  for (const portfolio of portfolios) {
    for (const asset of portfolio.assets) {
      bySymbol.set(asset.symbol, [...(bySymbol.get(asset.symbol) ?? []), asset])
    }
  }
  const result = new Set<string>()
  for (const [symbol, assets] of bySymbol) {
    if (assets.every((a) => a.sale)) result.add(symbol)
  }
  return result
}

/** Latest sale date among assets using a symbol - the "as of" date history only needs to reach for a fully-sold symbol. */
function latestSaleDateBySymbol(portfolios: Portfolio[]): Map<string, ISODate> {
  const dates = new Map<string, ISODate>()
  for (const portfolio of portfolios) {
    for (const asset of portfolio.assets) {
      if (!asset.sale) continue
      const current = dates.get(asset.symbol)
      if (!current || asset.sale.date > current) dates.set(asset.symbol, asset.sale.date)
    }
  }
  return dates
}

const AppContext = createContext<(AppState & { actions: AppActions }) | null>(null)

export function AppProvider(props: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState)

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  // ponytail: single ref flag, good enough to stop overlapping refreshes (StrictMode double-mount,
  // interval racing a manual click); a per-symbol request queue would be overkill here.
  const refreshingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    dispatch({ type: 'REFRESH_START' })
    try {
      const { portfolios, settings } = stateRef.current
      const earliest = earliestLotDateBySymbol(portfolios)
      const soldOut = fullySoldSymbols(portfolios)
      const latestSale = latestSaleDateBySymbol(portfolios)
      const symbols = Array.from(new Set(portfolios.flatMap((p) => p.assets.map((a) => a.symbol))))

      const today = new Date().toISOString().slice(0, 10)

      const settled = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const provider = resolveProvider(symbol, settings)
          const from = earliest.get(symbol) ?? today
          const isSoldOut = soldOut.has(symbol)
          // A fully-sold symbol never needs a live price again; history only needs to reach
          // its latest sale date, not today.
          const asOf = isSoldOut ? latestSale.get(symbol) ?? today : today
          // The daily series only gains a point once a day, so the 5-minute tick refetches
          // the quote but reuses a series that already reaches today (or the sale date, for a
          // fully-sold symbol). Public CORS proxies are rate-limited; this halves the requests
          // they see.
          const known = stateRef.current.history[symbol]
          const fresh =
            known && known.points.length > 0 && known.points[known.points.length - 1]!.date >= asOf
          const [quote, history] = await Promise.all([
            isSoldOut ? Promise.resolve(undefined) : provider.quote(symbol),
            fresh ? Promise.resolve(known) : provider.history(symbol, from),
          ])
          return { symbol, quote, history }
        }),
      )

      const quotes: Record<string, Quote> = {}
      const history: Record<string, PriceSeries> = {}
      const failed: { symbol: string; message: string }[] = []
      settled.forEach((result, i) => {
        const symbol = symbols[i]
        if (!symbol) return
        if (result.status === 'fulfilled') {
          if (result.value.quote) quotes[symbol] = result.value.quote
          history[symbol] = result.value.history
        } else {
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
          failed.push({ symbol, message })
        }
      })
      dispatch({ type: 'REFRESH_DONE', quotes, history, failed })
    } finally {
      refreshingRef.current = false
    }
  }, [])

  // Persist on every change, including fetched prices - so a reload doesn't need to refetch.
  useEffect(() => {
    saveLocal(state.portfolios, state.settings, { quotes: state.quotes, history: state.history })
  }, [state.portfolios, state.settings, state.quotes, state.history])

  // Refresh on mount.
  useEffect(() => {
    refresh()
  }, [refresh])

  // Re-arm the interval whenever refreshMinutes changes. Skipped entirely for providers too
  // rate-limited for periodic polling (e.g. Alpha Vantage's 25 requests/day) - those only
  // refresh on the initial load and the manual Update button.
  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current.status === 'loading') return
      if (MANUAL_REFRESH_ONLY_PROVIDERS.has(stateRef.current.settings.providerId)) return
      refresh()
    }, state.settings.refreshMinutes * 60_000)
    return () => clearInterval(id)
  }, [state.settings.refreshMinutes, refresh])

  const actions = useMemo<AppActions>(
    () => ({
      addAsset(input) {
        const asset: Asset = {
          id: crypto.randomUUID(),
          symbol: input.symbol,
          name: input.name,
          currency: input.currency,
          isin: input.isin,
          wkn: input.wkn,
          lots: input.lots.map((l) => ({ ...l, id: crypto.randomUUID() })),
        }
        dispatch({ type: 'ADD_ASSET', asset })
        refresh()
      },
      removeAsset(assetId) {
        dispatch({ type: 'REMOVE_ASSET', assetId })
      },
      addLot(assetId, lot) {
        dispatch({ type: 'ADD_LOT', assetId, lot: { ...lot, id: crypto.randomUUID() } })
        refresh()
      },
      removeLot(assetId, lotId) {
        dispatch({ type: 'REMOVE_LOT', assetId, lotId })
      },
      sellAsset(assetId, sale) {
        dispatch({ type: 'SELL_ASSET', assetId, sale })
      },
      addPortfolio(name) {
        dispatch({ type: 'ADD_PORTFOLIO', portfolio: emptyPortfolio(name) })
      },
      removePortfolio(id) {
        dispatch({ type: 'REMOVE_PORTFOLIO', id })
      },
      renamePortfolio(id, name) {
        dispatch({ type: 'RENAME_PORTFOLIO', id, name })
      },
      setActivePortfolio(id) {
        dispatch({ type: 'SET_ACTIVE_PORTFOLIO', id })
      },
      updateSettings(patch) {
        dispatch({ type: 'UPDATE_SETTINGS', patch })
        if ('providerId' in patch || 'proxyUrl' in patch || 'apiKeys' in patch) refresh()
      },
      refresh,
      exportJson() {
        const { portfolios, settings, quotes, history } = stateRef.current
        return serialize(portfolios, settings, new Date(), { quotes, history })
      },
      importJson(text) {
        const { portfolios, settings, quotes, history } = parseImport(text)
        dispatch({ type: 'IMPORT', portfolios, settings, quotes, history })
        refresh()
      },
      async search(query) {
        const { settings } = stateRef.current
        const [primaryResult, bfResult, figiResult] = await Promise.allSettled([
          createProvider(settings).search(query),
          createBoerseFrankfurtProvider({ proxyUrl: settings.proxyUrl }).search(query),
          createOpenFigiProvider({ apiKey: settings.apiKeys.openfigi, proxyUrl: settings.proxyUrl }).search(query),
        ])
        if (primaryResult.status === 'rejected' && bfResult.status === 'rejected' && figiResult.status === 'rejected') {
          throw primaryResult.reason
        }
        const primaryHits = primaryResult.status === 'fulfilled' ? primaryResult.value : []
        const bfHits = bfResult.status === 'fulfilled' ? bfResult.value : []
        const figiHits = figiResult.status === 'fulfilled' ? figiResult.value : []
        // Skip a hit if an earlier source already found the same ISIN or exact symbol — no
        // point offering the user two rows for one instrument.
        const seenIsins = new Set(primaryHits.map((r) => r.isin).filter(Boolean))
        const seenSymbols = new Set(primaryHits.map((r) => r.symbol))
        const extraBf = bfHits.filter((r) => !seenIsins.has(r.isin))
        extraBf.forEach((r) => seenSymbols.add(r.symbol))
        const extraFigi = figiHits.filter((r) => !seenIsins.has(r.isin) && !seenSymbols.has(r.symbol))
        return [...primaryHits, ...extraBf, ...extraFigi]
      },
    }),
    [refresh],
  )

  const value = useMemo(() => ({ ...state, actions }), [state, actions])

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>
}

export function useApp(): AppState & { actions: AppActions } {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within an AppProvider')
  return ctx
}

export function useActivePortfolio(): Portfolio {
  const { portfolios, activePortfolioId } = useApp()
  return portfolios.find((p) => p.id === activePortfolioId) ?? EMPTY_PORTFOLIO
}
