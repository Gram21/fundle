/** Import/export + localStorage persistence. parseImport is a trust boundary: validate, never cast. */
import type { Asset, Lot, Portfolio, PriceSeries, Quote } from '../domain/types'
import type { ExportFileV1, Settings } from './schema'
import { DEFAULT_SETTINGS, LEGACY_SCHEMA_ID, SCHEMA_ID } from './schema'

export const STORAGE_KEY = 'fundle/v1'
/** Storage key used before the app was renamed from fin-tracker to Fundle; read once for migration. */
const LEGACY_STORAGE_KEY = 'fin-tracker/v1'

export interface PriceCache {
  quotes: Record<string, Quote>
  history: Record<string, PriceSeries>
}

export function serialize(
  portfolios: Portfolio[],
  settings: Settings,
  now: Date,
  cache: PriceCache = { quotes: {}, history: {} },
): string {
  const file: ExportFileV1 = {
    schema: SCHEMA_ID,
    exportedAt: now.toISOString(),
    portfolios,
    settings,
    quotes: cache.quotes,
    history: cache.history,
  }
  return JSON.stringify(file, null, 2)
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${path}: expected a non-empty string`)
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function requireNumber(value: unknown, path: string): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${path}: expected a number`)
  }
  return n
}

function idOrGenerate(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value : crypto.randomUUID()
}

function parseLot(raw: unknown, path: string): Lot {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Invalid ${path}: expected an object`)
  }
  const r = raw as Record<string, unknown>
  const lot: Lot = {
    id: idOrGenerate(r.id),
    date: requireString(r.date, `${path}.date`),
    quantity: requireNumber(r.quantity, `${path}.quantity`),
    price: requireNumber(r.price, `${path}.price`),
    fee: r.fee === undefined || r.fee === null ? 0 : requireNumber(r.fee, `${path}.fee`),
  }
  return lot
}

function parseSale(raw: unknown, path: string): Asset['sale'] {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object') {
    throw new Error(`Invalid ${path}: expected an object`)
  }
  const r = raw as Record<string, unknown>
  return {
    date: requireString(r.date, `${path}.date`),
    quantity: requireNumber(r.quantity, `${path}.quantity`),
    price: requireNumber(r.price, `${path}.price`),
    fee: r.fee === undefined || r.fee === null ? undefined : requireNumber(r.fee, `${path}.fee`),
  }
}

function parseAsset(raw: unknown, path: string): Asset {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Invalid ${path}: expected an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.lots)) {
    throw new Error(`Invalid ${path}.lots: expected an array`)
  }
  const asset: Asset = {
    id: idOrGenerate(r.id),
    symbol: requireString(r.symbol, `${path}.symbol`),
    name: requireString(r.name, `${path}.name`),
    currency: requireString(r.currency, `${path}.currency`),
    isin: optionalString(r.isin),
    wkn: optionalString(r.wkn),
    lots: r.lots.map((l, i) => parseLot(l, `${path}.lots[${i}]`)),
    sale: parseSale(r.sale, `${path}.sale`),
  }
  return asset
}

function parsePortfolio(raw: unknown, path: string): Portfolio {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Invalid ${path}: expected an object`)
  }
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.assets)) {
    throw new Error(`Invalid ${path}.assets: expected an array`)
  }
  return {
    id: idOrGenerate(r.id),
    name: requireString(r.name, `${path}.name`),
    assets: r.assets.map((a, i) => parseAsset(a, `${path}.assets[${i}]`)),
  }
}

function clampRefreshMinutes(value: unknown): number {
  const n = Number(value)
  const base = Number.isFinite(n) ? n : DEFAULT_SETTINGS.refreshMinutes
  return Math.min(120, Math.max(1, base))
}

/**
 * Exact proxyUrl values this app has shipped as ITS OWN default in the past. Free CORS proxies
 * keep dying (corsproxy.io now blocks every non-localhost origin outright; even the ones that
 * still work go down or get rate-limited on their own) - each time the shipped default changes,
 * anyone who already loaded the app is stuck on their persisted old value forever, since a saved
 * setting always wins over a new code default. Auto-upgrading a value that matches a KNOWN past
 * default (never a value the user typed themselves) is the only way a fix like that actually
 * reaches someone who already has the app open.
 */
const OBSOLETE_PROXY_URLS = new Set([
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
  'https://api.allorigins.win/raw?url=,https://api.cors.lol/?url=,https://api.codetabs.com/v1/proxy?quest=',
])

function migrateProxyUrl(value: unknown): string | undefined {
  return typeof value === 'string' && OBSOLETE_PROXY_URLS.has(value.trim())
    ? DEFAULT_SETTINGS.proxyUrl
    : undefined
}

function mergeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Settings>) : {}
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    proxyUrl: migrateProxyUrl(r.proxyUrl) ?? r.proxyUrl ?? DEFAULT_SETTINGS.proxyUrl,
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(r.apiKeys ?? {}) },
    refreshMinutes: clampRefreshMinutes(r.refreshMinutes),
  }
}

/**
 * The price cache is disposable — worst case on a bad entry is a refetch, not a broken
 * portfolio — so unlike lots/assets above, this drops invalid entries instead of throwing.
 */
function parseQuote(raw: unknown): Quote | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const price = Number(r.price)
  const previousClose = Number(r.previousClose)
  const time = Number(r.time)
  if (
    typeof r.symbol !== 'string' ||
    typeof r.currency !== 'string' ||
    !Number.isFinite(price) ||
    !Number.isFinite(previousClose) ||
    !Number.isFinite(time)
  ) {
    return undefined
  }
  return { symbol: r.symbol, price, previousClose, currency: r.currency, time }
}

function parsePriceSeries(raw: unknown): PriceSeries | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.symbol !== 'string' || !Array.isArray(r.points)) return undefined
  const points = r.points
    .map((p) => {
      if (typeof p !== 'object' || p === null) return undefined
      const point = p as Record<string, unknown>
      const close = Number(point.close)
      if (typeof point.date !== 'string' || !Number.isFinite(close)) return undefined
      return { date: point.date, close }
    })
    .filter((p): p is { date: string; close: number } => p !== undefined)
  return { symbol: r.symbol, points }
}

function parseCache(raw: unknown, key: 'quotes' | 'history'): Record<string, Quote | PriceSeries> {
  const entries = raw && typeof raw === 'object' ? Object.entries(raw as Record<string, unknown>) : []
  const parse = key === 'quotes' ? parseQuote : parsePriceSeries
  const result: Record<string, Quote | PriceSeries> = {}
  for (const [symbol, value] of entries) {
    const parsed = parse(value)
    if (parsed) result[symbol] = parsed
  }
  return result
}

export function parseImport(
  text: string,
): { portfolios: Portfolio[]; settings: Settings } & PriceCache {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`)
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Unsupported file (expected schema ${SCHEMA_ID})`)
  }
  const obj = data as Record<string, unknown>
  if (obj.schema !== SCHEMA_ID && obj.schema !== LEGACY_SCHEMA_ID) {
    throw new Error(`Unsupported file (expected schema ${SCHEMA_ID})`)
  }
  if (!Array.isArray(obj.portfolios)) {
    throw new Error('Invalid file: portfolios must be an array')
  }
  const portfolios = obj.portfolios.map((p, i) => parsePortfolio(p, `portfolios[${i}]`))
  const settings = mergeSettings(obj.settings)
  const quotes = parseCache(obj.quotes, 'quotes') as Record<string, Quote>
  const history = parseCache(obj.history, 'history') as Record<string, PriceSeries>
  return { portfolios, settings, quotes, history }
}

/** localStorage load/save, reusing the export format so it doubles as the on-disk schema. */
export function loadLocal(): ({ portfolios: Portfolio[]; settings: Settings } & PriceCache) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    return parseImport(raw)
  } catch {
    return null
  }
}

export function saveLocal(
  portfolios: Portfolio[],
  settings: Settings,
  cache?: PriceCache,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(portfolios, settings, new Date(), cache))
  } catch {
    // quota exceeded or storage unavailable - persistence is best-effort
  }
}
