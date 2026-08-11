import { useState, type FormEvent } from 'react'
import { useApp } from '../app/store'
import type { SearchResult } from '../data/PriceProvider'

interface LotRow {
  date: string
  quantity: string
  price: string
  fee: string
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyRow(): LotRow {
  return { date: todayIso(), quantity: '', price: '', fee: '' }
}

export default function AddAssetForm({ onDone }: { onDone?: () => void }) {
  const { actions } = useApp()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])

  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [isin, setIsin] = useState('')
  const [wkn, setWkn] = useState('')
  const [rows, setRows] = useState<LotRow[]>([emptyRow()])
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setSearched(false)
    try {
      const found = await actions.search(query.trim())
      setResults(found)
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  function pickResult(r: SearchResult) {
    setSymbol(r.symbol)
    setName(r.name)
    if (r.currency) setCurrency(r.currency)
    if (r.isin) setIsin(r.isin)
  }

  function updateRow(i: number, patch: Partial<LotRow>) {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
  }

  const validRows = rows.filter((r) => Number(r.quantity) > 0 && Number(r.price) > 0)
  const isValid = symbol.trim() !== '' && name.trim() !== '' && currency.trim() !== '' && validRows.length > 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!isValid) return
    try {
      actions.addAsset({
        symbol: symbol.trim(),
        name: name.trim(),
        currency: currency.trim(),
        isin: isin.trim() || undefined,
        wkn: wkn.trim() || undefined,
        lots: validRows.map((r) => ({
          date: r.date,
          quantity: Number(r.quantity),
          price: Number(r.price),
          fee: r.fee ? Number(r.fee) : undefined,
        })),
      })
      setSymbol('')
      setName('')
      setCurrency('EUR')
      setIsin('')
      setWkn('')
      setRows([emptyRow()])
      setQuery('')
      setResults([])
      setSearched(false)
      onDone?.()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form className="add-asset-form" onSubmit={handleSubmit}>
      <h2>Add asset</h2>

      <div className="search-row">
        <label htmlFor="asset-search">Search (ISIN, WKN, or free text)</label>
        <div className="search-row-input">
          <input
            id="asset-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. IE00B4L5Y983"
          />
          <button type="button" onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {searched && !searching && results.length === 0 && (
        <p className="hint">
          No matches. German WKNs often do not resolve with free providers — try the ISIN, or type the provider
          symbol directly into the "Symbol" field below (e.g. 'EUNL.DE').
        </p>
      )}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.symbol}>
              <button type="button" onClick={() => pickResult(r)}>
                <strong>{r.symbol}</strong> — {r.name}
                {r.currency ? ` (${r.currency})` : ''}
                {r.exchange ? ` · ${r.exchange}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="form-grid">
        <label htmlFor="asset-symbol">Symbol</label>
        <input
          id="asset-symbol"
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="EUNL.DE"
          required
        />

        <label htmlFor="asset-name">Name</label>
        <input id="asset-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="asset-currency">Currency</label>
        <input
          id="asset-currency"
          type="text"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          placeholder="EUR"
          required
        />

        <label htmlFor="asset-isin">ISIN (optional)</label>
        <input id="asset-isin" type="text" value={isin} onChange={(e) => setIsin(e.target.value)} />

        <label htmlFor="asset-wkn">WKN (optional)</label>
        <input id="asset-wkn" type="text" value={wkn} onChange={(e) => setWkn(e.target.value)} />
      </div>

      <h3>Buy orders</h3>
      <div className="lot-rows">
        {rows.map((row, i) => (
          <div className="lot-row" key={i}>
            <div className="lot-field">
              <label htmlFor={`new-lot-date-${i}`}>Date</label>
              <input
                id={`new-lot-date-${i}`}
                type="date"
                value={row.date}
                onChange={(e) => updateRow(i, { date: e.target.value })}
                required
              />
            </div>
            <div className="lot-field">
              <label htmlFor={`new-lot-qty-${i}`}>Quantity</label>
              <input
                id={`new-lot-qty-${i}`}
                type="number"
                step="any"
                min="0"
                value={row.quantity}
                onChange={(e) => updateRow(i, { quantity: e.target.value })}
                required
              />
            </div>
            <div className="lot-field">
              <label htmlFor={`new-lot-price-${i}`}>Price</label>
              <input
                id={`new-lot-price-${i}`}
                type="number"
                step="any"
                min="0"
                value={row.price}
                onChange={(e) => updateRow(i, { price: e.target.value })}
                required
              />
            </div>
            <div className="lot-field">
              <label htmlFor={`new-lot-fee-${i}`}>Fee (optional)</label>
              <input
                id={`new-lot-fee-${i}`}
                type="number"
                step="any"
                min="0"
                value={row.fee}
                onChange={(e) => updateRow(i, { fee: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="remove-row"
              onClick={() => removeRow(i)}
              disabled={rows.length <= 1}
              aria-label="Remove row"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addRow}>
        + Add another buy order
      </button>

      {!isValid && (
        <p className="hint">
          Symbol, name, currency, and at least one buy order with quantity &gt; 0 and price &gt; 0 are required.
        </p>
      )}
      {submitError && <p className="form-error">{submitError}</p>}

      <button type="submit" disabled={!isValid}>
        Add asset
      </button>
    </form>
  )
}
