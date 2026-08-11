import { useEffect, useMemo, useState } from 'react'
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

/** One line's worth of data for the per-X performance chart, whatever "X" is (asset or portfolio). */
interface ChartLine {
  id: string
  label: string
  series: SeriesPoint[]
}

export default function PerformanceView({ viewAll = false }: { viewAll?: boolean } = {}) {
  const { history, settings, portfolios } = useApp()
  const activePortfolio = useActivePortfolio()
  const [range, setRange] = useState<Range>('All')
  const [showSimplePct, setShowSimplePct] = useState(false)
  // "by portfolio" (one line per portfolio) vs "by asset" (one line per asset, across every
  // portfolio) — only meaningful in viewAll mode.
  const [perAssetAcrossAll, setPerAssetAcrossAll] = useState(false)

  const allAssets = useMemo(() => portfolios.flatMap((p) => p.assets), [portfolios])
  const displayAssets = viewAll ? allAssets : activePortfolio.assets

  const hasHistory = Object.keys(history).length > 0

  const portfolioSeries = useMemo(
    () => filterByRange(buildPortfolioSeries(displayAssets, history), range),
    [displayAssets, history, range],
  )

  // Which set of lines the "per-X" section currently shows. Sold assets are excluded here — once
  // sold, buildAssetSeries's own math (per assetQuantity) flattens to zero at the sale date, which
  // would just be a distracting flat line.
  // ponytail: skipping a "(sold)" line truncated at the sale date — the per-portfolio/per-asset
  // toggle is already juggling two axes of state; a third (held vs sold) needs its own careful pass
  // through enabledIds/nameCounts/labeling, not a bolt-on here. The sold asset's realized P/L still
  // correctly moves the "Portfolio" chart above (that's the domain math in performance.ts, unaffected
  // by this UI-only exclusion). Add it if per-asset-while-held charting for sold positions is asked for.
  const lines: ChartLine[] = useMemo(() => {
    if (!viewAll) {
      return activePortfolio.assets
        .filter((a) => !a.sale)
        .map((a) => {
          const series = history[a.symbol]
          return { id: a.id, label: a.name, series: series ? buildAssetSeries(a, series) : [] }
        })
    }
    if (!perAssetAcrossAll) {
      return portfolios.map((p) => ({
        id: p.id,
        label: p.name,
        series: buildPortfolioSeries(p.assets, history),
      }))
    }
    const nameCounts = new Map<string, number>()
    for (const a of allAssets) nameCounts.set(a.name, (nameCounts.get(a.name) ?? 0) + 1)
    return portfolios.flatMap((p) =>
      p.assets
        .filter((a) => !a.sale)
        .map((a) => {
          const series = history[a.symbol]
          const label = (nameCounts.get(a.name) ?? 0) > 1 ? `${a.name} (${p.name})` : a.name
          return { id: a.id, label, series: series ? buildAssetSeries(a, series) : [] }
        }),
    )
  }, [viewAll, perAssetAcrossAll, activePortfolio.assets, portfolios, allAssets, history])

  const [enabledIds, setEnabledIds] = useState<Set<string>>(() => new Set(lines.map((l) => l.id)))

  // Reset the selection to "everything on" whenever the set of lines being shown changes shape
  // (switching portfolio/view-all/by-asset mode) — a stale selection from a different mode would
  // just look like everything got unchecked.
  useEffect(() => {
    setEnabledIds(new Set(lines.map((l) => l.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAll, perAssetAcrossAll, activePortfolio.id])

  const chartData = useMemo(() => {
    const dateSet = new Set<string>()
    for (const line of lines) {
      for (const p of line.series) dateSet.add(p.date)
    }
    const dates = filterByRange(
      [...dateSet].sort().map((date) => ({ date })),
      range,
    ).map((d) => d.date)

    return dates.map((date) => {
      const row: Record<string, number | string> = { date }
      for (const line of lines) {
        const point = line.series.find((p) => p.date === date)
        if (point) row[line.id] = point.twrPct
      }
      return row
    })
  }, [lines, range])

  function toggleLine(id: string) {
    setEnabledIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allEnabled = lines.every((l) => enabledIds.has(l.id))

  function toggleAll() {
    setEnabledIds(allEnabled ? new Set() : new Set(lines.map((l) => l.id)))
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
        <h2>{viewAll ? (perAssetAcrossAll ? 'Per-asset performance (all portfolios)' : 'Per-portfolio performance') : 'Per-asset performance'}</h2>
        {viewAll && (
          <div className="range-selector" role="group" aria-label="Per-X view">
            <button
              type="button"
              className={!perAssetAcrossAll ? 'range-btn active' : 'range-btn'}
              aria-pressed={!perAssetAcrossAll}
              onClick={() => setPerAssetAcrossAll(false)}
            >
              By portfolio
            </button>
            <button
              type="button"
              className={perAssetAcrossAll ? 'range-btn active' : 'range-btn'}
              aria-pressed={perAssetAcrossAll}
              onClick={() => setPerAssetAcrossAll(true)}
            >
              By asset
            </button>
          </div>
        )}
        <div className="asset-toggles">
          <button type="button" className="range-btn" onClick={toggleAll}>
            {allEnabled ? 'Deselect all' : 'Select all'}
          </button>
          {lines.map((line, i) => (
            <label className="checkbox-label" key={line.id}>
              <input
                type="checkbox"
                checked={enabledIds.has(line.id)}
                onChange={() => toggleLine(line.id)}
              />
              <span style={{ color: PALETTE[i % PALETTE.length] }}>●</span> {line.label}
            </label>
          ))}
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tickFormatter={fmtDate} minTickGap={40} />
              <YAxis tickFormatter={(v) => pct(v)} width={80} label={{ value: '% since first buy', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                labelFormatter={(v) => fmtDate(String(v))}
                formatter={(value: number, _key: string, item) => {
                  const line = lines.find((l) => l.id === item.dataKey)
                  return [pct(value), line?.label ?? String(item.dataKey)]
                }}
              />
              <Legend formatter={(value) => lines.find((l) => l.id === value)?.label ?? value} />
              {lines.map(
                (line, i) =>
                  enabledIds.has(line.id) && (
                    <Line
                      key={line.id}
                      type="monotone"
                      dataKey={line.id}
                      name={line.id}
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
