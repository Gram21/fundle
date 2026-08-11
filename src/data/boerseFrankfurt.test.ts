import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBoerseFrankfurtProvider, isBoerseFrankfurtSymbol } from './boerseFrankfurt'
import { PriceProviderError } from './PriceProvider'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function emptyResponse(ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(''),
  })
}

function badRequest() {
  return Promise.resolve({
    ok: false,
    status: 400,
    text: () => Promise.resolve('{"status":400,"error":"Bad Request"}'),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isBoerseFrankfurtSymbol', () => {
  it('accepts the ISIN@MIC composite this provider produces', () => {
    expect(isBoerseFrankfurtSymbol('DE000A0H0728@XETR')).toBe(true)
    expect(isBoerseFrankfurtSymbol('DE000A0H0728@XFRA')).toBe(true)
  })

  it('rejects plain Yahoo/Twelve Data style symbols', () => {
    expect(isBoerseFrankfurtSymbol('EUNL.DE')).toBe(false)
    expect(isBoerseFrankfurtSymbol('AAPL')).toBe(false)
    expect(isBoerseFrankfurtSymbol('DE000A0H0728')).toBe(false)
  })
})

describe('boerseFrankfurt search', () => {
  it('returns no results for a non-ISIN query without hitting the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    expect(await provider.search('apple')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns one EUR hit per MIC that actually has a quote for the ISIN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('mic=XETR')) return jsonResponse({ lastPrice: 34.13, changeToPrevDayAbsolute: 0.09 })
        return emptyResponse() // XFRA: no data for this instrument
      }),
    )
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    const results = await provider.search('de000a0h0728')
    expect(results).toEqual([
      { symbol: 'DE000A0H0728@XETR', name: 'DE000A0H0728', isin: 'DE000A0H0728', currency: 'EUR', exchange: 'XETR' },
    ])
  })

  it('treats a 400 (isin not traded on that mic) as simply no hit', async () => {
    vi.stubGlobal('fetch', vi.fn(() => badRequest()))
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    expect(await provider.search('DE000A0H0728')).toEqual([])
  })
})

describe('boerseFrankfurt quote', () => {
  it('derives previousClose from lastPrice minus the absolute change, currency EUR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          lastPrice: 34.13,
          changeToPrevDayAbsolute: 0.09,
          timestampLastPrice: '2026-08-11T15:35:54Z',
        }),
      ),
    )
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    const quote = await provider.quote('DE000A0H0728@XETR')
    expect(quote).toEqual({
      symbol: 'DE000A0H0728@XETR',
      price: 34.13,
      previousClose: 34.04,
      currency: 'EUR',
      time: Date.parse('2026-08-11T15:35:54Z'),
    })
  })

  it('rejects a symbol that is not its own ISIN@MIC composite', async () => {
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    await expect(provider.quote('EUNL.DE')).rejects.toBeInstanceOf(PriceProviderError)
  })

  it('throws when the mic has no data for the isin', async () => {
    vi.stubGlobal('fetch', vi.fn(() => emptyResponse()))
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    await expect(provider.quote('DE000A0H0728@XETR')).rejects.toBeInstanceOf(PriceProviderError)
  })
})

describe('boerseFrankfurt history', () => {
  it('delegates to a Yahoo symbol found via ISIN search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('finance/search')) {
          return jsonResponse({ quotes: [{ symbol: 'EXXY.DE', shortname: 'iShares Gold' }] })
        }
        // chart call
        return jsonResponse({
          chart: {
            result: [
              {
                timestamp: [1700000000],
                indicators: { quote: [{ close: [34.1] }] },
              },
            ],
          },
        })
      }),
    )
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    const series = await provider.history('DE000A0H0728@XETR', '2023-01-01')
    expect(series.symbol).toBe('DE000A0H0728@XETR')
    expect(series.points).toEqual([
      { date: new Date(1700000000 * 1000).toISOString().slice(0, 10), close: 34.1 },
    ])
  })

  it('returns an empty series (not a throw) when Yahoo has no match for the isin either', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ quotes: [] })),
    )
    const provider = createBoerseFrankfurtProvider({ proxyUrl: '' })
    const series = await provider.history('LU0552385295@XFRA', '2023-01-01')
    expect(series).toEqual({ symbol: 'LU0552385295@XFRA', points: [] })
  })
})
