import type { Asset, ISODate, Portfolio, Quote } from './types'
import type { AssetSnapshot, PortfolioSnapshot, SoldAssetSnapshot } from './metrics'

function lotsUpTo(asset: Asset, asOf?: ISODate) {
  return asOf ? asset.lots.filter((l) => l.date <= asOf) : asset.lots
}

export function assetQuantity(asset: Asset, asOf?: ISODate): number {
  const bought = lotsUpTo(asset, asOf).reduce((sum, l) => sum + l.quantity, 0)
  if (asset.sale && (asOf === undefined || asOf >= asset.sale.date)) {
    return Math.max(0, bought - asset.sale.quantity)
  }
  return bought
}

export function assetCostBasis(asset: Asset, asOf?: ISODate): number {
  return lotsUpTo(asset, asOf).reduce((sum, l) => sum + l.quantity * l.price + (l.fee ?? 0), 0)
}

export function assetSnapshot(asset: Asset, quote: Quote | undefined): AssetSnapshot {
  const quantity = assetQuantity(asset)
  const costBasis = assetCostBasis(asset)
  const price = quote?.price ?? 0
  const previousClose = quote?.previousClose ?? price
  const marketValue = quantity * price
  const dayChangeAbs = quantity * (price - previousClose)
  const dayChangePct = previousClose ? (price / previousClose - 1) * 100 : 0
  const totalChangeAbs = marketValue - costBasis
  const totalChangePct = costBasis ? (totalChangeAbs / costBasis) * 100 : 0
  return {
    asset,
    quantity,
    price,
    previousClose,
    marketValue,
    costBasis,
    dayChangeAbs,
    dayChangePct,
    totalChangeAbs,
    totalChangePct,
  }
}

export function soldAssetSnapshot(asset: Asset): SoldAssetSnapshot {
  const sale = asset.sale!
  const costBasis = assetCostBasis(asset)
  const proceeds = sale.quantity * sale.price - (sale.fee ?? 0)
  const realizedChangeAbs = proceeds - costBasis
  const realizedChangePct = costBasis ? (realizedChangeAbs / costBasis) * 100 : 0
  return { asset, proceeds, costBasis, realizedChangeAbs, realizedChangePct }
}

export function portfolioSnapshot(
  portfolio: Portfolio,
  quotes: Record<string, Quote>,
): PortfolioSnapshot {
  const heldAssets = portfolio.assets.filter((a) => !a.sale)
  const soldAssetsRaw = portfolio.assets.filter((a) => a.sale)

  const assets = heldAssets
    .map((asset) => assetSnapshot(asset, quotes[asset.symbol]))
    .sort((a, b) => b.marketValue - a.marketValue)
  const soldAssets = soldAssetsRaw.map(soldAssetSnapshot)

  const totalValue = assets.reduce((sum, a) => sum + a.marketValue, 0)
  const totalCost =
    assets.reduce((sum, a) => sum + a.costBasis, 0) + soldAssets.reduce((sum, s) => sum + s.costBasis, 0)
  const dayChangeAbs = assets.reduce((sum, a) => sum + a.dayChangeAbs, 0)
  const totalChangeAbs =
    assets.reduce((sum, a) => sum + a.totalChangeAbs, 0) +
    soldAssets.reduce((sum, s) => sum + s.realizedChangeAbs, 0)
  const prevValue = assets.reduce((sum, a) => sum + a.quantity * a.previousClose, 0)

  return {
    totalValue,
    totalCost,
    dayChangeAbs,
    dayChangePct: prevValue ? (dayChangeAbs / prevValue) * 100 : 0,
    totalChangeAbs,
    totalChangePct: totalCost ? (totalChangeAbs / totalCost) * 100 : 0,
    assets,
    soldAssets,
  }
}
