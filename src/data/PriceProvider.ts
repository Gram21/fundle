/** Port for market data. Adapters live next to this file. */
import type { ISODate, PriceSeries, Quote } from '../domain/types'

export interface SearchResult {
  symbol: string
  name: string
  isin?: string
  currency?: string
  exchange?: string
}

export interface PriceProvider {
  readonly id: string
  readonly label: string
  /** Resolve a free-text query, ISIN or WKN into candidate symbols. */
  search(query: string): Promise<SearchResult[]>
  quote(symbol: string): Promise<Quote>
  /** Daily closes from `from` (inclusive) to today. */
  history(symbol: string, from: ISODate): Promise<PriceSeries>
}

export class PriceProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PriceProviderError'
  }
}
