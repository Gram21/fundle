/** Persisted document shape. This is the export/import contract. */
import type { Portfolio } from '../domain/types'

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
  schema: 'fin-tracker/v1'
  exportedAt: string
  portfolios: Portfolio[]
  settings: Settings
}

export const SCHEMA_ID = 'fin-tracker/v1' as const

export const DEFAULT_SETTINGS: Settings = {
  providerId: 'yahoo',
  proxyUrl: 'https://corsproxy.io/?url=',
  apiKeys: {},
  refreshMinutes: 5,
  baseCurrency: 'EUR',
}
