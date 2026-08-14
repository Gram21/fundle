// Connectivity health check for external price-data APIs: verifies each host is reachable
// and answers, without fetching real market data (no API keys required/spent).
const TIMEOUT_MS = 8_000

const targets = [
  { name: 'Yahoo Finance', url: 'https://query1.finance.yahoo.com/v1/finance/search?q=health&quotesCount=1' },
  {
    name: 'Börse Frankfurt',
    url: 'https://api.boerse-frankfurt.de/v1/data/quote_box/single?isin=US0000000000&mic=XETR',
  },
  { name: 'OpenFIGI', url: 'https://api.openfigi.com/v3/mapping', init: { method: 'POST', body: '[]' } },
  { name: 'Alpha Vantage', url: 'https://www.alphavantage.co/query' },
  { name: 'EODHD', url: 'https://eodhd.com/api/search/health' },
  { name: 'Twelve Data', url: 'https://api.twelvedata.com/quote?symbol=health' },
]

async function checkOne({ name, url, init }) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    return { name, ok: true, status: res.status }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    return { name, ok: false, reason: timedOut ? `timed out after ${TIMEOUT_MS / 1000}s` : String(err) }
  }
}

const results = await Promise.all(targets.map(checkOne))

let failed = false
for (const r of results) {
  if (r.ok) {
    console.log(`ok:    ${r.name} (HTTP ${r.status})`)
  } else {
    failed = true
    console.error(`FAIL:  ${r.name} - ${r.reason}`)
  }
}

process.exit(failed ? 1 : 0)
