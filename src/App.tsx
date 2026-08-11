import { useEffect, useRef, useState } from 'react'
import { useApp, useActivePortfolio } from './app/store'
import { portfolioSnapshot } from './domain/portfolio'
import { money, pct, signClass } from './ui/format'
import Overview from './ui/Overview'
import PerformanceView from './ui/PerformanceView'
import SettingsView from './ui/SettingsView'
import HelpDialog from './ui/HelpDialog'

type Tab = 'overview' | 'performance' | 'settings'

export default function App() {
  const { portfolios, activePortfolioId, quotes, status, error, lastUpdated, actions } = useApp()
  const portfolio = useActivePortfolio()
  const [tab, setTab] = useState<Tab>('overview')
  const [errorDismissed, setErrorDismissed] = useState(false)
  useEffect(() => setErrorDismissed(false), [error])
  const helpDialogRef = useRef<HTMLDialogElement>(null)

  const snapshot = portfolioSnapshot(portfolio, quotes)
  const updating = status === 'loading'

  function handleAddPortfolio() {
    const name = window.prompt('Portfolio name?')
    if (name && name.trim()) actions.addPortfolio(name.trim())
  }

  function handleRemovePortfolio() {
    if (portfolios.length <= 1) return
    if (window.confirm(`Delete portfolio "${portfolio.name}"? This cannot be undone.`)) {
      actions.removePortfolio(portfolio.id)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-name">fin-tracker</h1>
          <label className="visually-hidden" htmlFor="portfolio-select">
            Active portfolio
          </label>
          <select
            id="portfolio-select"
            value={activePortfolioId}
            onChange={(e) => actions.setActivePortfolio(e.target.value)}
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAddPortfolio} aria-label="Add portfolio" title="Add portfolio">
            ＋
          </button>
          <button
            type="button"
            onClick={handleRemovePortfolio}
            disabled={portfolios.length <= 1}
            aria-label="Delete active portfolio"
            title="Delete active portfolio"
          >
            🗑
          </button>
        </div>

        <div className="app-header-right">
          <div className="header-stat">
            <span className="header-stat-label">Value</span>
            <span className="header-stat-value">{money(snapshot.totalValue, portfolio.assets[0]?.currency ?? 'EUR')}</span>
          </div>
          <div className="header-stat">
            <span className="header-stat-label">Day</span>
            <span className={`header-stat-value ${signClass(snapshot.dayChangeAbs)}`}>{pct(snapshot.dayChangePct)}</span>
          </div>
          <div className="header-stat">
            <span className="header-stat-label">Total</span>
            <span className={`header-stat-value ${signClass(snapshot.totalChangeAbs)}`}>{pct(snapshot.totalChangePct)}</span>
          </div>
          <span className="updated-at">
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString('de-DE')}` : 'Never updated'}
          </span>
          <button type="button" onClick={() => actions.refresh()} disabled={updating}>
            {updating ? 'Updating…' : 'Update'}
          </button>
          <button
            type="button"
            className="help-open"
            onClick={() => helpDialogRef.current?.showModal()}
            aria-label="Help"
            title="Help"
          >
            ?
          </button>
        </div>
      </header>

      <dialog ref={helpDialogRef} className="help-dialog">
        <button
          type="button"
          className="dialog-close"
          aria-label="Close"
          onClick={() => helpDialogRef.current?.close()}
        >
          ×
        </button>
        <HelpDialog />
      </dialog>

      {error && !errorDismissed && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setErrorDismissed(true)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      <div className="tabbar" role="tablist" aria-label="Views">
        {(['overview', 'performance', 'settings'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Overview' : t === 'performance' ? 'Performance' : 'Settings'}
          </button>
        ))}
      </div>

      <main className="app-content">
        {tab === 'overview' && <Overview />}
        {tab === 'performance' && <PerformanceView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}
