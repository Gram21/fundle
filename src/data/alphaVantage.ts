/**
 * Alpha Vantage adapter. Free tier, native CORS, but capped at 25 requests/day total across every
 * endpoint - too little for periodic auto-refresh (store.tsx skips the auto-refresh interval
 * entirely while this is the selected provider; only the initial load and the manual Update
 * button call refresh()). A capped/rate-limited request comes back as HTTP 200 with an
 * "Information"/"Note"/"Error Message" field instead of a real error status, so that has to be
 * checked explicitly or a spent quota looks like empty data instead of a clear failure.
 */
import type { PriceProvider, SearchResult } from './PriceProvider'
import { PriceProviderError } from './PriceProvider'
import type { ISODate, PriceSeries } from '../domain/types'
import { fetchJson } from './proxy'

function checkForApiMessage(data: unknown): void {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const message = d['Information'] ?? d['Note'] ?? d['Error Message']
    if (typeof message === 'string') {
      throw new PriceProviderError(`Alpha Vantage: ${message}`)
    }
  }
}

interface SearchMatch {
  '1. symbol'?: string
  '2. name'?: string
  '4. region'?: string
  '8. currency'?: string
}

interface SearchResponse {
  bestMatches?: SearchMatch[]
}

interface QuoteResponse {
  'Global Quote'?: {
    '05. price'?: string
    '08. previous close'?: string
    '07. latest trading day'?: string
  }
}

interface DailySeriesResponse {
  'Time Series (Daily)'?: Record<string, { '4. close'?: string }>
}

export function createAlphaVantageProvider(opts: { apiKey: string }): PriceProvider {
  function requireApiKey() {
    if (opts.apiKey.trim() === '') {
      throw new PriceProviderError('Alpha Vantage API key missing')
    }
  }

  function url(params: Record<string, string>): string {
    const q = new URLSearchParams({ ...params, apikey: opts.apiKey }).toString()
    return `https://www.alphavantage.co/query?${q}`
  }

  return {
    id: 'alphavantage',
    label: 'Alpha Vantage (API key, free: 25 requests/day)',

    async search(query: string): Promise<SearchResult[]> {
      requireApiKey()
      const data = await fetchJson<SearchResponse>(url({ function: 'SYMBOL_SEARCH', keywords: query }), '')
      checkForApiMessage(data)
      return (data.bestMatches ?? [])
        .filter((m) => !!m['1. symbol'])
        .map((m) => ({
          symbol: m['1. symbol']!,
          name: m['2. name'] ?? m['1. symbol']!,
          currency: m['8. currency'],
          exchange: m['4. region'],
        }))
    },

    async quote(symbol: string) {
      requireApiKey()
      const data = await fetchJson<QuoteResponse>(url({ function: 'GLOBAL_QUOTE', symbol }), '')
      checkForApiMessage(data)
      const q = data['Global Quote']
      const price = Number(q?.['05. price'])
      const previousClose = Number(q?.['08. previous close'])
      if (!q || !Number.isFinite(price) || !Number.isFinite(previousClose)) {
        throw new PriceProviderError(`No quote data for ${symbol}`)
      }
      // Not used for display (the app formats with the asset's own currency), and Alpha
      // Vantage's quote endpoint doesn't report one - "USD" is a reasonable placeholder given
      // its catalogue is overwhelmingly US-listed tickers.
      return {
        symbol,
        price,
        previousClose,
        currency: 'USD',
        time: Date.parse(q['07. latest trading day'] ?? '') || Date.now(),
      }
    },

    // ponytail: free tier's TIME_SERIES_DAILY only supports outputsize=compact (last ~100
    // trading days) - "full" history needs a premium key. Good enough for "what's this done
    // recently", not for a multi-year buy-and-hold chart. Upgrade path: outputsize=full once
    // on a paid key.
    async history(symbol: string, from: ISODate): Promise<PriceSeries> {
      requireApiKey()
      const data = await fetchJson<DailySeriesResponse>(
        url({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' }),
        '',
      )
      checkForApiMessage(data)
      const series = data['Time Series (Daily)'] ?? {}
      const points = Object.entries(series)
        .map(([date, day]) => ({ date, close: Number(day['4. close']) }))
        .filter((p) => Number.isFinite(p.close) && p.date >= from)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      return { symbol, points }
    },
  }
}
