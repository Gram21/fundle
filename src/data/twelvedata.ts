/** Twelve Data adapter. Native CORS, needs an API key. */
import type { PriceProvider, SearchResult } from './PriceProvider'
import { PriceProviderError } from './PriceProvider'
import type { ISODate, PriceSeries } from '../domain/types'
import { fetchJson } from './proxy'

interface TwelveDataError {
  status: 'error'
  message?: string
}

interface TwelveDataSearchResponse {
  data?: { symbol?: string; instrument_name?: string; currency?: string; exchange?: string }[]
}

interface TwelveDataQuoteResponse {
  close?: string
  previous_close?: string
  currency?: string
  timestamp?: string
}

interface TwelveDataHistoryResponse {
  values?: { datetime: string; close: string }[]
}

function isErrorResponse(data: unknown): data is TwelveDataError {
  return !!data && typeof data === 'object' && (data as { status?: string }).status === 'error'
}

export function createTwelveDataProvider(opts: { apiKey: string }): PriceProvider {
  function requireApiKey() {
    if (opts.apiKey.trim() === '') {
      throw new PriceProviderError('Twelve Data API key missing')
    }
  }

  return {
    id: 'twelvedata',
    label: 'Twelve Data (API key)',

    async search(query: string): Promise<SearchResult[]> {
      requireApiKey()
      const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&outputsize=10`
      const data = await fetchJson<TwelveDataSearchResponse>(url, '')
      if (isErrorResponse(data)) {
        throw new PriceProviderError(data.message ?? 'Twelve Data search failed')
      }
      return (data.data ?? [])
        .filter((d) => !!d.symbol)
        .map((d) => ({
          symbol: d.symbol as string,
          name: d.instrument_name ?? (d.symbol as string),
          currency: d.currency,
          exchange: d.exchange,
        }))
    },

    async quote(symbol: string) {
      requireApiKey()
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(opts.apiKey)}`
      const data = await fetchJson<TwelveDataQuoteResponse | TwelveDataError>(url, '')
      if (isErrorResponse(data)) {
        throw new PriceProviderError(data.message ?? 'Twelve Data quote failed')
      }
      return {
        symbol,
        price: Number(data.close),
        previousClose: Number(data.previous_close),
        currency: data.currency ?? '',
        time: Number(data.timestamp) * 1000,
      }
    },

    async history(symbol: string, from: ISODate): Promise<PriceSeries> {
      requireApiKey()
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&start_date=${encodeURIComponent(from)}&outputsize=5000&apikey=${encodeURIComponent(opts.apiKey)}`
      const data = await fetchJson<TwelveDataHistoryResponse | TwelveDataError>(url, '')
      if (isErrorResponse(data)) {
        throw new PriceProviderError(data.message ?? 'Twelve Data history failed')
      }
      const points = (data.values ?? [])
        .map((v) => ({ date: v.datetime.slice(0, 10), close: Number(v.close) }))
        .reverse()
      return { symbol, points }
    },
  }
}
