import { useState } from 'react'
import type { ExportContext } from '../lib/exportPdf'
import type { ExportProgress } from '../lib/childExport'
import { childrenApi } from '../lib/serverData'
import type { Folder } from '../types'
import { Modal } from './Modal'
import { Button, inputClass } from './ui'

// Diritti sui dati del bambino, riservati al titolare: esportazione completa (ZIP) ed eliminazione definitiva.

export function ChildDataActions({ folder, exportContext, onDeleted }: { folder: Folder; exportContext: ExportContext; onDeleted: () => void }) {
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportData() {
    setError(null)
    setProgress({ done: 0, total: 0 })
    try {
      const { exportChildData } = await import('../lib/childExport')
      await exportChildData(folder.id, exportContext, setProgress)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-muted">
        Esporta tutto ciò che il centro conserva su {folder.name}: un file ZIP con i dati (JSON) e il PDF di ogni scheda. Serve per
        le richieste di accesso dei genitori o prima di eliminare il bambino.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button tone="soft" disabled={progress !== null} onClick={() => void exportData()}>
          {progress === null ? 'Esporta i dati del bambino' : progress.total === 0 ? 'Preparo…' : `PDF ${progress.done} di ${progress.total}…`}
        </Button>
        <Button tone="danger" disabled={progress !== null} onClick={() => setDeleting(true)}>
          Elimina bambino
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-bold text-[#a2472f]">
          {error}
        </p>
      )}
      {deleting && (
        <DeleteChildDialog
          folder={folder}
          onExport={() => void exportData()}
          exporting={progress !== null}
          onDeleted={() => {
            setDeleting(false)
            onDeleted()
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  )
}

/** Eliminazione definitiva: si conferma scrivendo il codice interno del bambino. */
function DeleteChildDialog({
  folder,
  exporting,
  onExport,
  onDeleted,
  onClose,
}: {
  folder: Folder
  exporting: boolean
  onExport: () => void
  onDeleted: () => void
  onClose: () => void
}) {
  // Codice interno (B-0001); per una cartella appena creata, non ancora ricaricata, il suo nome
  const code = (folder.code || folder.name).toUpperCase()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await childrenApi.remove(folder.id)
      onDeleted()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Elimina bambino" onClose={busy ? undefined : onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (typed.trim().toUpperCase() === code) void remove()
        }}
      >
        <p className="leading-relaxed">
          Elimina <strong>per sempre</strong> {folder.name}
          {folder.code ? ` (${folder.code})` : ''}: profilo, obiettivi con lo storico, materiali con le versioni e
          osservazioni. Non passa dal cestino e non si può annullare.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Nel registro degli accessi resta solo il codice interno. Se servono i dati, esportali prima.
        </p>
        <Button type="button" tone="soft" disabled={exporting || busy} onClick={onExport} className="self-start">
          {exporting ? 'Esporto…' : 'Esporta prima i dati'}
        </Button>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">
            Per confermare scrivi {folder.code ? `il codice ${folder.code}` : `il nome ${folder.name}`}
          </span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder={folder.code || folder.name} className={inputClass} />
        </label>
        {error && (
          <p role="alert" className="text-sm font-bold text-[#a2472f]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" tone="danger" disabled={busy || !code || typed.trim().toUpperCase() !== code}>
            Elimina per sempre
          </Button>
        </div>
      </form>
    </Modal>
  )
}
