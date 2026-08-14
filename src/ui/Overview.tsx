import { Fragment, useRef, useState, type FormEvent } from 'react'
import { useApp, useActivePortfolio } from '../app/store'
import { portfolioSnapshot, assetQuantity } from '../domain/portfolio'
import { money, pct, date, signClass } from './format'
import AddAssetForm from './AddAssetForm'

export default function Overview() {
  const { quotes, actions } = useApp()
  const portfolio = useActivePortfolio()
  const [openAssetId, setOpenAssetId] = useState<string | null>(null)
  const addDialogRef = useRef<HTMLDialogElement>(null)
  const snapshot = portfolioSnapshot(portfolio, quotes)

  const hasHeld = snapshot.assets.length > 0
  const hasSold = snapshot.soldAssets.length > 0
  const displayCurrency = snapshot.assets[0]?.asset.currency ?? snapshot.soldAssets[0]?.asset.currency ?? 'EUR'

  return (
    <div className="overview">
      {!hasHeld && !hasSold ? (
        <p className="empty-state">No assets yet — add one below to get started.</p>
      ) : (
        <>
          {!hasHeld && <p className="empty-state">No held assets — everything below has been sold.</p>}
          <div className="portfolio-summary">
            <div className="header-stat">
              <span className="header-stat-label">Value</span>
              <span className="header-stat-value">
                {money(snapshot.totalValue, displayCurrency)}
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
          {hasHeld && (
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
                <td className="num">{money(snapshot.totalValue, displayCurrency)}</td>
                <td className={`num ${signClass(snapshot.totalChangeAbs)}`}>
                  {money(snapshot.totalChangeAbs, displayCurrency)} ({pct(snapshot.totalChangePct)})
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
          )}

          {hasSold && (
          <div className="table-scroll">
          <h3>Sold</h3>
          <table className="asset-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sold date</th>
                <th>Quantity</th>
                <th>Avg buy price</th>
                <th>Sale price</th>
                <th>Proceeds</th>
                <th>Realized +/-</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {snapshot.soldAssets.map((row) => {
                const asset = row.asset
                const sale = asset.sale!
                const avgBuyPrice = sale.quantity ? row.costBasis / sale.quantity : 0
                return (
                  <tr key={asset.id} className="asset-row">
                    <td>
                      {asset.name}
                      <div className="asset-sub">
                        {asset.symbol}
                        {asset.isin ? ` · ${asset.isin}` : ''}
                      </div>
                    </td>
                    <td className="num">{date(sale.date)}</td>
                    <td className="num">{sale.quantity}</td>
                    <td className="num">{money(avgBuyPrice, asset.currency)}</td>
                    <td className="num">{money(sale.price, asset.currency)}</td>
                    <td className="num">{money(row.proceeds, asset.currency)}</td>
                    <td className={`num ${signClass(row.realizedChangeAbs)}`}>
                      {money(row.realizedChangeAbs, asset.currency)} ({pct(row.realizedChangePct)})
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remove ${asset.name} and all its history?`)) {
                            actions.removeAsset(asset.id)
                          }
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          )}
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

  const heldQuantity = asset ? assetQuantity(asset) : 0
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [salePrice, setSalePrice] = useState('')
  const [saleFee, setSaleFee] = useState('')
  const [saleError, setSaleError] = useState<string | null>(null)
  const editDialogRef = useRef<HTMLDialogElement>(null)

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

  function handleSell(e: FormEvent) {
    e.preventDefault()
    setSaleError(null)
    const quantity = heldQuantity
    const price = Number(salePrice)
    if (!(quantity > 0)) {
      setSaleError('Nothing to sell — this asset has no held quantity.')
      return
    }
    if (!(price > 0)) return
    actions.sellAsset(asset!.id, {
      date: saleDate,
      quantity,
      price,
      fee: saleFee ? Number(saleFee) : undefined,
    })
    setSalePrice('')
    setSaleFee('')
  }

  return (
    <div className="asset-detail">
      <button type="button" onClick={() => editDialogRef.current?.showModal()}>
        Edit asset
      </button>

      <dialog ref={editDialogRef} className="add-asset-dialog">
        <button
          type="button"
          className="dialog-close"
          aria-label="Close"
          onClick={() => editDialogRef.current?.close()}
        >
          ×
        </button>
        <AddAssetForm asset={asset} onDone={() => editDialogRef.current?.close()} />
      </dialog>

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

      <h4>Sell asset</h4>
      <form className="add-lot-form" onSubmit={handleSell}>
        <div className="lot-field">
          <label htmlFor={`sale-date-${asset.id}`}>Date</label>
          <input
            id={`sale-date-${asset.id}`}
            type="date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            required
          />
        </div>
        <div className="lot-field">
          <label htmlFor={`sale-qty-${asset.id}`}>Quantity</label>
          <input id={`sale-qty-${asset.id}`} type="number" value={heldQuantity} disabled readOnly />
        </div>
        <div className="lot-field">
          <label htmlFor={`sale-price-${asset.id}`}>Price</label>
          <input
            id={`sale-price-${asset.id}`}
            type="number"
            step="any"
            min="0"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            required
          />
        </div>
        <div className="lot-field">
          <label htmlFor={`sale-fee-${asset.id}`}>Fee (optional)</label>
          <input
            id={`sale-fee-${asset.id}`}
            type="number"
            step="any"
            min="0"
            value={saleFee}
            onChange={(e) => setSaleFee(e.target.value)}
          />
        </div>
        <button type="submit" className="remove-row" disabled={!(heldQuantity > 0)}>
          Sell full position
        </button>
      </form>
      {saleError && <p className="form-error">{saleError}</p>}
      <p className="hint">Selling the full position closes it — partial sells aren't supported yet.</p>

      <button type="button" className="remove-asset" onClick={handleRemoveAsset}>
        Remove asset
      </button>
    </div>
  )
}
