/**
 * Fundle's own CORS relay, meant to run as a Cloudflare Worker (free tier: 100,000
 * requests/day). Every free public CORS proxy this app has tried has eventually gone dead,
 * started rate-limiting, or started blocking non-localhost origins outright (corsproxy.io,
 * allorigins.win, cors.lol - see src/data/proxy.ts) - a worker you own doesn't have that
 * problem, and it can forward POST bodies, which public GET-only relays can't (needed for
 * OpenFIGI's mapping endpoint).
 *
 * Usage from the app: set this Worker's URL (e.g. https://your-worker.your-subdomain.workers.dev/?url=)
 * as (one of) the CORS proxy URL(s) in Settings. The app appends the URL-encoded target itself.
 *
 * Deployment: see worker/DEPLOY.md.
 */

// Only these hosts can be relayed - an open relay to ANY url gets found and abused within
// days, which is exactly what killed the public proxies this app used to depend on. Add a
// host here if you wire up another provider that needs proxying.
const ALLOWED_HOSTS = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'api.boerse-frankfurt.de',
  'eodhd.com',
  'www.alphavantage.co',
  'api.openfigi.com',
  'api.twelvedata.com',
])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-OPENFIGI-APIKEY',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const requestUrl = new URL(request.url)
    const target = requestUrl.searchParams.get('url')
    if (!target) {
      return json({ error: 'missing ?url= query param' }, 400)
    }

    let targetUrl
    try {
      targetUrl = new URL(target)
    } catch {
      return json({ error: 'invalid target url' }, 400)
    }

    if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return json({ error: `host not allowed: ${targetUrl.hostname}` }, 403)
    }

    // Forward method, body, and the couple of headers the relayed APIs actually need.
    // Anything else (cookies, auth headers meant for THIS worker, etc.) is dropped on purpose.
    const forwardHeaders = new Headers()
    const contentType = request.headers.get('Content-Type')
    if (contentType) forwardHeaders.set('Content-Type', contentType)
    const openfigiKey = request.headers.get('X-OPENFIGI-APIKEY')
    if (openfigiKey) forwardHeaders.set('X-OPENFIGI-APIKEY', openfigiKey)

    let upstream
    try {
      upstream = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: forwardHeaders,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
      })
    } catch (err) {
      return json({ error: `upstream request failed: ${String(err)}` }, 502)
    }

    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
    })
  },
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
