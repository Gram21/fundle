/** Provider factory + registry, for wiring settings to an adapter. */
import type { Settings } from '../app/schema'
import { createYahooProvider } from './yahoo'
import { createTwelveDataProvider } from './twelvedata'

export type { PriceProvider, SearchResult } from './PriceProvider'
export { PriceProviderError } from './PriceProvider'

export function createProvider(settings: Pick<Settings, 'providerId' | 'proxyUrl' | 'apiKeys'>) {
  if (settings.providerId === 'twelvedata') {
    return createTwelveDataProvider({ apiKey: settings.apiKeys.twelvedata ?? '' })
  }
  return createYahooProvider({ proxyUrl: settings.proxyUrl })
}

export const PROVIDERS: { id: string; label: string; needsApiKey: boolean; needsProxy: boolean }[] = [
  { id: 'yahoo', label: 'Yahoo Finance (via CORS proxy)', needsApiKey: false, needsProxy: true },
  { id: 'twelvedata', label: 'Twelve Data (API key)', needsApiKey: true, needsProxy: false },
]
