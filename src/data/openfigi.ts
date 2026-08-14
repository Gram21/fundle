/**
 * OpenFIGI adapter. Free, no key required (an optional key just raises the rate limit), and the
 * best ISIN resolver available - but it only maps an ISIN to a ticker/exchange, it carries no
 * price data at all. So its search() resolves the ISIN and hands back a plain, Yahoo-compatible
 * symbol; quote()/history() just delegate straight to Yahoo. Once resolved, the stored symbol is
 * indistinguishable from one a user typed directly - no special per-symbol dispatch needed
 * afterwards, unlike boerseFrankfurt.ts/eodhd.ts which encode extra state into the symbol.
 *
 * The mapping endpoint is POST-only with a JSON body, which none of the free public GET-only CORS
 * proxies can relay - this realistically needs a custom proxy that forwards method/body (see
 * worker/cors-proxy.js) to work at all. Automatically added to search results alongside the
 * primary provider (like Börse Frankfurt) since it costs nothing to try.
 */
import type { PriceProvider, SearchResult } from './PriceProvider'
import type { ISODate, PriceSeries } from '../domain/types'
import { fetchJson } from './proxy'
import { createYahooProvider } from './yahoo'

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/

// OpenFIGI's exchCode -> the suffix Yahoo Finance expects. Far from exhaustive (OpenFIGI covers
// dozens of exchanges) - unmapped codes fall back to the bare ticker, which works for US listings
// and fails harmlessly (search just won't offer that hit) for anything else. Extend as needed.
const EXCH_TO_YAHOO_SUFFIX: Record<string, string> = {
  US: '',
  GR: '.DE',
  GY: '.DE',
  GF: '.F',
  LN: '.L',
  PA: '.PA',
  IM: '.MI',
  SW: '.SW',
  NA: '.AS',
  ID: '.IR',
}

interface FigiHit {
  ticker?: string
  exchCode?: string
  name?: string
  securityType?: string
}

interface FigiMappingResult {
  data?: FigiHit[]
  error?: string
}

export function createOpenFigiProvider(opts: { apiKey?: string; proxyUrl: string }): PriceProvider {
  const yahoo = createYahooProvider({ proxyUrl: opts.proxyUrl })

  return {
    id: 'openfigi',
    label: 'OpenFIGI (ISIN lookup, free, custom proxy recommended)',

    async search(query: string): Promise<SearchResult[]> {
      const isin = query.trim().toUpperCase()
      if (!ISIN_RE.test(isin)) return []

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (opts.apiKey?.trim()) headers['X-OPENFIGI-APIKEY'] = opts.apiKey.trim()

      let results: FigiMappingResult[]
      try {
        results = await fetchJson<FigiMappingResult[]>(
          'https://api.openfigi.com/v3/mapping',
          opts.proxyUrl,
          { method: 'POST', headers, body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]) },
        )
      } catch {
        // No custom proxy configured, or OpenFIGI is unreachable - this is an automatic
        // supplement, not something the user explicitly chose, so fail quiet like Börse
        // Frankfurt's search does.
        return []
      }

      const hits = results[0]?.data ?? []
      const seen = new Set<string>()
      const out: SearchResult[] = []
      for (const hit of hits) {
        if (!hit.ticker || !hit.exchCode) continue
        const suffix = EXCH_TO_YAHOO_SUFFIX[hit.exchCode]
        if (suffix === undefined) continue
        const symbol = `${hit.ticker}${suffix}`
        if (seen.has(symbol)) continue
        seen.add(symbol)
        out.push({ symbol, name: hit.name ?? hit.ticker, isin, exchange: hit.exchCode })
      }
      return out
    },

    quote(symbol: string) {
      return yahoo.quote(symbol)
    },

    history(symbol: string, from: ISODate): Promise<PriceSeries> {
      return yahoo.history(symbol, from)
    },
  }
}

