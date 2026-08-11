/** Import/export + localStorage persistence. parseImport is a trust boundary: validate, never cast. */
import type { Asset, Lot, Portfolio } from '../domain/types'
import type { ExportFileV1, Settings } from './schema'
import { DEFAULT_SETTINGS, SCHEMA_ID } from './schema'

export const STORAGE_KEY = 'fin-tracker/v1'

export function serialize(portfolios: Portfolio[], settings: Settings, now: Date): string {
  const file: ExportFileV1 = {
    schema: SCHEMA_ID,
    exportedAt: now.toISOString(),
    portfolios,
    settings,
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

function mergeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Settings>) : {}
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(r.apiKeys ?? {}) },
    refreshMinutes: clampRefreshMinutes(r.refreshMinutes),
  }
}

export function parseImport(text: string): { portfolios: Portfolio[]; settings: Settings } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`)
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('Unsupported file (expected schema fin-tracker/v1)')
  }
  const obj = data as Record<string, unknown>
  if (obj.schema !== SCHEMA_ID) {
    throw new Error('Unsupported file (expected schema fin-tracker/v1)')
  }
  if (!Array.isArray(obj.portfolios)) {
    throw new Error('Invalid file: portfolios must be an array')
  }
  const portfolios = obj.portfolios.map((p, i) => parsePortfolio(p, `portfolios[${i}]`))
  const settings = mergeSettings(obj.settings)
  return { portfolios, settings }
}

/** localStorage load/save, reusing the export format so it doubles as the on-disk schema. */
export function loadLocal(): { portfolios: Portfolio[]; settings: Settings } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return parseImport(raw)
  } catch {
    return null
  }
}

export function saveLocal(portfolios: Portfolio[], settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(portfolios, settings, new Date()))
  } catch {
    // quota exceeded or storage unavailable - persistence is best-effort
  }
}
