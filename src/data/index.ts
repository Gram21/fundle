/** Provider factory + registry, for wiring settings to an adapter. */
import type { Settings } from '../app/schema'
import { createYahooProvider } from './yahoo'
import { createTwelveDataProvider } from './twelvedata'
import { createBoerseFrankfurtProvider, isBoerseFrankfurtSymbol } from './boerseFrankfurt'

export type { PriceProvider, SearchResult } from './PriceProvider'
export { PriceProviderError } from './PriceProvider'
export { createBoerseFrankfurtProvider, isBoerseFrankfurtSymbol } from './boerseFrankfurt'

/** The user-selected primary provider. */
export function createProvider(settings: Pick<Settings, 'providerId' | 'proxyUrl' | 'apiKeys'>) {
  if (settings.providerId === 'twelvedata') {
    return createTwelveDataProvider({ apiKey: settings.apiKeys.twelvedata ?? '' })
  }
  return createYahooProvider({ proxyUrl: settings.proxyUrl })
}

/**
 * Per-symbol dispatch. Symbols found via Börse Frankfurt's ISIN quote lookup are encoded as
 * `ISIN@MIC` (see boerseFrankfurt.ts) and always route there, no matter which provider is
 * selected as primary — it's an automatic supplementary source, not something the user picks.
 * Every other symbol goes through the primary provider, as before.
 */
export function resolveProvider(symbol: string, settings: Pick<Settings, 'providerId' | 'proxyUrl' | 'apiKeys'>) {
  if (isBoerseFrankfurtSymbol(symbol)) return createBoerseFrankfurtProvider({ proxyUrl: settings.proxyUrl })
  return createProvider(settings)
}

export const PROVIDERS: { id: string; label: string; needsApiKey: boolean; needsProxy: boolean }[] = [
  { id: 'yahoo', label: 'Yahoo Finance (via CORS proxy)', needsApiKey: false, needsProxy: true },
  { id: 'twelvedata', label: 'Twelve Data (API key)', needsApiKey: true, needsProxy: false },
]
