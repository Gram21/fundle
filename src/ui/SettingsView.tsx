import { useApp } from '../app/store'
import { PROVIDERS } from '../data'

export default function SettingsView() {
  const { settings, actions } = useApp()

  const provider = PROVIDERS.find((p) => p.id === settings.providerId) ?? PROVIDERS[0]

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
      <p className="hint">Export and import have moved to the Backup menu in the header.</p>
    </div>
  )
}
