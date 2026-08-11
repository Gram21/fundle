import { describe, it, expect } from 'vitest'
import type { Asset, PriceSeries } from './types'
import { buildAssetSeries, buildPortfolioSeries } from './performance'

const d1 = '2024-01-01'
const d2 = '2024-01-02'
const d3 = '2024-01-03'

describe('buildAssetSeries', () => {
  it('single lot, pure price movement -> twrPct tracks price 1:1', () => {
    const asset: Asset = {
      id: 'a1',
      symbol: 'AAA',
      name: 'A',
      currency: 'EUR',
      lots: [{ id: 'l1', date: d1, quantity: 10, price: 100 }],
    }
    const series: PriceSeries = {
      symbol: 'AAA',
      points: [
        { date: d1, close: 100 },
        { date: d2, close: 110 },
        { date: d3, close: 121 },
      ],
    }
    const pts = buildAssetSeries(asset, series)
    expect(pts.map((p) => p.date)).toEqual([d1, d2, d3])
    expect(pts.map((p) => p.twrPct)).toEqual([
      expect.closeTo(0),
      expect.closeTo(10),
      expect.closeTo(21),
    ])
    expect(pts[0]!.value).toBe(1000)
    expect(pts[0]!.cost).toBe(1000)
  })
})

describe('the invariant: buying more must not move twrPct on purchase day', () => {
  const asset: Asset = {
    id: 'a1',
    symbol: 'AAA',
    name: 'A',
    currency: 'EUR',
    lots: [
      { id: 'l1', date: d1, quantity: 10, price: 100 },
      { id: 'l2', date: d2, quantity: 10, price: 120 },
    ],
  }
  const series: PriceSeries = {
    symbol: 'AAA',
    points: [
      { date: d1, close: 100 },
      { date: d2, close: 120 },
      { date: d3, close: 132 },
    ],
  }
  const pts = buildAssetSeries(asset, series)

  it('purchase day: value/cost inflate but twrPct stays the pre-purchase return', () => {
    const d2Point = pts[1]!
    expect(d2Point.value).toBe(2400)
    expect(d2Point.cost).toBe(2200)
    expect(d2Point.simplePct).toBeCloseTo(9.0909, 3)
    expect(d2Point.twrPct).toBeCloseTo(20, 6)
    // regression guard: simplePct and twrPct must diverge on a purchase day
    expect(d2Point.simplePct).not.toBeCloseTo(d2Point.twrPct, 1)
  })

  it('afterwards twrPct only reflects price movement (20% then +10% => 32%)', () => {
    const d3Point = pts[2]!
    expect(d3Point.twrPct).toBeCloseTo(32, 6)
  })
})

describe('buildPortfolioSeries', () => {
  it('forward-fills a missing date for one asset without producing NaN', () => {
    const assetA: Asset = {
      id: 'a1',
      symbol: 'AAA',
      name: 'A',
      currency: 'EUR',
      lots: [{ id: 'l1', date: d1, quantity: 10, price: 100 }],
    }
    const assetB: Asset = {
      id: 'b1',
      symbol: 'BBB',
      name: 'B',
      currency: 'EUR',
      lots: [{ id: 'l2', date: d1, quantity: 5, price: 50 }],
    }
    const seriesBySymbol: Record<string, PriceSeries> = {
      AAA: {
        symbol: 'AAA',
        points: [
          { date: d1, close: 100 },
          // d2 missing for A
          { date: d3, close: 110 },
        ],
      },
      BBB: {
        symbol: 'BBB',
        points: [
          { date: d1, close: 50 },
          { date: d2, close: 55 },
          { date: d3, close: 60 },
        ],
      },
    }
    const pts = buildPortfolioSeries([assetA, assetB], seriesBySymbol)
    expect(pts.map((p) => p.date)).toEqual([d1, d2, d3])

    const d2Point = pts[1]!
    // A forward-filled at 100 (last known close), B at its real close of 55
    expect(d2Point.value).toBe(10 * 100 + 5 * 55)
    expect(d2Point.cost).toBe(10 * 100 + 5 * 50)
    expect(Number.isFinite(d2Point.value)).toBe(true)
    expect(Number.isFinite(d2Point.twrPct)).toBe(true)
    expect(Number.isFinite(d2Point.simplePct)).toBe(true)
  })

  it('an asset bought mid-series does not retroactively change earlier points', () => {
    const assetA: Asset = {
      id: 'a1',
      symbol: 'AAA',
      name: 'A',
      currency: 'EUR',
      lots: [{ id: 'l1', date: d1, quantity: 10, price: 100 }],
    }
    const seriesAOnly: Record<string, PriceSeries> = {
      AAA: {
        symbol: 'AAA',
        points: [
          { date: d1, close: 100 },
          { date: d2, close: 105 },
          { date: d3, close: 110 },
        ],
      },
    }
    const before = buildPortfolioSeries([assetA], seriesAOnly)

    const assetB: Asset = {
      id: 'b1',
      symbol: 'BBB',
      name: 'B',
      currency: 'EUR',
      lots: [{ id: 'l2', date: d3, quantity: 10, price: 200 }],
    }
    const seriesWithB: Record<string, PriceSeries> = {
      ...seriesAOnly,
      BBB: { symbol: 'BBB', points: [{ date: d3, close: 200 }] },
    }
    const after = buildPortfolioSeries([assetA, assetB], seriesWithB)

    // d1 and d2 are untouched by B's later arrival
    expect(after[0]).toEqual(before[0])
    expect(after[1]).toEqual(before[1])
    // d3 now includes B
    expect(after[2]!.value).toBe(before[2]!.value + 10 * 200)
  })

  it('every twrPct/simplePct in an output series is finite', () => {
    const assetA: Asset = {
      id: 'a1',
      symbol: 'AAA',
      name: 'A',
      currency: 'EUR',
      lots: [
        { id: 'l1', date: d1, quantity: 10, price: 100 },
        { id: 'l2', date: d2, quantity: 10, price: 120 },
      ],
    }
    const assetB: Asset = {
      id: 'b1',
      symbol: 'BBB',
      name: 'B',
      currency: 'EUR',
      lots: [{ id: 'l3', date: d3, quantity: 5, price: 60 }],
    }
    const seriesBySymbol: Record<string, PriceSeries> = {
      AAA: {
        symbol: 'AAA',
        points: [
          { date: d1, close: 100 },
          { date: d2, close: 120 },
          { date: d3, close: 132 },
        ],
      },
      BBB: {
        symbol: 'BBB',
        points: [{ date: d3, close: 60 }],
      },
    }
    const pts = buildPortfolioSeries([assetA, assetB], seriesBySymbol)
    expect(pts.length).toBeGreaterThan(0)
    for (const p of pts) {
      expect(Number.isFinite(p.twrPct)).toBe(true)
      expect(Number.isFinite(p.simplePct)).toBe(true)
      expect(Number.isFinite(p.value)).toBe(true)
      expect(Number.isFinite(p.cost)).toBe(true)
    }
  })

  it('a buy price above the market close does not become a price move', () => {
    // Paid 200/share for something the provider closes at 100 — happens with
    // dividend-adjusted history, a fill on another exchange, or a typo.
    const asset: Asset = {
      id: 'a1',
      symbol: 'AAA',
      name: 'A',
      currency: 'EUR',
      lots: [
        { id: 'l1', date: d1, quantity: 10, price: 100 },
        { id: 'l2', date: d2, quantity: 10, price: 200, fee: 10 },
      ],
    }
    const series: PriceSeries = {
      symbol: 'AAA',
      points: [
        { date: d1, close: 100 },
        { date: d2, close: 100 },
        { date: d3, close: 110 },
      ],
    }
    const pts = buildAssetSeries(asset, series)
    // The price never moved on d2, so the return must be flat there...
    expect(pts[1]!.twrPct).toBeCloseTo(0, 8)
    // ...while the overpayment stays visible in the cost-basis view.
    expect(pts[1]!.cost).toBe(3010)
    expect(pts[1]!.simplePct).toBeCloseTo((2000 / 3010 - 1) * 100, 8)
    // d3 is a genuine +10% move on the whole position.
    expect(pts[2]!.twrPct).toBeCloseTo(10, 8)
  })

  it('a buy dated on a non-trading day still counts as a cash flow, not a gain', () => {
    // Fri 2024-01-05 and Mon 2024-01-08 trade; the second lot is dated Sat 2024-01-06.
    const asset: Asset = {
      id: 'a1',
      symbol: 'AAA',
      name: 'A',
      currency: 'EUR',
      lots: [
        { id: 'l1', date: '2024-01-05', quantity: 10, price: 100 },
        { id: 'l2', date: '2024-01-06', quantity: 10, price: 100 },
      ],
    }
    const series: PriceSeries = {
      symbol: 'AAA',
      points: [
        { date: '2024-01-05', close: 100 },
        { date: '2024-01-08', close: 100 },
      ],
    }
    const pts = buildAssetSeries(asset, series)
    const monday = pts.find((p) => p.date === '2024-01-08')!
    expect(monday.value).toBe(2000)
    expect(monday.cost).toBe(2000)
    // Price never moved, so the return must stay flat despite the value doubling.
    expect(monday.twrPct).toBeCloseTo(0, 8)
  })
})
