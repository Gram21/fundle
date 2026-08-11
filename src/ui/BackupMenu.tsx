import { useRef, useState } from 'react'
import { useApp } from '../app/store'

/** Export/import, as a header dropdown (native <details> — no click-outside plumbing needed). */
export default function BackupMenu() {
  const { actions } = useApp()
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const detailsRef = useRef<HTMLDetailsElement>(null)

  function handleExport() {
    const json = actions.exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `fundle-${today}.json`
    a.click()
    URL.revokeObjectURL(url)
    if (detailsRef.current) detailsRef.current.open = false
  }

  async function handleImportFile(file: File) {
    setImportError(null)
    setImportSuccess(false)
    try {
      const text = await file.text()
      actions.importJson(text)
      setImportSuccess(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <details ref={detailsRef} className="backup-menu">
      <summary>Backup</summary>
      <div className="backup-menu-panel">
        <p className="hint">
          Data lives only in this browser's local storage — nothing is synced anywhere. Export
          regularly so you don't lose it.
        </p>
        <button type="button" onClick={handleExport}>
          Export data (.json)
        </button>

        <div className="import-row">
          <label htmlFor="import-file">Import data (.json)</label>
          <input
            id="import-file"
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
            }}
          />
        </div>
        <p className="hint">Importing replaces all current portfolios and settings.</p>
        {importError && <p className="form-error">{importError}</p>}
        {importSuccess && <p className="form-success">Import successful.</p>}
      </div>
    </details>
  )
}
