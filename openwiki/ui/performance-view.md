---
type: ui-view
title: Performance Tab — Value/TWR Chart and Per-Asset Lines
description: PerformanceView renders a dual-axis value + time-weighted return chart and a per-asset (or per-portfolio) percentage chart, with range selection, line toggles, and the simplePct comparison toggle.
tags: [ui, performance, charts, recharts]
---

# Performance Tab (`src/ui/PerformanceView.tsx`)

The performance tab renders two recharts `LineChart`s from [performance](../domain/performance.md) series. It depends on `recharts` (the only non-React runtime dependency). It accepts a `viewAll` prop from the [App shell](app-shell.md) to switch between the active portfolio and an aggregate view across all portfolios.

## State

- `range: '1M' | '6M' | 'YTD' | '1Y' | 'All'` (default `'All'`). `cutoffFor` computes a cutoff date; `'All'` returns `null`. `'YTD'` returns `{year}-01-01`; the others subtract months/years.
- `showSimplePct` — toggles the dashed "incl. new money" line (the naive `value/cost - 1`) on the portfolio chart, for contrast with the TWR line.
- `perAssetAcrossAll` — in `viewAll` mode, switches between "by portfolio" (one line per portfolio) and "by asset" (one line per asset across all portfolios).
- `enabledIds: Set<string>` — which per-X lines are visible; reset to "all on" whenever the line set changes shape (portfolio/view-all/by-asset switch) via an effect.

## Portfolio chart (top)

`buildPortfolioSeries(displayAssets, history)` filtered by `range`, where `displayAssets` is `allAssets` (all portfolios) when `viewAll`, else `activePortfolio.assets`. Dual-axis:

- **Left Y** = Value (`money(v, settings.baseCurrency)`).
- **Right Y** = Gain/loss % (`pct(v)`).
- Lines: `value` (solid blue), `twrPct` (solid red, "Gain/loss %"), and optionally `simplePct` (dashed red, "incl. new money") when `showSimplePct` is on.

A hint explains the TWR invariant: "adding new money moves the value line but not the % line." The `showSimplePct` checkbox title spells out the naive-vs-TWR difference.

## Per-X chart (bottom)

Builds `lines: ChartLine[]` (`{ id, label, series }`):

- **Non-viewAll**: one line per held asset in the active portfolio (`buildAssetSeries`).
- **viewAll, by portfolio**: one line per portfolio (`buildPortfolioSeries(p.assets, history)`).
- **viewAll, by asset**: one line per held asset across all portfolios; when an asset name appears in multiple portfolios, the label is disambiguated as `{name} ({portfolioName})`.

**Sold assets are excluded** from the per-X lines. Once sold, `buildAssetSeries` flattens to zero at the sale date (by `assetQuantity`), which would just be a distracting flat line. The sold asset's realized P/L still correctly moves the "Portfolio" chart above — that's the [domain math](../domain/performance.md), unaffected by this UI-only exclusion.

`chartData` is a date-union (all points' dates, sorted, range-filtered), each row carrying `{ date, [lineId]: twrPct }`. Lines are toggled by `enabledIds`; `toggleAll` flips between all and none. Single Y axis (`% since first buy`).

## Palette

```ts
const PALETTE = ['#4f8eea', '#e8a33d', '#5cb85c', '#d9534f', '#9b6bd6', '#3dbdc0', '#e0729a', '#8a8a3c']
```

Cycled by `i % PALETTE.length`; the colored `●` in each toggle label uses inline style to match the line.

## Empty state

If `Object.keys(history).length === 0`, renders "No price history yet — press Update." — the chart cannot be drawn without series.

## Focused tests

No dedicated UI tests; the chart reads directly from the tested [buildPortfolioSeries / buildAssetSeries](../domain/performance.md#focused-tests-srcdomainperformancetestts). The range/toggle logic is local React state.
