import { useState } from 'react'
import { countByStatus } from '../lib/store'
import type { Folder, Sheet } from '../types'
import { BackupPanel } from './BackupPanel'
import { Modal } from './Modal'
import { StatusCounts } from './Status'
import { Button, NameInput } from './ui'

interface Props {
  folders: Folder[]
  sheets: Sheet[]
  onOpenFolder: (id: string) => void
  onCreateFolder: (name: string) => void
  onExportBackup: () => void
  onImportBackup: (file: File) => void
}

/** Schermata principale: le cartelle dei bambini con i contatori per stato. */
export function FoldersView({ folders, sheets, onOpenFolder, onCreateFolder, onExportBackup, onImportBackup }: Props) {
  const [creating, setCreating] = useState(false)
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Cartelle</h2>
        <Button tone="primary" onClick={() => setCreating(true)}>
          + Nuova cartella
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-3xl bg-sand/60 px-6 py-12 text-center text-muted">
          Ancora nessuna cartella. Crea una cartella per ogni bambino e tieni lì le sue schede.
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((folder) => {
            const own = sheets.filter((s) => s.folderId === folder.id)
            return (
              <li key={folder.id}>
                <button
                  onClick={() => onOpenFolder(folder.id)}
                  className="flex h-full w-full flex-col gap-3 rounded-3xl border border-line bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-sky hover:shadow-md"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold">📁 {folder.name}</span>
                    <span className="text-sm text-muted">
                      {own.length} {own.length === 1 ? 'scheda' : 'schede'}
                    </span>
                  </span>
                  <StatusCounts counts={countByStatus(own)} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <BackupPanel onExport={onExportBackup} onImport={onImportBackup} />

      {creating && (
        <FolderNameDialog
          title="Nuova cartella"
          confirmLabel="Crea"
          initial=""
          onConfirm={(name) => {
            onCreateFolder(name)
            setCreating(false)
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

export function FolderNameDialog({
  title,
  confirmLabel,
  initial,
  onConfirm,
  onClose,
}: {
  title: string
  confirmLabel: string
  initial: string
  onConfirm: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial)
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onConfirm(name.trim())
        }}
      >
        <NameInput label="Nome del bambino" value={name} onChange={setName} autoFocus />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" tone="primary" disabled={!name.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
