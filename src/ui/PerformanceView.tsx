import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp, useActivePortfolio } from '../app/store'
import { buildAssetSeries, buildPortfolioSeries } from '../domain/performance'
import type { SeriesPoint } from '../domain/metrics'
import { date as fmtDate, money, pct } from './format'

const PALETTE = ['#4f8fea', '#e8a33d', '#5cb85c', '#d9534f', '#9b6bd6', '#3dbdc0', '#e0729a', '#8a8a3c']

type Range = '1M' | '6M' | 'YTD' | '1Y' | 'All'
const RANGES: Range[] = ['1M', '6M', 'YTD', '1Y', 'All']

function cutoffFor(range: Range): string | null {
  const now = new Date()
  if (range === 'All') return null
  const d = new Date(now)
  if (range === '1M') d.setMonth(d.getMonth() - 1)
  else if (range === '6M') d.setMonth(d.getMonth() - 6)
  else if (range === '1Y') d.setFullYear(d.getFullYear() - 1)
  else if (range === 'YTD') return `${now.getFullYear()}-01-01`
  return d.toISOString().slice(0, 10)
}

function filterByRange<T extends { date: string }>(points: T[], range: Range): T[] {
  const cutoff = cutoffFor(range)
  return cutoff ? points.filter((p) => p.date >= cutoff) : points
}

export default function PerformanceView() {
  const { history, settings } = useApp()
  const portfolio = useActivePortfolio()
  const [range, setRange] = useState<Range>('All')
  const [showSimplePct, setShowSimplePct] = useState(false)
  const [enabledAssets, setEnabledAssets] = useState<Set<string>>(() => new Set(portfolio.assets.map((a) => a.id)))

  const hasHistory = Object.keys(history).length > 0

  const portfolioSeries = useMemo(
    () => filterByRange(buildPortfolioSeries(portfolio.assets, history), range),
    [portfolio.assets, history, range],
  )

  const assetSeriesByAsset = useMemo(() => {
    const map = new Map<string, SeriesPoint[]>()
    for (const asset of portfolio.assets) {
      const series = history[asset.symbol]
      if (series) map.set(asset.id, buildAssetSeries(asset, series))
    }
    return map
  }, [portfolio.assets, history])

  const assetChartData = useMemo(() => {
    const dateSet = new Set<string>()
    for (const series of assetSeriesByAsset.values()) {
      for (const p of series) dateSet.add(p.date)
    }
    const dates = filterByRange(
      [...dateSet].sort().map((date) => ({ date })),
      range,
    ).map((d) => d.date)

    return dates.map((date) => {
      const row: Record<string, number | string> = { date }
      for (const [assetId, series] of assetSeriesByAsset) {
        const point = series.find((p) => p.date === date)
        if (point) row[assetId] = point.twrPct
      }
      return row
    })
  }, [assetSeriesByAsset, range])

  function toggleAsset(id: string) {
    setEnabledAssets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allEnabled = portfolio.assets.every((a) => enabledAssets.has(a.id))

  function toggleAll() {
    setEnabledAssets(allEnabled ? new Set() : new Set(portfolio.assets.map((a) => a.id)))
  }

  if (!hasHistory) {
    return <p className="empty-state">No price history yet — press Update.</p>
  }

  return (
    <div className="performance-view">
      <div className="range-selector" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            className={r === range ? 'range-btn active' : 'range-btn'}
            aria-pressed={r === range}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <section className="chart-section">
        <h2>Portfolio</h2>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={portfolioSeries}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tickFormatter={fmtDate} minTickGap={40} />
              <YAxis
                yAxisId="left"
                label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
                tickFormatter={(v) => money(v, settings.baseCurrency)}
                width={90}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                label={{ value: 'Gain/loss %', angle: 90, position: 'insideRight' }}
                tickFormatter={(v) => pct(v)}
                width={80}
              />
              <Tooltip
                labelFormatter={(v) => fmtDate(String(v))}
                formatter={(value: number, key: string) => {
                  if (key === 'value') return [money(value, settings.baseCurrency), 'Value']
                  if (key === 'twrPct') return [pct(value), 'Gain/loss % (time-weighted)']
                  if (key === 'simplePct') return [pct(value), 'incl. new money']
                  return [value, key]
                }}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="value" name="Value" stroke={PALETTE[0]} dot={false} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="twrPct"
                name="Gain/loss %"
                stroke={PALETTE[3]}
                dot={false}
              />
              {showSimplePct && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="simplePct"
                  name="incl. new money"
                  stroke={PALETTE[3]}
                  strokeDasharray="4 3"
                  strokeWidth={1}
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="hint">
          The % line is time-weighted: adding new money moves the value line but not the % line.
        </p>
        <label
          className="checkbox-label"
          title="Naive return: current value divided by money paid in, minus 1. Unlike the Gain/loss % line above, this jumps every time you buy more, so it mixes real performance with the size of your deposits."
        >
          <input type="checkbox" checked={showSimplePct} onChange={(e) => setShowSimplePct(e.target.checked)} />
          Also show plain value-vs-cost % (jumps on every buy, for comparison)
        </label>
      </section>

      <section className="chart-section">
        <h2>Per-asset performance</h2>
        <div className="asset-toggles">
          <button type="button" className="range-btn" onClick={toggleAll}>
            {allEnabled ? 'Deselect all' : 'Select all'}
          </button>
          {portfolio.assets.map((asset, i) => (
            <label className="checkbox-label" key={asset.id}>
              <input
                type="checkbox"
                checked={enabledAssets.has(asset.id)}
                onChange={() => toggleAsset(asset.id)}
              />
              <span style={{ color: PALETTE[i % PALETTE.length] }}>●</span> {asset.name}
            </label>
          ))}
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={assetChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tickFormatter={fmtDate} minTickGap={40} />
              <YAxis tickFormatter={(v) => pct(v)} width={80} label={{ value: '% since first buy', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                labelFormatter={(v) => fmtDate(String(v))}
                formatter={(value: number, _key: string, item) => {
                  const asset = portfolio.assets.find((a) => a.id === item.dataKey)
                  return [pct(value), asset?.name ?? String(item.dataKey)]
                }}
              />
              <Legend formatter={(value) => portfolio.assets.find((a) => a.id === value)?.name ?? value} />
              {portfolio.assets.map(
                (asset, i) =>
                  enabledAssets.has(asset.id) && (
                    <Line
                      key={asset.id}
                      type="monotone"
                      dataKey={asset.id}
                      name={asset.id}
                      stroke={PALETTE[i % PALETTE.length]}
                      dot={false}
                      connectNulls
                    />
                  ),
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
