# Files

- [Domain Model and Types](model.md) - Core data types (Lot, Asset with full-position sale, Portfolio, PricePoint, PriceSeries, Quote) and result shapes (AssetSnapshot, SoldAssetSnapshot, PortfolioSnapshot, SeriesPoint) that the domain layer owns and the rest of the app consumes.
- [Performance Math — Time-Weighted Return](performance.md) - buildPortfolioSeries and buildAssetSeries compute a cash-flow-neutral time-weighted return (twrPct) alongside a naive simplePct, with forward-fill, non-trading-day cash-flow handling, and full-sale proceeds booking.
- [Portfolio Snapshots](portfolio.md) - Current-value computations in portfolio.ts — assetQuantity (sale-aware), assetCostBasis, assetSnapshot, soldAssetSnapshot and portfolioSnapshot — including fee handling, missing-quote fallbacks, sold-asset splitting and zero-division guards.
