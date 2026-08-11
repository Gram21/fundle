/** Persisted document shape. This is the export/import contract. */
import type { Portfolio, PriceSeries, Quote } from '../domain/types'

export interface Settings {
  /** PriceProvider.id of the active adapter. */
  providerId: string
  /**
   * CORS proxy prefix; the target URL is appended URL-encoded.
   * Needed because the free quote endpoints send no Access-Control-Allow-Origin.
   */
  proxyUrl: string
  /** Per-provider API keys, keyed by PriceProvider.id. */
  apiKeys: Record<string, string>
  refreshMinutes: number
  baseCurrency: string
}

export interface ExportFileV1 {
  schema: 'fundle/v1'
  exportedAt: string
  portfolios: Portfolio[]
  settings: Settings
  /**
   * Last fetched prices, keyed by symbol. Optional so older exports (and hand-edited
   * files) still import fine — a missing cache just means the next refresh fetches it.
   */
  quotes?: Record<string, Quote>
  history?: Record<string, PriceSeries>
}

export const SCHEMA_ID = 'fundle/v1' as const
/** Schema id used before the app was renamed from fin-tracker to Fundle; still accepted on import. */
export const LEGACY_SCHEMA_ID = 'fin-tracker/v1' as const

export const DEFAULT_SETTINGS: Settings = {
  providerId: 'yahoo',
  // Free CORS proxies are unreliable individually - corsproxy.io now hard-gates every
  // non-localhost origin, and even the ones that do work go down or get rate-limited
  // sporadically (all verified during this app's own development). proxyUrl is a
  // comma-separated fallback list (see data/proxy.ts): each is tried in order per request.
  proxyUrl: 'https://api.allorigins.win/raw?url=,https://api.cors.lol/?url=,https://api.codetabs.com/v1/proxy?quest=',
  apiKeys: {},
  refreshMinutes: 5,
  baseCurrency: 'EUR',
}
