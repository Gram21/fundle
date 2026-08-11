import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxied, fetchJson } from './proxy'
import { createYahooProvider } from './yahoo'
import { PriceProviderError } from './PriceProvider'

function stubFetch(body: string, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      text: () => Promise.resolve(body),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('proxied', () => {
  it('passes the url through unchanged for a blank proxy', () => {
    expect(proxied('https://example.com/x', '')).toBe('https://example.com/x')
    expect(proxied('https://example.com/x', '   ')).toBe('https://example.com/x')
  })

  it('encodes the target exactly once for a non-blank proxy', () => {
    const url = 'https://example.com/x?a=1&b=2'
    expect(proxied(url, 'https://proxy/?url=')).toBe(
      'https://proxy/?url=' + encodeURIComponent(url),
    )
  })
})

describe('fetchJson', () => {
  it('throws PriceProviderError (not a raw SyntaxError) when the proxy returns HTML', async () => {
    stubFetch('<!doctype html><html><body>dead proxy</body></html>')
    await expect(fetchJson('https://example.com', '')).rejects.toBeInstanceOf(PriceProviderError)
  })

  it('throws PriceProviderError on a non-ok response', async () => {
    stubFetch('rate limited', false, 429)
    await expect(fetchJson('https://example.com', '')).rejects.toThrow(PriceProviderError)
  })
})

describe('yahoo quote', () => {
  it('parses a realistic minimal chart payload', async () => {
    stubFetch(
      JSON.stringify({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 101.5,
                currency: 'USD',
                regularMarketTime: 1700000000, // seconds
                chartPreviousClose: 99.2,
              },
            },
          ],
        },
      }),
    )
    const yahoo = createYahooProvider({ proxyUrl: '' })
    const quote = await yahoo.quote('AAPL')
    expect(quote).toEqual({
      symbol: 'AAPL',
      price: 101.5,
      previousClose: 99.2,
      currency: 'USD',
      time: 1700000000 * 1000, // milliseconds
    })
  })

  it('prefers previousClose over chartPreviousClose when both are present', async () => {
    stubFetch(
      JSON.stringify({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: 10,
                currency: 'EUR',
                regularMarketTime: 1700000000,
                previousClose: 9,
                chartPreviousClose: 8,
              },
            },
          ],
        },
      }),
    )
    const yahoo = createYahooProvider({ proxyUrl: '' })
    const quote = await yahoo.quote('EUNL.DE')
    expect(quote.previousClose).toBe(9)
  })
})

describe('yahoo history', () => {
  it('skips null closes and returns ascending, deduplicated, YYYY-MM-DD dates', async () => {
    const day1 = 1700000000 // some Tuesday
    const day2 = day1 + 86400
    const day3 = day1 + 2 * 86400
    stubFetch(
      JSON.stringify({
        chart: {
          result: [
            {
              timestamp: [day3, day1, day2],
              indicators: {
                adjclose: [{ adjclose: [30, 10, null] }],
                quote: [{ close: [30, 10, 20] }],
              },
            },
          ],
        },
      }),
    )
    const yahoo = createYahooProvider({ proxyUrl: '' })
    const series = await yahoo.history('AAPL', '2023-01-01')
    expect(series.symbol).toBe('AAPL')
    expect(series.points).toEqual([
      { date: new Date(day1 * 1000).toISOString().slice(0, 10), close: 10 },
      { date: new Date(day2 * 1000).toISOString().slice(0, 10), close: 20 },
      { date: new Date(day3 * 1000).toISOString().slice(0, 10), close: 30 },
    ])
    for (const p of series.points) {
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('yahoo search', () => {
  it('drops entries without a symbol', async () => {
    stubFetch(
      JSON.stringify({
        quotes: [
          { symbol: 'AAPL', shortname: 'Apple Inc.' },
          { longname: 'No Symbol Co' },
          { symbol: 'IE00B4L5Y983', longname: 'iShares Core MSCI World' },
        ],
      }),
    )
    const yahoo = createYahooProvider({ proxyUrl: '' })
    const results = await yahoo.search('apple')
    expect(results).toEqual([
      { symbol: 'AAPL', name: 'Apple Inc.', currency: undefined, exchange: undefined },
      {
        symbol: 'IE00B4L5Y983',
        name: 'iShares Core MSCI World',
        currency: undefined,
        exchange: undefined,
      },
    ])
  })
})
