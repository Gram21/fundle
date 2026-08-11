import type { Asset, ISODate, PriceSeries } from './types'
import type { SeriesPoint } from './metrics'
import { assetCostBasis, assetQuantity } from './portfolio'

/**
 * Shares that arrived between the previous charted date (exclusive) and `date`
 * (inclusive). Buy orders are often dated on a day the exchange never traded —
 * a weekend or a holiday — so matching lot.date against the price axis exactly
 * would silently drop the inflow and report it as a gain.
 */
function quantityAddedUntil(asset: Asset, after: ISODate, date: ISODate): number {
  return asset.lots
    .filter((l) => l.date > after && l.date <= date)
    .reduce((sum, l) => sum + l.quantity, 0)
}

/** Cash actually paid for those same lots, used when no market price exists yet. */
function cashPaidUntil(asset: Asset, after: ISODate, date: ISODate): number {
  return asset.lots
    .filter((l) => l.date > after && l.date <= date)
    .reduce((sum, l) => sum + l.quantity * l.price + (l.fee ?? 0), 0)
}

/**
 * Sale proceeds realized in (after, date] — the negative counterpart to
 * quantityAddedUntil/cashPaidUntil. On the day a sale lands, this asset's quantity
 * (and thus its value contribution) has already dropped to 0, so subtracting the
 * proceeds from `flow` makes that day's twr factor `(0 - (-proceeds)) / prevValue`,
 * i.e. it books the sale price against the last known mark-to-market value exactly
 * once. Same weekend/holiday date-range handling as a buy.
 */
function saleProceedsUntil(asset: Asset, after: ISODate, date: ISODate): number {
  const sale = asset.sale
  if (!sale || !(sale.date > after && sale.date <= date)) return 0
  return sale.quantity * sale.price - (sale.fee ?? 0)
}

export function buildPortfolioSeries(
  assets: Asset[],
  seriesBySymbol: Record<string, PriceSeries>,
): SeriesPoint[] {
  const allLots = assets.flatMap((a) => a.lots)
  if (allLots.length === 0) return []
  const earliestLotDate = allLots.reduce((min, l) => (l.date < min ? l.date : min), allLots[0]!.date)

  const dateSet = new Set<ISODate>()
  for (const asset of assets) {
    const series = seriesBySymbol[asset.symbol]
    if (!series) continue
    for (const p of series.points) dateSet.add(p.date)
  }
  const dates = [...dateSet].filter((d) => d >= earliestLotDate).sort()

  // forward-fill pointer per asset into its (ascending) price points
  const pointers = new Map<string, number>(assets.map((a) => [a.id, 0]))

  let cumulative = 1
  let prevValue = 0
  let prevDate = ''
  const result: SeriesPoint[] = []

  for (const date of dates) {
    let value = 0
    let cost = 0
    let flow = 0

    for (const asset of assets) {
      const points = seriesBySymbol[asset.symbol]?.points ?? []
      let idx = pointers.get(asset.id) ?? 0
      while (idx < points.length && points[idx]!.date <= date) idx++
      pointers.set(asset.id, idx)
      const closeFF = idx > 0 ? points[idx - 1]!.close : undefined

      const quantity = assetQuantity(asset, date)
      const costBasis = assetCostBasis(asset, date)
      cost += costBasis
      // quantity===0 (nothing held, e.g. after a full sale) must value at 0 even when no
      // price point exists yet - falling back to costBasis is only a stand-in for "just
      // bought, price not in yet", and must not resurrect a sold asset's value.
      value += quantity === 0 ? 0 : closeFF !== undefined ? quantity * closeFF : costBasis
      // The inflow is valued at the SAME close the position is valued at, not at the
      // cash paid. Those two differ routinely — the provider serves dividend-adjusted
      // closes, the fill happened on another exchange, or a fee was charged — and
      // subtracting cash while adding market value books that gap as a price move,
      // which is exactly the jump this line must not have. The paid-vs-market
      // difference is a cost-basis effect and stays visible in cost/simplePct.
      const added = quantityAddedUntil(asset, prevDate, date)
      flow +=
        closeFF !== undefined ? added * closeFF : cashPaidUntil(asset, prevDate, date)
      flow -= saleProceedsUntil(asset, prevDate, date)
    }

    const simplePct = cost ? (value / cost - 1) * 100 : 0

    let dailyFactor = prevValue > 0 ? (value - flow) / prevValue : 1
    if (!(prevValue > 0) || !isFinite(dailyFactor) || dailyFactor <= 0) dailyFactor = 1
    cumulative *= dailyFactor
    const twrPct = (cumulative - 1) * 100

    result.push({ date, value, cost, twrPct, simplePct })
    prevValue = value
    prevDate = date
  }

  return result
}

export function buildAssetSeries(asset: Asset, series: PriceSeries): SeriesPoint[] {
  return buildPortfolioSeries([asset], { [asset.symbol]: series })
}
