import { describe, expect, it } from 'vitest'
import type { Portfolio, PriceSeries, Quote } from '../domain/types'
import type { Settings } from './schema'
import { DEFAULT_SETTINGS } from './schema'
import { parseImport, serialize } from './persistence'

const samplePortfolios: Portfolio[] = [
  {
    id: 'p1',
    name: 'Main',
    assets: [
      {
        id: 'a1',
        symbol: 'EUNL.DE',
        name: 'iShares Core MSCI World',
        currency: 'EUR',
        isin: 'IE00B4L5Y983',
        lots: [{ id: 'l1', date: '2024-01-01', quantity: 10, price: 80, fee: 1.5 }],
      },
    ],
  },
]

describe('serialize / parseImport round-trip', () => {
  it('preserves portfolios and settings', () => {
    const text = serialize(samplePortfolios, DEFAULT_SETTINGS, new Date('2024-06-01T00:00:00Z'))
    const parsed = parseImport(text)
    expect(parsed.portfolios).toEqual(samplePortfolios)
    expect(parsed.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('includes exportedAt as an ISO string', () => {
    const now = new Date('2024-06-01T12:34:56Z')
    const text = serialize(samplePortfolios, DEFAULT_SETTINGS, now)
    expect(JSON.parse(text).exportedAt).toBe(now.toISOString())
  })

  it('preserves the fetched price cache, so a reload does not need to refetch it', () => {
    const quotes: Record<string, Quote> = {
      'EUNL.DE': { symbol: 'EUNL.DE', price: 128.71, previousClose: 126.15, currency: 'EUR', time: 1_786_000_000_000 },
    }
    const history: Record<string, PriceSeries> = {
      'EUNL.DE': { symbol: 'EUNL.DE', points: [{ date: '2024-01-01', close: 100 }] },
    }
    const text = serialize(samplePortfolios, DEFAULT_SETTINGS, new Date('2024-06-01T00:00:00Z'), {
      quotes,
      history,
    })
    const parsed = parseImport(text)
    expect(parsed.quotes).toEqual(quotes)
    expect(parsed.history).toEqual(history)
  })

  it('defaults to an empty cache when none is given', () => {
    const text = serialize(samplePortfolios, DEFAULT_SETTINGS, new Date('2024-06-01T00:00:00Z'))
    const parsed = parseImport(text)
    expect(parsed.quotes).toEqual({})
    expect(parsed.history).toEqual({})
  })
})

describe('parseImport validation', () => {
  it('rejects invalid JSON', () => {
    expect(() => parseImport('{not json')).toThrow(/Not valid JSON/)
  })

  it('rejects an unknown schema id', () => {
    expect(() => parseImport(JSON.stringify({ schema: 'other/v9' }))).toThrow(
      /Unsupported file \(expected schema fundle\/v1\)/,
    )
  })

  it('still accepts a file exported under the old fin-tracker/v1 schema', () => {
    const { portfolios } = parseImport(
      JSON.stringify({
        schema: 'fin-tracker/v1',
        exportedAt: new Date().toISOString(),
        portfolios: samplePortfolios,
        settings: {},
      }),
    )
    expect(portfolios).toEqual(samplePortfolios)
  })

  it('rejects when portfolios is not an array', () => {
    expect(() =>
      parseImport(JSON.stringify({ schema: 'fundle/v1', portfolios: 'nope', settings: {} })),
    ).toThrow(/portfolios/)
  })

  function fileWithLot(lot: Record<string, unknown>) {
    return JSON.stringify({
      schema: 'fundle/v1',
      exportedAt: new Date().toISOString(),
      portfolios: [
        {
          id: 'p1',
          name: 'Main',
          assets: [
            {
              id: 'a1',
              symbol: 'EUNL.DE',
              name: 'iShares',
              currency: 'EUR',
              lots: [lot],
            },
          ],
        },
      ],
      settings: {},
    })
  }

  it('rejects a lot with a non-numeric quantity', () => {
    expect(() =>
      parseImport(fileWithLot({ date: '2024-01-01', quantity: 'abc', price: 10 })),
    ).toThrow(/quantity/)
  })

  it('coerces a numeric-string quantity', () => {
    const { portfolios } = parseImport(fileWithLot({ date: '2024-01-01', quantity: '10', price: 10 }))
    expect(portfolios[0]?.assets[0]?.lots[0]?.quantity).toBe(10)
  })

  it('defaults a missing fee to 0', () => {
    const { portfolios } = parseImport(fileWithLot({ date: '2024-01-01', quantity: 1, price: 10 }))
    expect(portfolios[0]?.assets[0]?.lots[0]?.fee).toBe(0)
  })

  it('drops unknown extra keys instead of carrying them through', () => {
    const { portfolios } = parseImport(
      fileWithLot({ date: '2024-01-01', quantity: 1, price: 10, bogus: 'nope' }),
    )
    expect(portfolios[0]?.assets[0]?.lots[0]).not.toHaveProperty('bogus')
  })

  it('merges partial settings over the defaults', () => {
    const text = JSON.stringify({
      schema: 'fundle/v1',
      exportedAt: new Date().toISOString(),
      portfolios: [],
      settings: { baseCurrency: 'USD' } as Partial<Settings>,
    })
    const { settings } = parseImport(text)
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, baseCurrency: 'USD' })
  })

  it('upgrades a proxyUrl that matches a known-obsolete past default', () => {
    for (const stale of ['https://corsproxy.io/?url=', 'https://api.allorigins.win/raw?url=']) {
      const { settings } = parseImport(
        JSON.stringify({ schema: 'fundle/v1', portfolios: [], settings: { proxyUrl: stale } }),
      )
      expect(settings.proxyUrl).toBe(DEFAULT_SETTINGS.proxyUrl)
    }
  })

  it('leaves a proxyUrl the user actually customized alone', () => {
    const { settings } = parseImport(
      JSON.stringify({
        schema: 'fundle/v1',
        portfolios: [],
        settings: { proxyUrl: 'https://my-own-proxy.example/?url=' },
      }),
    )
    expect(settings.proxyUrl).toBe('https://my-own-proxy.example/?url=')
  })

  it('imports a file with no quotes/history keys (older export) with an empty cache', () => {
    const { quotes, history } = parseImport(
      JSON.stringify({ schema: 'fundle/v1', portfolios: [], settings: {} }),
    )
    expect(quotes).toEqual({})
    expect(history).toEqual({})
  })

  it('drops a malformed cache entry instead of throwing', () => {
    const { quotes, history } = parseImport(
      JSON.stringify({
        schema: 'fundle/v1',
        portfolios: [],
        settings: {},
        quotes: { GOOD: { symbol: 'GOOD', price: 1, previousClose: 1, currency: 'EUR', time: 0 }, BAD: { price: 'nope' } },
        history: { GOOD: { symbol: 'GOOD', points: [{ date: '2024-01-01', close: 1 }] }, BAD: 'nope' },
      }),
    )
    expect(Object.keys(quotes)).toEqual(['GOOD'])
    expect(Object.keys(history)).toEqual(['GOOD'])
  })

  it('clamps refreshMinutes into [1, 120]', () => {
    const low = parseImport(
      JSON.stringify({ schema: 'fundle/v1', portfolios: [], settings: { refreshMinutes: 0 } }),
    )
    const high = parseImport(
      JSON.stringify({ schema: 'fundle/v1', portfolios: [], settings: { refreshMinutes: 9999 } }),
    )
    expect(low.settings.refreshMinutes).toBe(1)
    expect(high.settings.refreshMinutes).toBe(120)
  })
})
