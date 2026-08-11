import { Fragment, useRef, useState, type FormEvent } from 'react'
import { useApp, useActivePortfolio } from '../app/store'
import { portfolioSnapshot } from '../domain/portfolio'
import { money, pct, date, signClass } from './format'
import AddAssetForm from './AddAssetForm'

export default function Overview() {
  const { quotes } = useApp()
  const portfolio = useActivePortfolio()
  const [openAssetId, setOpenAssetId] = useState<string | null>(null)
  const addDialogRef = useRef<HTMLDialogElement>(null)
  const snapshot = portfolioSnapshot(portfolio, quotes)

  return (
    <div className="overview">
      {portfolio.assets.length === 0 ? (
        <p className="empty-state">No assets yet — add one below to get started.</p>
      ) : (
        <>
          <div className="portfolio-summary">
            <div className="header-stat">
              <span className="header-stat-label">Value</span>
              <span className="header-stat-value">
                {money(snapshot.totalValue, portfolio.assets[0]?.currency ?? 'EUR')}
              </span>
            </div>
            <div className="header-stat">
              <span className="header-stat-label">Day</span>
              <span className={`header-stat-value ${signClass(snapshot.dayChangeAbs)}`}>
                {pct(snapshot.dayChangePct)}
              </span>
            </div>
            <div className="header-stat">
              <span className="header-stat-label">Total</span>
              <span className={`header-stat-value ${signClass(snapshot.totalChangeAbs)}`}>
                {pct(snapshot.totalChangePct)}
              </span>
            </div>
          </div>
          <div className="table-scroll">
          <table className="asset-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Quantity</th>
                <th>Avg buy price</th>
                <th>Price</th>
                <th>Day %</th>
                <th>Value</th>
                <th>Total +/-</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.assets.map((row) => {
                const asset = row.asset
                const isOpen = openAssetId === asset.id
                const avgBuyPrice = row.quantity ? row.costBasis / row.quantity : 0
                return (
                  <Fragment key={asset.id}>
                    <tr className="asset-row">
                      <td>
                        <button
                          type="button"
                          className="row-expand"
                          onClick={() => setOpenAssetId(isOpen ? null : asset.id)}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? '▾' : '▸'} {asset.name}
                        </button>
                        <div className="asset-sub">
                          {asset.symbol}
                          {asset.isin ? ` · ${asset.isin}` : ''}
                        </div>
                      </td>
                      <td className="num">{row.quantity}</td>
                      <td className="num">{money(avgBuyPrice, asset.currency)}</td>
                      <td className="num">{money(row.price, asset.currency)}</td>
                      <td className={`num ${signClass(row.dayChangeAbs)}`}>{pct(row.dayChangePct)}</td>
                      <td className="num">{money(row.marketValue, asset.currency)}</td>
                      <td className={`num ${signClass(row.totalChangeAbs)}`}>
                        {money(row.totalChangeAbs, asset.currency)} ({pct(row.totalChangePct)})
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="asset-detail-row">
                        <td colSpan={7}>
                          <AssetDetail assetId={asset.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td></td>
                <td></td>
                <td></td>
                <td className={signClass(snapshot.dayChangeAbs)}>{pct(snapshot.dayChangePct)}</td>
                <td className="num">{money(snapshot.totalValue, portfolio.assets[0]?.currency ?? 'EUR')}</td>
                <td className={`num ${signClass(snapshot.totalChangeAbs)}`}>
                  {money(snapshot.totalChangeAbs, portfolio.assets[0]?.currency ?? 'EUR')} ({pct(snapshot.totalChangePct)})
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </>
      )}

      <button type="button" className="add-asset-open" onClick={() => addDialogRef.current?.showModal()}>
        + Add asset
      </button>

      <dialog ref={addDialogRef} className="add-asset-dialog">
        <button
          type="button"
          className="dialog-close"
          aria-label="Close"
          onClick={() => addDialogRef.current?.close()}
        >
          ×
        </button>
        <AddAssetForm onDone={() => addDialogRef.current?.close()} />
      </dialog>
    </div>
  )
}

function AssetDetail({ assetId }: { assetId: string }) {
  const { actions } = useApp()
  const portfolio = useActivePortfolio()
  const asset = portfolio.assets.find((a) => a.id === assetId)
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [newQty, setNewQty] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newFee, setNewFee] = useState('')

  if (!asset) return null

  function handleRemoveAsset() {
    if (window.confirm(`Remove ${asset!.name} and all its buy orders?`)) {
      actions.removeAsset(asset!.id)
    }
  }

  function handleAddLot(e: FormEvent) {
    e.preventDefault()
    const quantity = Number(newQty)
    const price = Number(newPrice)
    if (!(quantity > 0) || !(price > 0)) return
    actions.addLot(asset!.id, {
      date: newDate,
      quantity,
      price,
      fee: newFee ? Number(newFee) : undefined,
    })
    setNewQty('')
    setNewPrice('')
    setNewFee('')
  }

  return (
    <div className="asset-detail">
      <table className="lot-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Quantity</th>
            <th>Price</th>
            <th>Fee</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {asset.lots.map((lot) => (
            <tr key={lot.id}>
              <td>{date(lot.date)}</td>
              <td className="num">{lot.quantity}</td>
              <td className="num">{money(lot.price, asset.currency)}</td>
              <td className="num">{lot.fee ? money(lot.fee, asset.currency) : '–'}</td>
              <td>
                <button type="button" onClick={() => actions.removeLot(asset.id, lot.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="add-lot-form" onSubmit={handleAddLot}>
        <div className="lot-field">
          <label htmlFor={`lot-date-${asset.id}`}>Date</label>
          <input
            id={`lot-date-${asset.id}`}
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
          />
        </div>
        <div className="lot-field">
          <label htmlFor={`lot-qty-${asset.id}`}>Quantity</label>
          <input
            id={`lot-qty-${asset.id}`}
            type="number"
            step="any"
            min="0"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            required
          />
        </div>
        <div className="lot-field">
          <label htmlFor={`lot-price-${asset.id}`}>Price</label>
          <input
            id={`lot-price-${asset.id}`}
            type="number"
            step="any"
            min="0"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            required
          />
        </div>
        <div className="lot-field">
          <label htmlFor={`lot-fee-${asset.id}`}>Fee (optional)</label>
          <input
            id={`lot-fee-${asset.id}`}
            type="number"
            step="any"
            min="0"
            value={newFee}
            onChange={(e) => setNewFee(e.target.value)}
          />
        </div>
        <button type="submit" className="remove-row">
          Add buy order
        </button>
      </form>

      <button type="button" className="remove-asset" onClick={handleRemoveAsset}>
        Remove asset
      </button>
    </div>
  )
}
