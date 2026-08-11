/** Yahoo Finance adapter. No native CORS, so every call goes through a proxy. */
import type { PriceProvider, SearchResult } from './PriceProvider'
import { PriceProviderError } from './PriceProvider'
import type { ISODate, PriceSeries } from '../domain/types'
import { fetchJson } from './proxy'

interface YahooSearchResponse {
  quotes?: {
    symbol?: string
    shortname?: string
    longname?: string
    currency?: string
    exchange?: string
  }[]
}

interface YahooChartMeta {
  regularMarketPrice?: number
  currency?: string
  regularMarketTime?: number
  previousClose?: number
  chartPreviousClose?: number
}

interface YahooChartResponse {
  chart: {
    result?: {
      meta: YahooChartMeta
      timestamp?: number[]
      indicators?: {
        adjclose?: { adjclose?: (number | null)[] }[]
        quote?: { close?: (number | null)[] }[]
      }
    }[]
    error?: { description?: string }
  }
}

function toDateOnly(epochMs: number): ISODate {
  return new Date(epochMs).toISOString().slice(0, 10)
}

export function createYahooProvider(opts: { proxyUrl: string }): PriceProvider {
  return {
    id: 'yahoo',
    label: 'Yahoo Finance (via CORS proxy)',

    async search(query: string): Promise<SearchResult[]> {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`
      const data = await fetchJson<YahooSearchResponse>(url, opts.proxyUrl)
      return (data.quotes ?? [])
        .filter((q) => !!q.symbol)
        .map((q) => ({
          symbol: q.symbol as string,
          name: q.shortname ?? q.longname ?? (q.symbol as string),
          currency: q.currency,
          exchange: q.exchange,
        }))
    },

    async quote(symbol: string) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`
      const data = await fetchJson<YahooChartResponse>(url, opts.proxyUrl)
      const meta = data.chart.result?.[0]?.meta
      if (!meta) {
        const detail = data.chart.error?.description
        throw new PriceProviderError(
          `No quote data for ${symbol}${detail ? `: ${detail}` : ''}`,
        )
      }
      const previousClose = meta.previousClose ?? meta.chartPreviousClose
      if (
        meta.regularMarketPrice === undefined ||
        meta.currency === undefined ||
        meta.regularMarketTime === undefined ||
        previousClose === undefined
      ) {
        throw new PriceProviderError(`Incomplete quote data for ${symbol}`)
      }
      return {
        symbol,
        price: meta.regularMarketPrice,
        previousClose,
        currency: meta.currency,
        time: meta.regularMarketTime * 1000,
      }
    },

    async history(symbol: string, from: ISODate): Promise<PriceSeries> {
      const period1 = Math.floor(new Date(from).getTime() / 1000)
      const period2 = Math.floor(Date.now() / 1000)
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`
      const data = await fetchJson<YahooChartResponse>(url, opts.proxyUrl)
      const result = data.chart.result?.[0]
      const timestamps = result?.timestamp ?? []
      const adjclose = result?.indicators?.adjclose?.[0]?.adjclose
      const close = result?.indicators?.quote?.[0]?.close

      const byDate = new Map<ISODate, number>()
      timestamps.forEach((ts, i) => {
        const value = adjclose?.[i] ?? close?.[i]
        if (value === null || value === undefined) return
        byDate.set(toDateOnly(ts * 1000), value)
      })

      const points = Array.from(byDate, ([date, closeVal]) => ({ date, close: closeVal })).sort(
        (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      )
      return { symbol, points }
    },
  }
}
