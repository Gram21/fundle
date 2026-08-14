import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEodhdProvider, isEodhdSymbol } from './eodhd'
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

describe('isEodhdSymbol', () => {
  it('accepts the TICKER.EXCHANGE@CCY composite this provider produces', () => {
    expect(isEodhdSymbol('VWRD.LSE@USD')).toBe(true)
    expect(isEodhdSymbol('MCD.US@USD')).toBe(true)
  })

  it('rejects plain symbols and the Börse Frankfurt ISIN@MIC shape', () => {
    expect(isEodhdSymbol('EUNL.DE')).toBe(false)
    expect(isEodhdSymbol('AAPL')).toBe(false)
    expect(isEodhdSymbol('DE000A0H0728@XETR')).toBe(false) // 4-letter MIC, not a 3-letter currency
  })
})

describe('eodhd requires an API key', () => {
  it('rejects every call when no key is configured, without hitting the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const provider = createEodhdProvider({ apiKey: '', proxyUrl: '' })
    await expect(provider.search('AAPL')).rejects.toBeInstanceOf(PriceProviderError)
    await expect(provider.quote('MCD.US@USD')).rejects.toBeInstanceOf(PriceProviderError)
    await expect(provider.history('MCD.US@USD', '2023-01-01')).rejects.toBeInstanceOf(PriceProviderError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('eodhd search', () => {
  it('encodes ticker.exchange and currency into the symbol, drops hits missing required fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          { Code: 'MCD', Exchange: 'US', Name: "McDonald's Corp", Currency: 'USD', ISIN: 'US5801351017' },
          { Code: 'NOPE', Exchange: 'US' }, // missing Currency - dropped
        ]),
      ),
    )
    const provider = createEodhdProvider({ apiKey: 'k', proxyUrl: '' })
    const results = await provider.search('mcdonald')
    expect(results).toEqual([
      { symbol: 'MCD.US@USD', name: "McDonald's Corp", isin: 'US5801351017', currency: 'USD', exchange: 'US' },
    ])
  })
})

describe('eodhd quote', () => {
  it('decodes the currency from the symbol, converts the timestamp to milliseconds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ close: 305.4, previousClose: 305.26, timestamp: 1700000000 })),
    )
    const provider = createEodhdProvider({ apiKey: 'k', proxyUrl: '' })
    const quote = await provider.quote('MCD.US@USD')
    expect(quote).toEqual({
      symbol: 'MCD.US@USD',
      price: 305.4,
      previousClose: 305.26,
      currency: 'USD',
      time: 1700000000 * 1000,
    })
  })

  it('rejects a symbol that is not its own composite', async () => {
    const provider = createEodhdProvider({ apiKey: 'k', proxyUrl: '' })
    await expect(provider.quote('EUNL.DE')).rejects.toBeInstanceOf(PriceProviderError)
  })

  it('throws when the response has no price data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    const provider = createEodhdProvider({ apiKey: 'k', proxyUrl: '' })
    await expect(provider.quote('MCD.US@USD')).rejects.toBeInstanceOf(PriceProviderError)
  })
})

describe('eodhd history', () => {
  it('prefers adjusted_close, falls back to close, skips rows missing both', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          { date: '2024-01-01', close: 100, adjusted_close: 99.5 },
          { date: '2024-01-02', close: 101 },
          { date: '2024-01-03' },
        ]),
      ),
    )
    const provider = createEodhdProvider({ apiKey: 'k', proxyUrl: '' })
    const series = await provider.history('MCD.US@USD', '2024-01-01')
    expect(series).toEqual({
      symbol: 'MCD.US@USD',
      points: [
        { date: '2024-01-01', close: 99.5 },
        { date: '2024-01-02', close: 101 },
      ],
    })
  })
})
