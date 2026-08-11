import { useRef, useState } from 'react'
import { useApp } from '../app/store'
import { PROVIDERS } from '../data'

export default function SettingsView() {
  const { settings, actions } = useApp()
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const provider = PROVIDERS.find((p) => p.id === settings.providerId) ?? PROVIDERS[0]

  function handleExport() {
    const json = actions.exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `fin-tracker-${today}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    setImportError(null)
    setImportSuccess(false)
    try {
      const text = await file.text()
      actions.importJson(text)
      setImportSuccess(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="settings-view">
      <h2>Data provider</h2>
      <div className="form-grid">
        <label htmlFor="provider-select">Provider</label>
        <select
          id="provider-select"
          value={settings.providerId}
          onChange={(e) => actions.updateSettings({ providerId: e.target.value })}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {provider?.needsApiKey && (
          <>
            <label htmlFor="provider-api-key">API key</label>
            <input
              id="provider-api-key"
              type="password"
              value={settings.apiKeys[provider.id] ?? ''}
              onChange={(e) =>
                actions.updateSettings({ apiKeys: { ...settings.apiKeys, [provider.id]: e.target.value } })
              }
            />
          </>
        )}

        {provider?.needsProxy && (
          <>
            <label htmlFor="proxy-url">CORS proxy URL</label>
            <input
              id="proxy-url"
              type="text"
              value={settings.proxyUrl}
              onChange={(e) => actions.updateSettings({ proxyUrl: e.target.value })}
            />
          </>
        )}
      </div>
      {provider?.needsProxy && (
        <p className="hint">
          Yahoo Finance sends no CORS header, so requests are routed through this proxy prefix; the target URL is
          appended URL-encoded.
        </p>
      )}

      <h2>General</h2>
      <div className="form-grid">
        <label htmlFor="refresh-minutes">Refresh interval (minutes)</label>
        <input
          id="refresh-minutes"
          type="number"
          min="1"
          max="120"
          value={settings.refreshMinutes}
          onChange={(e) => actions.updateSettings({ refreshMinutes: Number(e.target.value) })}
        />

        <label htmlFor="base-currency">Base currency</label>
        <input
          id="base-currency"
          type="text"
          value={settings.baseCurrency}
          onChange={(e) => actions.updateSettings({ baseCurrency: e.target.value })}
        />
      </div>

      <h2>Backup</h2>
      <p className="hint">
        Data lives only in this browser's localStorage — nothing is synced anywhere. Export regularly so you don't
        lose it.
      </p>
      <button type="button" onClick={handleExport}>
        Export data (.json)
      </button>

      <div className="import-row">
        <label htmlFor="import-file">Import data (.json)</label>
        <input
          id="import-file"
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportFile(file)
          }}
        />
      </div>
      <p className="hint">Importing replaces all current portfolios and settings.</p>
      {importError && <p className="form-error">{importError}</p>}
      {importSuccess && <p className="form-success">Import successful.</p>}
    </div>
  )
}
