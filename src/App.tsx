import { useEffect, useRef, useState } from 'react'
import { useApp } from './app/store'
import Overview from './ui/Overview'
import PerformanceView from './ui/PerformanceView'
import SettingsView from './ui/SettingsView'
import HelpDialog from './ui/HelpDialog'
import Logo from './ui/Logo'
import BackupMenu from './ui/BackupMenu'
import PortfolioMenu from './ui/PortfolioMenu'

type Tab = 'overview' | 'performance'

export default function App() {
  const { status, error, lastUpdated, actions } = useApp()
  const [tab, setTab] = useState<Tab>('overview')
  const [viewAll, setViewAll] = useState(false)
  const [errorDismissed, setErrorDismissed] = useState(false)
  useEffect(() => setErrorDismissed(false), [error])
  const helpDialogRef = useRef<HTMLDialogElement>(null)
  const settingsDialogRef = useRef<HTMLDialogElement>(null)

  const updating = status === 'loading'

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <Logo />
          <h1 className="app-name">Fundle</h1>
          <PortfolioMenu
            viewAll={viewAll}
            onSelectPortfolio={(id) => {
              setViewAll(false)
              actions.setActivePortfolio(id)
            }}
            onSelectAll={() => setViewAll(true)}
          />
        </div>

        <div className="app-header-right">
          <span className="updated-at">
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString('de-DE')}` : 'Never updated'}
          </span>
          <button
            type="button"
            className={updating ? 'icon-btn refresh-btn spinning' : 'icon-btn refresh-btn'}
            onClick={() => actions.refresh()}
            disabled={updating}
            aria-label={updating ? 'Updating…' : 'Update prices'}
            title={updating ? 'Updating…' : 'Update prices'}
          >
            ↻
          </button>
          <BackupMenu />
          <button
            type="button"
            className="help-open"
            onClick={() => settingsDialogRef.current?.showModal()}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
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

      <dialog ref={settingsDialogRef} className="help-dialog">
        <button
          type="button"
          className="dialog-close"
          aria-label="Close"
          onClick={() => settingsDialogRef.current?.close()}
        >
          ×
        </button>
        <SettingsView />
      </dialog>

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
        {(['overview', 'performance'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Overview' : 'Performance'}
          </button>
        ))}
      </div>

      <main className="app-content">
        {tab === 'overview' && <Overview />}
        {tab === 'performance' && <PerformanceView viewAll={viewAll} />}
      </main>
    </div>
  )
}
