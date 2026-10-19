import { useState } from 'react'
import { countByStatus } from '../lib/store'
import type { Folder, Sheet } from '../types'
import { Page, SectionHeader } from './AppShell'
import { Modal } from './Modal'
import { StatusCounts } from './Status'
import { Button, NameInput, TestDataWarning } from './ui'

interface Props {
  /** Privacy non ancora verificata dal titolare: avviso "Solo dati di prova" */
  testData: boolean
  folders: Folder[]
  sheets: Sheet[]
  /** Schede senza bambino (generiche) */
  genericCount: number
  onOpenGeneric: () => void
  onOpenFolder: (id: string) => void
  onCreateFolder: (name: string) => void
  onOpenTrash: () => void
}

/** Schermata principale: le cartelle dei bambini con i contatori per stato. */
export function FoldersView({ testData, folders, sheets, genericCount, onOpenGeneric, onOpenFolder, onCreateFolder, onOpenTrash }: Props) {
  const [creating, setCreating] = useState(false)
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))

  return (
    <Page>
      <SectionHeader
        title="Bambini"
        subtitle="Una cartella per ogni bambino (con il suo pseudonimo), con le sue schede."
        actions={
          <Button tone="primary" onClick={() => setCreating(true)}>
            + Nuova cartella
          </Button>
        }
      />

      {testData && <TestDataWarning />}

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

      {genericCount > 0 && (
        <button
          onClick={onOpenGeneric}
          className="mt-6 flex w-full items-center justify-between gap-3 rounded-3xl border border-dashed border-line bg-white/60 px-6 py-4 text-left transition hover:bg-white"
        >
          <span className="font-bold">Schede senza bambino</span>
          <span className="text-sm text-muted">
            {genericCount} {genericCount === 1 ? 'scheda' : 'schede'}
          </span>
        </button>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={onOpenTrash}>🗑 Cestino</Button>
      </div>

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
        <NameInput label="Pseudonimo del bambino" placeholder="Pseudonimo o iniziali" value={name} onChange={setName} autoFocus />
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
