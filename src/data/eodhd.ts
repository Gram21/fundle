/**
 * EODHD adapter. Paid (~EUR20/mo cheapest plan covers this; 100k calls/day on every paid
 * tier), needs an API key, no native CORS (routed through the proxy fallback like Yahoo/BF).
 * Its search is genuinely ISIN-native and covers mutual funds/ETFs across Ireland, Luxembourg,
 * France, Germany etc, not just US - the gap Yahoo/Twelve Data/Börse Frankfurt each leave open.
 *
 * EODHD's own quote/history endpoints take a TICKER.EXCHANGE symbol (its own exchange codes,
 * e.g. 'MCD.US', 'VWRD.LSE') and never return a currency field outside of search - so the
 * currency search resolves is encoded into the opaque symbol (`TICKER.EXCHANGE@CCY`), the same
 * trick boerseFrankfurt.ts uses for its ISIN@MIC symbols, to avoid a second request per quote.
 */
import type { PriceProvider, SearchResult } from './PriceProvider'
import { PriceProviderError } from './PriceProvider'
import type { ISODate, PriceSeries } from '../domain/types'
import { fetchJson } from './proxy'

interface EodhdSearchHit {
  Code?: string
  Exchange?: string
  Name?: string
  Currency?: string
  ISIN?: string
}

interface EodhdQuote {
  close?: number
  previousClose?: number
  timestamp?: number
}

interface EodhdEodPoint {
  date?: string
  close?: number
  adjusted_close?: number
}

const SYMBOL_RE = /^(.+)@([A-Z]{3})$/

function encodeSymbol(ticker: string, currency: string): string {
  return `${ticker}@${currency}`
}

function decodeSymbol(symbol: string): { ticker: string; currency: string } {
  const match = SYMBOL_RE.exec(symbol)
  if (!match) throw new PriceProviderError(`Not an EODHD symbol: ${symbol}`)
  return { ticker: match[1]!, currency: match[2]! }
}

export function createEodhdProvider(opts: { apiKey: string; proxyUrl: string }): PriceProvider {
  function requireApiKey() {
    if (opts.apiKey.trim() === '') {
      throw new PriceProviderError('EODHD API key missing')
    }
  }

  function withKey(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}api_token=${encodeURIComponent(opts.apiKey)}&fmt=json`
  }

  return {
    id: 'eodhd',
    label: 'EODHD (API key, paid)',

    async search(query: string): Promise<SearchResult[]> {
      requireApiKey()
      const url = withKey(`https://eodhd.com/api/search/${encodeURIComponent(query)}`)
      const hits = await fetchJson<EodhdSearchHit[]>(url, opts.proxyUrl)
      return hits
        .filter((h) => h.Code && h.Exchange && h.Currency)
        .map((h) => ({
          symbol: encodeSymbol(`${h.Code}.${h.Exchange}`, h.Currency!),
          name: h.Name ?? h.Code!,
          isin: h.ISIN,
          currency: h.Currency,
          exchange: h.Exchange,
        }))
    },

    async quote(symbol: string) {
      requireApiKey()
      const { ticker, currency } = decodeSymbol(symbol)
      const url = withKey(`https://eodhd.com/api/real-time/${encodeURIComponent(ticker)}`)
      const data = await fetchJson<EodhdQuote>(url, opts.proxyUrl)
      if (data.close === undefined || data.previousClose === undefined) {
        throw new PriceProviderError(`No quote data for ${symbol}`)
      }
      return {
        symbol,
        price: data.close,
        previousClose: data.previousClose,
        currency,
        time: (data.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
      }
    },

    async history(symbol: string, from: ISODate): Promise<PriceSeries> {
      requireApiKey()
      const { ticker } = decodeSymbol(symbol)
      const url = withKey(`https://eodhd.com/api/eod/${encodeURIComponent(ticker)}?from=${encodeURIComponent(from)}`)
      const rows = await fetchJson<EodhdEodPoint[]>(url, opts.proxyUrl)
      const points = rows
        .filter((r) => typeof r.date === 'string' && (r.adjusted_close !== undefined || r.close !== undefined))
        .map((r) => ({ date: r.date!, close: r.adjusted_close ?? r.close! }))
      return { symbol, points }
    },
  }
}

export function isEodhdSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol)
}
