/**
 * Börse Frankfurt adapter. ISIN-native: `quote_box/single?isin=..&mic=..` needs no symbol
 * resolution, but the underlying API has no public search or history endpoint (verified: every
 * plausible search/history path returns an empty `{}` or 400, unlike the quote endpoint). So this
 * provider only ever supplies live quotes for a small set of Deutsche Börse Group markets, and
 * delegates history to Yahoo's own ISIN search — which is the best free source available, even
 * though it means an asset resolved only through Börse Frankfurt (no Yahoo equivalent) has no
 * historical chart.
 */
import type { PriceProvider, SearchResult } from './PriceProvider'
import { PriceProviderError } from './PriceProvider'
import type { ISODate, PriceSeries } from '../domain/types'
import { fetchJson } from './proxy'
import { createYahooProvider } from './yahoo'

// Deutsche Börse Group's own markets, the only ones this API recognises (other German
// exchanges, e.g. Stuttgart/XSTU, belong to different operators and 400 on this endpoint).
// Covers Xetra plus the Frankfurt floor, which between them also carry plenty of non-German
// ISINs (US/Irish/Luxembourg ETFs and ADRs), not just German-listed names.
const MICS = ['XETR', 'XFRA'] as const

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/
const SYMBOL_RE = /^([A-Z]{2}[A-Z0-9]{9}\d)@([A-Z]{4})$/

export function isBoerseFrankfurtSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol)
}

function parseSymbol(symbol: string): { isin: string; mic: string } | undefined {
  const match = SYMBOL_RE.exec(symbol)
  return match ? { isin: match[1]!, mic: match[2]! } : undefined
}

interface QuoteBox {
  lastPrice?: number
  changeToPrevDayAbsolute?: number
  timestamp?: string
  timestampLastPrice?: string
}

function quoteBoxUrl(isin: string, mic: string): string {
  return `https://api.boerse-frankfurt.de/v1/data/quote_box/single?isin=${encodeURIComponent(isin)}&mic=${encodeURIComponent(mic)}`
}

export function createBoerseFrankfurtProvider(opts: { proxyUrl: string }): PriceProvider {
  // Reused only for the history() fallback — never for search()/quote(), which stay BF-native.
  const yahoo = createYahooProvider({ proxyUrl: opts.proxyUrl })

  async function fetchQuoteBox(isin: string, mic: string): Promise<QuoteBox | undefined> {
    try {
      const data = await fetchJson<QuoteBox>(quoteBoxUrl(isin, mic), opts.proxyUrl)
      return typeof data.lastPrice === 'number' ? data : undefined
    } catch {
      // 400 (isin not traded on this mic) or an empty/unparseable body (no data) both just mean
      // "not here" — not an error worth surfacing.
      return undefined
    }
  }

  return {
    id: 'boersefrankfurt',
    label: 'Börse Frankfurt (ISIN quotes, no key)',

    async search(query: string): Promise<SearchResult[]> {
      const isin = query.trim().toUpperCase()
      if (!ISIN_RE.test(isin)) return []
      const hits = await Promise.all(
        MICS.map(async (mic) => {
          const box = await fetchQuoteBox(isin, mic)
          if (!box) return undefined
          const hit: SearchResult = {
            symbol: `${isin}@${mic}`,
            name: isin,
            isin,
            currency: 'EUR',
            exchange: mic,
          }
          return hit
        }),
      )
      return hits.filter((h): h is SearchResult => h !== undefined)
    },

    async quote(symbol: string) {
      const parsed = parseSymbol(symbol)
      if (!parsed) throw new PriceProviderError(`Not a Börse Frankfurt symbol: ${symbol}`)
      const box = await fetchQuoteBox(parsed.isin, parsed.mic)
      if (!box) throw new PriceProviderError(`No quote data for ${symbol}`)
      const previousClose = box.lastPrice! - (box.changeToPrevDayAbsolute ?? 0)
      const time = Date.parse(box.timestampLastPrice ?? box.timestamp ?? '') || Date.now()
      return {
        symbol,
        price: box.lastPrice!,
        previousClose,
        // Deutsche Börse Group markets quote in EUR regardless of the instrument's home
        // market (e.g. a US stock admitted to Xetra still trades in EUR there); quote_box
        // itself carries no currency field to confirm this per-instrument.
        currency: 'EUR',
        time,
      }
    },

    // ponytail: no free BF history endpoint exists (verified dead end), so this borrows Yahoo's
    // ISIN search for a chartable symbol. If Yahoo also has nothing for this ISIN, returns an
    // empty series instead of failing every refresh — upgrade path is a paid history API if one
    // ever needs charting for a BF-only instrument.
    async history(symbol: string, from: ISODate): Promise<PriceSeries> {
      const parsed = parseSymbol(symbol)
      if (!parsed) throw new PriceProviderError(`Not a Börse Frankfurt symbol: ${symbol}`)
      try {
        const matches = await yahoo.search(parsed.isin)
        const match = matches[0]
        if (!match) return { symbol, points: [] }
        const series = await yahoo.history(match.symbol, from)
        return { symbol, points: series.points }
      } catch {
        return { symbol, points: [] }
      }
    },
  }
}
