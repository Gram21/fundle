import { describe, it, expect } from 'vitest'
import type { Asset, Portfolio, Quote } from './types'
import { assetQuantity, assetCostBasis, assetSnapshot, portfolioSnapshot } from './portfolio'

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    symbol: 'AAA',
    name: 'Asset A',
    currency: 'EUR',
    lots: [
      { id: 'l1', date: '2024-01-01', quantity: 10, price: 100 },
      { id: 'l2', date: '2024-02-01', quantity: 5, price: 120, fee: 5 },
    ],
    ...overrides,
  }
}

describe('assetQuantity', () => {
  it('sums all lots when asOf omitted', () => {
    expect(assetQuantity(asset())).toBe(15)
  })

  it('filters lots by asOf', () => {
    expect(assetQuantity(asset(), '2024-01-15')).toBe(10)
    expect(assetQuantity(asset(), '2024-02-01')).toBe(15)
    expect(assetQuantity(asset(), '2023-12-31')).toBe(0)
  })
})

describe('assetCostBasis', () => {
  it('sums quantity*price + fee for all lots', () => {
    // 10*100 + (5*120 + 5) = 1000 + 605 = 1605
    expect(assetCostBasis(asset())).toBe(1605)
  })

  it('filters lots by asOf and includes fees', () => {
    expect(assetCostBasis(asset(), '2024-01-15')).toBe(1000)
    expect(assetCostBasis(asset(), '2024-02-01')).toBe(1605)
  })
})

describe('assetSnapshot', () => {
  it('computes day and total change from a quote', () => {
    const a = asset()
    const quote: Quote = { symbol: 'AAA', price: 130, previousClose: 125, currency: 'EUR', time: 0 }
    const snap = assetSnapshot(a, quote)
    expect(snap.quantity).toBe(15)
    expect(snap.costBasis).toBe(1605)
    expect(snap.marketValue).toBe(15 * 130)
    expect(snap.dayChangeAbs).toBe(15 * (130 - 125))
    expect(snap.dayChangePct).toBeCloseTo((130 / 125 - 1) * 100)
    expect(snap.totalChangeAbs).toBe(15 * 130 - 1605)
    expect(snap.totalChangePct).toBeCloseTo(((15 * 130 - 1605) / 1605) * 100)
  })

  it('handles a missing quote with zero price/previousClose fallback', () => {
    const a = asset()
    const snap = assetSnapshot(a, undefined)
    expect(snap.price).toBe(0)
    expect(snap.previousClose).toBe(0)
    expect(snap.marketValue).toBe(0)
    expect(snap.dayChangeAbs).toBe(0)
    expect(snap.dayChangePct).toBe(0)
    expect(snap.totalChangeAbs).toBe(-1605)
  })

  it('guards zero cost basis for totalChangePct', () => {
    const a = asset({ lots: [] })
    const quote: Quote = { symbol: 'AAA', price: 10, previousClose: 10, currency: 'EUR', time: 0 }
    const snap = assetSnapshot(a, quote)
    expect(snap.costBasis).toBe(0)
    expect(snap.totalChangePct).toBe(0)
  })
})

describe('portfolioSnapshot', () => {
  it('aggregates two assets, sorted by marketValue desc, with a missing quote', () => {
    const a1 = asset({
      id: 'a1',
      symbol: 'AAA',
      lots: [{ id: 'l1', date: '2024-01-01', quantity: 10, price: 100 }],
    })
    const a2 = asset({
      id: 'a2',
      symbol: 'BBB',
      lots: [{ id: 'l2', date: '2024-01-01', quantity: 20, price: 50 }],
    })
    const portfolio: Portfolio = { id: 'p1', name: 'P', assets: [a1, a2] }
    const quotes: Record<string, Quote> = {
      AAA: { symbol: 'AAA', price: 110, previousClose: 100, currency: 'EUR', time: 0 },
      // BBB quote missing
    }
    const snap = portfolioSnapshot(portfolio, quotes)

    // AAA: qty10, price110, prevClose100 -> marketValue 1100, cost 1000
    // BBB: no quote -> price 0, previousClose 0 -> marketValue 0, cost 1000
    expect(snap.totalValue).toBe(1100)
    expect(snap.totalCost).toBe(2000)
    expect(snap.dayChangeAbs).toBe(10 * (110 - 100))
    // prevValue = 10*100 (AAA) + 20*0 (BBB, previousClose fallback 0) = 1000
    expect(snap.dayChangePct).toBeCloseTo((100 / 1000) * 100)
    expect(snap.totalChangeAbs).toBe(1100 - 2000)
    expect(snap.totalChangePct).toBeCloseTo(((1100 - 2000) / 2000) * 100)
    // AAA has marketValue 1100 > BBB's 0, so AAA first
    expect(snap.assets.map((a) => a.asset.symbol)).toEqual(['AAA', 'BBB'])
  })

  it('guards division by zero for an empty portfolio', () => {
    const portfolio: Portfolio = { id: 'p1', name: 'Empty', assets: [] }
    const snap = portfolioSnapshot(portfolio, {})
    expect(snap.totalValue).toBe(0)
    expect(snap.totalCost).toBe(0)
    expect(snap.dayChangePct).toBe(0)
    expect(snap.totalChangePct).toBe(0)
    expect(snap.assets).toEqual([])
  })
})
