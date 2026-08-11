/** Domain model. Pure data, no IO, no framework types. */

/** Calendar date, 'YYYY-MM-DD'. */
export type ISODate = string

/** A single buy order ("lot"). Sells are out of scope for now. */
export interface Lot {
  id: string
  date: ISODate
  quantity: number
  /** Price per share in the asset's currency. */
  price: number
  /** Order fee, in the asset's currency. Counts towards cost basis. */
  fee?: number
}

export interface Asset {
  id: string
  /** Provider symbol used for price lookups, e.g. 'EUNL.DE'. */
  symbol: string
  name: string
  currency: string
  isin?: string
  wkn?: string
  lots: Lot[]
}

export interface Portfolio {
  id: string
  name: string
  assets: Asset[]
}

export interface PricePoint {
  date: ISODate
  close: number
}

/** Daily closes, ascending by date, gaps (weekends/holidays) simply absent. */
export interface PriceSeries {
  symbol: string
  points: PricePoint[]
}

export interface Quote {
  symbol: string
  price: number
  /** Previous trading day's close, for the day-change figures. */
  previousClose: number
  currency: string
  /** Epoch milliseconds of the quote. */
  time: number
}
