import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent } from 'react'
import { useApp, useActivePortfolio } from '../app/store'

export interface PortfolioDialogsHandle {
  openAdd(): void
  openRemove(): void
}

/**
 * window.prompt()/confirm() throw or silently no-op in several real environments
 * (sandboxed iframes without allow-modals, some embedded/automation browsers) —
 * that made "+" and the trash button look broken. These dialogs replace both.
 */
const PortfolioDialogs = forwardRef<PortfolioDialogsHandle>(function PortfolioDialogs(_props, ref) {
  const { actions } = useApp()
  const portfolio = useActivePortfolio()
  const addRef = useRef<HTMLDialogElement>(null)
  const removeRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')

  useImperativeHandle(ref, () => ({
    openAdd() {
      setName('')
      addRef.current?.showModal()
    },
    openRemove() {
      removeRef.current?.showModal()
    },
  }))

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    actions.addPortfolio(trimmed)
    addRef.current?.close()
  }

  function handleConfirmRemove() {
    actions.removePortfolio(portfolio.id)
    removeRef.current?.close()
  }

  return (
    <>
      <dialog ref={addRef} className="small-dialog">
        <button type="button" className="dialog-close" aria-label="Close" onClick={() => addRef.current?.close()}>
          ×
        </button>
        <form onSubmit={handleAdd}>
          <h2>New portfolio</h2>
          <label htmlFor="new-portfolio-name">Name</label>
          <input
            id="new-portfolio-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <div className="dialog-actions">
            <button type="submit" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={removeRef} className="small-dialog">
        <button
          type="button"
          className="dialog-close"
          aria-label="Close"
          onClick={() => removeRef.current?.close()}
        >
          ×
        </button>
        <h2>Delete portfolio?</h2>
        <p>
          Delete "{portfolio.name}" and everything in it. This cannot be undone.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={() => removeRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={handleConfirmRemove}>
            Delete
          </button>
        </div>
      </dialog>
    </>
  )
})

export default PortfolioDialogs
