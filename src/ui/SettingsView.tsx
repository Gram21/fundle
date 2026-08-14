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
          {provider.id === 'eodhd' ? 'EODHD' : 'Yahoo Finance'} sends no CORS header, so requests are routed
          through this proxy prefix; the target URL is appended URL-encoded. You can list several,
          comma-separated — each is tried in order until one works, since free proxies routinely go down or
          get rate-limited on their own.
        </p>
      )}
      {provider?.id === 'eodhd' && (
        <p className="hint">
          Paid (from about €20/month), but its search is ISIN-native across US, European and Irish/Luxembourg
          funds and ETFs — the broadest ISIN coverage of the providers here, including mutual funds the free
          options don't carry at all. Get a key at eodhd.com.
        </p>
      )}
      {provider?.id === 'alphavantage' && (
        <p className="hint">
          Free, but capped at 25 requests/day total — too little for periodic polling, so
          auto-refresh is turned off while this is selected. Prices only update on page load and
          when you press the Update button. Historical charts are limited to the last ~100
          trading days on the free plan. Get a key at alphavantage.co.
        </p>
      )}
      <p className="hint">
        Searching by ISIN also automatically checks Börse Frankfurt's public quote API, no key needed — it
        covers a few instruments the provider above misses. Live quotes only: historical charts for those
        still come from Yahoo where it has a match, otherwise the chart is just empty.
      </p>

      <h2>ISIN lookup (OpenFIGI)</h2>
      <p className="hint">
        ISIN searches also automatically try OpenFIGI, the most complete free ISIN resolver
        available, no key required — it's the difference between an ISIN failing to resolve at
        all and it turning up a match. It only maps ISIN → ticker, not prices, so a hit is
        priced through Yahoo afterwards. Its lookup is a POST request, which the public CORS
        proxies above can't relay — it works reliably only with your own proxy (see{' '}
        <code>worker/DEPLOY.md</code> in the project for a free, 10-minute Cloudflare Worker
        setup). An optional API key below just raises OpenFIGI's rate limit; get a free one at
        openfigi.com if you hit it.
      </p>
      <div className="form-grid">
        <label htmlFor="openfigi-api-key">OpenFIGI API key (optional)</label>
        <input
          id="openfigi-api-key"
          type="password"
          value={settings.apiKeys.openfigi ?? ''}
          onChange={(e) =>
            actions.updateSettings({ apiKeys: { ...settings.apiKeys, openfigi: e.target.value } })
          }
        />
      </div>

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
    </div>
  )
}
