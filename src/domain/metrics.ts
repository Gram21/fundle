/**
 * Result shapes produced by the domain layer and consumed by the UI.
 * Implementations live in portfolio.ts (snapshots) and performance.ts (series).
 */
import type { Asset, ISODate } from './types'

export interface AssetSnapshot {
  asset: Asset
  quantity: number
  price: number
  previousClose: number
  marketValue: number
  /** Sum over lots of quantity * price + fee. */
  costBasis: number
  dayChangeAbs: number
  dayChangePct: number
  totalChangeAbs: number
  totalChangePct: number
}

/** Display data for a fully sold asset — its realized P/L, no live price. */
export interface SoldAssetSnapshot {
  asset: Asset
  proceeds: number
  costBasis: number
  realizedChangeAbs: number
  realizedChangePct: number
}

export interface PortfolioSnapshot {
  totalValue: number
  totalCost: number
  dayChangeAbs: number
  dayChangePct: number
  totalChangeAbs: number
  totalChangePct: number
  assets: AssetSnapshot[]
  soldAssets: SoldAssetSnapshot[]
}

/** One point of a performance chart line. */
export interface SeriesPoint {
  date: ISODate
  /** Market value of everything held on that date. */
  value: number
  /** Cost basis of everything held on that date. */
  cost: number
  /**
   * Cumulative time-weighted return in percent, cash-flow neutral: buying more
   * does not move this line, only price moves do. Inflows are valued at the same
   * close as the position, so a buy price that differs from the provider's close
   * (adjusted history, another exchange, fees) lands in `cost`, not here.
   */
  twrPct: number
  /** value/cost - 1, in percent. Moves when new money comes in. */
  simplePct: number
}
