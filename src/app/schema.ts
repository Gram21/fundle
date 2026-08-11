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
  // corsproxy.io now requires a paid key for any non-localhost origin (verified: it 403s/gates
  // every production request), so it no longer works as a zero-setup default. allorigins.win's
  // /raw endpoint has no such gate and forwards real JSON with CORS headers intact.
  proxyUrl: 'https://api.allorigins.win/raw?url=',
  apiKeys: {},
  refreshMinutes: 5,
  baseCurrency: 'EUR',
}
