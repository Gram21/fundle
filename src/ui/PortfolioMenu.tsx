import { useRef } from 'react'
import { useApp } from '../app/store'
import PortfolioDialogs, { type PortfolioDialogsHandle } from './PortfolioDialogs'

/** Replaces the plain <select> + separate add/delete buttons with one dropdown. */
export default function PortfolioMenu({
  viewAll,
  onSelectPortfolio,
  onSelectAll,
}: {
  viewAll: boolean
  onSelectPortfolio: (id: string) => void
  onSelectAll: () => void
}) {
  const { portfolios, activePortfolioId } = useApp()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const dialogsRef = useRef<PortfolioDialogsHandle>(null)

  const activeName = portfolios.find((p) => p.id === activePortfolioId)?.name ?? 'Portfolio'
  const label = viewAll ? 'All portfolios' : activeName

  function close() {
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <>
      <details ref={detailsRef} className="portfolio-menu">
        <summary>{label}</summary>
        <div className="portfolio-menu-panel">
          {portfolios.map((p) => (
            <div className="portfolio-menu-row" key={p.id}>
              <button
                type="button"
                className={
                  !viewAll && p.id === activePortfolioId
                    ? 'portfolio-menu-item active'
                    : 'portfolio-menu-item'
                }
                onClick={() => {
                  onSelectPortfolio(p.id)
                  close()
                }}
              >
                {p.name}
              </button>
              <button
                type="button"
                className="portfolio-menu-remove"
                disabled={portfolios.length <= 1}
                aria-label={`Delete ${p.name}`}
                title={`Delete ${p.name}`}
                onClick={() => {
                  close()
                  dialogsRef.current?.openRemove(p.id)
                }}
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            className={viewAll ? 'portfolio-menu-item active' : 'portfolio-menu-item'}
            onClick={() => {
              onSelectAll()
              close()
            }}
          >
            All portfolios
          </button>

          <hr className="portfolio-menu-divider" />

          <button
            type="button"
            className="portfolio-menu-item"
            onClick={() => {
              close()
              dialogsRef.current?.openAdd()
            }}
          >
            + Add portfolio
          </button>
        </div>
      </details>
      <PortfolioDialogs ref={dialogsRef} />
    </>
  )
}
