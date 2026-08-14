import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAlphaVantageProvider } from './alphaVantage'
import { PriceProviderError } from './PriceProvider'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('alphaVantage requires an API key', () => {
  it('rejects every call when no key is configured, without hitting the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const provider = createAlphaVantageProvider({ apiKey: '' })
    await expect(provider.search('IBM')).rejects.toBeInstanceOf(PriceProviderError)
    await expect(provider.quote('IBM')).rejects.toBeInstanceOf(PriceProviderError)
    await expect(provider.history('IBM', '2024-01-01')).rejects.toBeInstanceOf(PriceProviderError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('alphaVantage rate-limit / daily-cap detection', () => {
  it('treats an "Information" body (HTTP 200) as a real failure, not empty data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ Information: 'The **demo** API key is for demo purposes only.' }),
      ),
    )
    const provider = createAlphaVantageProvider({ apiKey: 'k' })
    await expect(provider.search('IBM')).rejects.toThrow(/demo/)
    await expect(provider.quote('IBM')).rejects.toBeInstanceOf(PriceProviderError)
    await expect(provider.history('IBM', '2024-01-01')).rejects.toBeInstanceOf(PriceProviderError)
  })

  it('also catches the older "Note" rate-limit shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ Note: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.' })),
    )
    const provider = createAlphaVantageProvider({ apiKey: 'k' })
    await expect(provider.quote('IBM')).rejects.toThrow(/25 requests per day/)
  })
})

describe('alphaVantage quote', () => {
  it('parses price/previousClose and the trading-day timestamp', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          'Global Quote': {
            '05. price': '237.1400',
            '08. previous close': '235.9800',
            '07. latest trading day': '2026-08-13',
          },
        }),
      ),
    )
    const provider = createAlphaVantageProvider({ apiKey: 'k' })
    const quote = await provider.quote('IBM')
    expect(quote.symbol).toBe('IBM')
    expect(quote.price).toBe(237.14)
    expect(quote.previousClose).toBe(235.98)
    expect(quote.time).toBe(Date.parse('2026-08-13'))
  })

  it('throws when Global Quote is missing/empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ 'Global Quote': {} })))
    const provider = createAlphaVantageProvider({ apiKey: 'k' })
    await expect(provider.quote('IBM')).rejects.toBeInstanceOf(PriceProviderError)
  })
})

describe('alphaVantage history', () => {
  it('parses the daily series, filters by from-date, sorts ascending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          'Time Series (Daily)': {
            '2026-08-13': { '4. close': '237.14' },
            '2026-08-12': { '4. close': '235.98' },
            '2020-01-01': { '4. close': '100.00' }, // before `from`, dropped
          },
        }),
      ),
    )
    const provider = createAlphaVantageProvider({ apiKey: 'k' })
    const series = await provider.history('IBM', '2026-01-01')
    expect(series).toEqual({
      symbol: 'IBM',
      points: [
        { date: '2026-08-12', close: 235.98 },
        { date: '2026-08-13', close: 237.14 },
      ],
    })
  })
})

describe('alphaVantage search', () => {
  it('maps bestMatches, drops entries missing a symbol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          bestMatches: [
            { '1. symbol': 'IBM', '2. name': 'International Business Machines', '4. region': 'United States', '8. currency': 'USD' },
            { '2. name': 'no symbol here' },
          ],
        }),
      ),
    )
    const provider = createAlphaVantageProvider({ apiKey: 'k' })
    const results = await provider.search('ibm')
    expect(results).toEqual([
      { symbol: 'IBM', name: 'International Business Machines', currency: 'USD', exchange: 'United States' },
    ])
  })
})
