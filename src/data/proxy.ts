/** CORS proxy helper: prefix target URLs so the browser can fetch them. */
import { PriceProviderError } from './PriceProvider'

export function proxied(url: string, proxyUrl: string): string {
  const trimmed = proxyUrl.trim()
  return trimmed === '' ? url : trimmed + encodeURIComponent(url)
}

/** `proxyUrl` may list several fallback prefixes, comma-separated - see fetchJson. */
export function proxyCandidates(proxyUrl: string): string[] {
  return proxyUrl
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '')
}

/** A public CORS proxy that has gone down tends to hang rather than refuse. */
const TIMEOUT_MS = 8_000

async function fetchOnce<T>(url: string, prefix: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(proxied(url, prefix), { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    throw new PriceProviderError(
      timedOut ? `timed out after ${TIMEOUT_MS / 1000}s` : 'network request failed',
      err,
    )
  }
  const body = await res.text()
  if (!res.ok) {
    throw new PriceProviderError(`HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  try {
    return JSON.parse(body) as T
  } catch (err) {
    throw new PriceProviderError(`returned non-JSON (likely an error page): ${body.slice(0, 100)}`, err)
  }
}

/**
 * Free public CORS proxies routinely go down, get rate-limited, or start gating non-localhost
 * origins (all three have happened during this app's own development) - so `proxyUrl` is a
 * comma-separated list of fallback prefixes, tried in order. An empty `proxyUrl` fetches
 * directly (used for providers with native CORS support, and in tests).
 */
export async function fetchJson<T>(url: string, proxyUrl: string): Promise<T> {
  const candidates = proxyCandidates(proxyUrl)
  if (candidates.length === 0) return fetchOnce<T>(url, '')

  const failures: string[] = []
  for (const prefix of candidates) {
    try {
      return await fetchOnce<T>(url, prefix)
    } catch (err) {
      const host = (() => {
        try {
          return new URL(prefix).hostname
        } catch {
          return prefix
        }
      })()
      failures.push(`${host}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new PriceProviderError(
    `All ${candidates.length} CORS proxies failed - ${failures.join('; ')}. Try another one in Settings.`,
  )
}
