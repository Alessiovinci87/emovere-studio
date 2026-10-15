import { useState } from 'react'
import { statuses } from '../lib/sheet'
import type { Folder, Sheet, SheetStatus } from '../types'
import { Page, SectionHeader } from './AppShell'
import { FolderNameDialog } from './FoldersView'
import { SheetCard } from './SheetCard'
import { Button, NotesField } from './ui'

interface Props {
  folder: Folder
  sheets: Sheet[]
  onBack: () => void
  onRename: (name: string) => void
  onNotes: (notes: string) => void
  onDelete: () => void
  onNewSheet: () => void
  onOpenSheet: (id: string) => void
  onStatus: (id: string, status: SheetStatus) => void
  onDuplicate: (id: string) => void
  onMove: (id: string) => void
  onDeleteSheet: (id: string) => void
}

export function FolderView({ folder, sheets, onBack, onRename, onNotes, onDelete, onNewSheet, onOpenSheet, ...actions }: Props) {
  const [renaming, setRenaming] = useState(false)
  const groups = statuses
    .map((s) => ({ ...s, sheets: sheets.filter((sh) => sh.status === s.id).sort((a, b) => b.updatedAt - a.updatedAt) }))
    .filter((g) => g.sheets.length > 0)

  return (
    <Page>
      <SectionHeader
        title={folder.name}
        subtitle={`${sheets.length} ${sheets.length === 1 ? 'scheda' : 'schede'}`}
        onBack={onBack}
        actions={
          <>
            <Button tone="primary" onClick={onNewSheet}>
              + Nuova scheda
            </Button>
            <Button onClick={() => setRenaming(true)}>Rinomina</Button>
            <Button
              tone="danger"
              onClick={() => {
                const n = sheets.length
                const what = n === 0 ? '' : n === 1 ? ' e la sua scheda' : ` e le sue ${n} schede`
                if (confirm(`Eliminare la cartella “${folder.name}”${what}? Non si può annullare.`)) onDelete()
              }}
            >
              Elimina cartella
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-6">
          {groups.length === 0 && (
            <div className="rounded-3xl bg-sand/60 px-6 py-12 text-center text-muted">
              Nessuna scheda in questa cartella.{' '}
              <button onClick={onNewSheet} className="font-bold text-sky underline">
                Creane una
              </button>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.id} className="flex flex-col gap-3">
              <h3 className="flex items-center gap-2 font-bold">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color }} />
                {g.label}
                <span className="text-sm font-normal text-muted">({g.sheets.length})</span>
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {g.sheets.map((sheet) => (
                  <SheetCard
                    key={sheet.id}
                    sheet={sheet}
                    onOpen={() => onOpenSheet(sheet.id)}
                    onStatus={(status) => actions.onStatus(sheet.id, status)}
                    onDuplicate={() => actions.onDuplicate(sheet.id)}
                    onMove={() => actions.onMove(sheet.id)}
                    onDelete={() => {
                      if (confirm(`Eliminare la scheda “${sheet.title || 'Senza titolo'}”? Non si può annullare.`))
                        actions.onDeleteSheet(sheet.id)
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="rounded-3xl bg-white p-6 shadow-sm">
          <NotesField value={folder.notes} onChange={onNotes} />
        </aside>
      </div>

      {renaming && (
        <FolderNameDialog
          title="Rinomina cartella"
          confirmLabel="Rinomina"
          initial={folder.name}
          onConfirm={(name) => {
            onRename(name)
            setRenaming(false)
          }}
          onClose={() => setRenaming(false)}
        />
      )}
    </Page>
  )
}
