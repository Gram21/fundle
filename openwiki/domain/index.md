# Files

- [Domain Model and Types](model.md) - Core data types (Lot, Asset, Portfolio, PricePoint, PriceSeries, Quote) and result shapes (AssetSnapshot, PortfolioSnapshot, SeriesPoint) that the domain layer owns and the rest of the app consumes.
- [Performance Math — Time-Weighted Return](performance.md) - buildPortfolioSeries and buildAssetSeries compute a cash-flow-neutral time-weighted return (twrPct) alongside a naive simplePct, with forward-fill and non-trading-day cash flow handling.
- [Portfolio Snapshots](portfolio.md) - Current-value computations in portfolio.ts — assetQuantity, assetCostBasis, assetSnapshot and portfolioSnapshot — including fee handling, missing-quote fallbacks and zero-division guards.
