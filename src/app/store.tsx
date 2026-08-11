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
import { createProvider } from '../data'
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
      quotes: {},
      history: {},
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
      failed: string[]
    }
  | { type: 'IMPORT'; portfolios: Portfolio[]; settings: Settings }

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
            a.id === action.assetId ? { ...a, lots: [...a.lots, action.lot] } : a,
          ),
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
          error: `Failed to refresh: ${action.failed.join(', ')}`,
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
        quotes: {},
        history: {},
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
      const provider = createProvider(settings)
      const earliest = earliestLotDateBySymbol(portfolios)
      const symbols = Array.from(new Set(portfolios.flatMap((p) => p.assets.map((a) => a.symbol))))

      const today = new Date().toISOString().slice(0, 10)

      const settled = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const from = earliest.get(symbol) ?? today
          // The daily series only gains a point once a day, so the 5-minute tick refetches
          // the quote but reuses a series that already reaches today. Public CORS proxies
          // are rate-limited; this halves the requests they see.
          const known = stateRef.current.history[symbol]
          const fresh =
            known && known.points.length > 0 && known.points[known.points.length - 1]!.date >= today
          const [quote, history] = await Promise.all([
            provider.quote(symbol),
            fresh ? Promise.resolve(known) : provider.history(symbol, from),
          ])
          return { symbol, quote, history }
        }),
      )

      const quotes: Record<string, Quote> = {}
      const history: Record<string, PriceSeries> = {}
      const failed: string[] = []
      settled.forEach((result, i) => {
        const symbol = symbols[i]
        if (!symbol) return
        if (result.status === 'fulfilled') {
          quotes[symbol] = result.value.quote
          history[symbol] = result.value.history
        } else {
          failed.push(symbol)
        }
      })
      dispatch({ type: 'REFRESH_DONE', quotes, history, failed })
    } finally {
      refreshingRef.current = false
    }
  }, [])

  // Persist on every change.
  useEffect(() => {
    saveLocal(state.portfolios, state.settings)
  }, [state.portfolios, state.settings])

  // Refresh on mount.
  useEffect(() => {
    refresh()
  }, [refresh])

  // Re-arm the interval whenever refreshMinutes changes.
  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current.status === 'loading') return
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
        return serialize(stateRef.current.portfolios, stateRef.current.settings, new Date())
      },
      importJson(text) {
        const { portfolios, settings } = parseImport(text)
        dispatch({ type: 'IMPORT', portfolios, settings })
        refresh()
      },
      search(query) {
        return createProvider(stateRef.current.settings).search(query)
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
