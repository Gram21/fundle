/** CORS proxy helper: prefix target URLs so the browser can fetch them. */
import { PriceProviderError } from './PriceProvider'

export function proxied(url: string, proxyUrl: string): string {
  const trimmed = proxyUrl.trim()
  return trimmed === '' ? url : trimmed + encodeURIComponent(url)
}

/** A public CORS proxy that has gone down tends to hang rather than refuse. */
const TIMEOUT_MS = 15_000

export async function fetchJson<T>(url: string, proxyUrl: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(proxied(url, proxyUrl), { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    throw new PriceProviderError(
      timedOut
        ? `Request timed out after ${TIMEOUT_MS / 1000}s — the CORS proxy may be down, try another one in Settings`
        : 'Network request failed — check the CORS proxy setting',
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
    throw new PriceProviderError(
      `Failed to parse response as JSON (proxy likely returned HTML): ${body.slice(0, 200)}`,
      err,
    )
  }
}
