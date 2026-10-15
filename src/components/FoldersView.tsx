import { useState } from 'react'
import { countByStatus } from '../lib/store'
import type { Folder, Sheet } from '../types'
import { Page, SectionHeader } from './AppShell'
import { Modal } from './Modal'
import { StatusCounts } from './Status'
import { Button, NameInput } from './ui'

interface Props {
  folders: Folder[]
  sheets: Sheet[]
  onOpenFolder: (id: string) => void
  onCreateFolder: (name: string) => void
}

/** Schermata principale: le cartelle dei bambini con i contatori per stato. */
export function FoldersView({ folders, sheets, onOpenFolder, onCreateFolder }: Props) {
  const [creating, setCreating] = useState(false)
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))

  return (
    <Page>
      <SectionHeader
        title="Bambini"
        subtitle="Una cartella per ogni bambino, con le sue schede."
        actions={
          <Button tone="primary" onClick={() => setCreating(true)}>
            + Nuova cartella
          </Button>
        }
      />

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
                  className="flex h-full w-full flex-col gap-3 rounded-3xl bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
    </Page>
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
