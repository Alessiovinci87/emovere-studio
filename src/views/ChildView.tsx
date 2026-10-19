import { useCallback, useEffect, useRef, useState } from 'react'
import { Page, SectionHeader } from '../components/AppShell'
import { ChildDataActions } from '../components/ChildDataActions'
import { GoalsTab } from '../components/child/GoalsTab'
import { MaterialsTab, type SheetActions } from '../components/child/MaterialsTab'
import { ErrorText, ProfileTab } from '../components/child/ProfileTab'
import { FolderNameDialog } from '../components/FoldersView'
import { Button, NotesField } from '../components/ui'
import { childApi, type ChildDetail, type Goal, type ProfileEntry } from '../lib/childApi'
import type { ExportContext } from '../lib/exportPdf'
import type { ChildTab } from '../lib/router'
import type { Folder, Sheet } from '../types'

// Cartella del bambino (specifica di Martina, sezione 3): Profilo, Obiettivi, Materiali, Note.
// Nome, appunti e schede arrivano dai dati dell'app (salvati da sync.ts); profilo, obiettivi con storico e
// collegamenti scheda-obiettivo si leggono e si scrivono direttamente sul server. Aprire la cartella
// finisce nel registro degli accessi.

const TABS: { id: ChildTab; label: string }[] = [
  { id: 'profilo', label: 'Profilo' },
  { id: 'obiettivi', label: 'Obiettivi' },
  { id: 'materiali', label: 'Materiali' },
  { id: 'note', label: 'Note' },
]

interface Props {
  folder: Folder
  sheets: Sheet[]
  tab: ChildTab
  isOwner: boolean
  exportContext: ExportContext
  sheetActions: SheetActions
  onTab: (tab: ChildTab) => void
  onBack: () => void
  onRename: (name: string) => void
  onNotes: (notes: string) => void
  onTrash: () => void
  onNewSheet: () => void
  /** Eliminato per sempre sul server (solo titolare) */
  onDeleted: () => void
}

export function ChildView({ folder, sheets, tab, isOwner, exportContext, sheetActions, onTab, onBack, onRename, onNotes, onTrash, onNewSheet, onDeleted }: Props) {
  const [detail, setDetail] = useState<ChildDetail | null>(null)
  const [links, setLinks] = useState<Map<string, string[]> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [d, l] = await Promise.all([childApi.detail(folder.id), childApi.goalLinks(folder.id)])
      setDetail(d)
      setLinks(l)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [folder.id])
  useEffect(() => void load(), [load])

  const setEntries = (update: (list: ProfileEntry[]) => ProfileEntry[]) => setDetail((d) => (d ? { ...d, profile: update(d.profile) } : d))
  const setGoals = (update: (list: Goal[]) => Goal[]) => setDetail((d) => (d ? { ...d, goals: update(d.goals) } : d))

  async function setSheetGoals(sheet: Sheet, goalIds: string[]) {
    try {
      const { material, goalEvents } = await childApi.setGoals(sheet.id, goalIds)
      setLinks((l) => new Map(l).set(sheet.id, material.goalIds))
      setGoals((list) =>
        list.map((g) => {
          const added = goalEvents.filter((e) => e.goalId === g.id).map((e) => e.event)
          return added.length > 0 ? { ...g, events: [...g.events, ...added] } : g
        }),
      )
    } catch (err) {
      // Scheda appena creata, non ancora arrivata al server
      if ((err as Error).message === 'Scheda non trovata.') throw new Error('La scheda non è ancora salvata: riprova tra qualche secondo.')
      throw err
    }
  }

  const goals = detail?.goals ?? []
  const linkedCount = (goalId: string) => sheets.filter((s) => links?.get(s.id)?.includes(goalId)).length
  const activeGoals = goals.filter((g) => g.status === 'attivo').length
  const subtitle = [
    folder.code,
    detail?.child.birthYear ? `nascita ${detail.child.birthYear}` : null,
    `${sheets.length} ${sheets.length === 1 ? 'scheda' : 'schede'}`,
    detail ? `${activeGoals} ${activeGoals === 1 ? 'obiettivo attivo' : 'obiettivi attivi'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Page>
      <SectionHeader
        title={folder.name}
        subtitle={subtitle}
        onBack={onBack}
        actions={
          <>
            <Button tone="primary" onClick={onNewSheet}>
              + Nuovo materiale
            </Button>
            <MoreMenu
              items={[
                { label: 'Rinomina', run: () => setRenaming(true) },
                {
                  label: 'Sposta nel cestino',
                  danger: true,
                  run: () => {
                    const n = sheets.length
                    const what = n === 0 ? '' : n === 1 ? ' e la sua scheda' : ` e le sue ${n} schede`
                    if (confirm(`Spostare nel cestino “${folder.name}”${what}? Si può ripristinare dal cestino per 30 giorni.`)) onTrash()
                  },
                },
                ...(isOwner ? [{ label: 'Esporta o elimina i dati…', run: () => onTab('note') }] : []),
              ]}
            />
          </>
        }
      />

      <nav aria-label="Sezioni della cartella" className="sticky top-0 z-20 -mx-4 mb-6 bg-cream/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-full border border-line bg-white p-1 sm:inline-flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={`min-h-10 shrink-0 rounded-full px-3 text-sm font-bold transition sm:px-4 ${
                tab === t.id ? 'bg-accent text-white' : 'text-muted hover:bg-cream hover:text-ink'
              }`}
            >
              {t.label}
              {t.id === 'obiettivi' && detail && activeGoals > 0 && <span className="ml-1 opacity-80">({activeGoals})</span>}
            </button>
          ))}
        </div>
      </nav>

      {error && tab !== 'materiali' && tab !== 'note' && (
        <div className="flex flex-col items-start gap-3 rounded-3xl bg-white p-6 shadow-sm">
          <ErrorText>{error}</ErrorText>
          <Button tone="primary" onClick={() => void load()}>
            Riprova
          </Button>
        </div>
      )}
      {!detail && !error && (tab === 'profilo' || tab === 'obiettivi') && <p className="text-muted">Caricamento…</p>}

      {tab === 'profilo' && detail && (
        <ProfileTab child={detail.child} entries={detail.profile} onChild={(child) => setDetail((d) => (d ? { ...d, child } : d))} onEntries={setEntries} />
      )}
      {tab === 'obiettivi' && detail && (
        <GoalsTab childId={folder.id} goals={detail.goals} isOwner={isOwner} linkedCount={linkedCount} onGoals={setGoals} />
      )}
      {tab === 'materiali' && (
        <>
          {error && <p className="mb-4 text-sm text-muted">Obiettivi non caricati: {error}</p>}
          <MaterialsTab sheets={sheets} goals={goals} links={links} actions={sheetActions} onNewSheet={onNewSheet} onSetGoals={setSheetGoals} />
        </>
      )}
      {tab === 'note' && (
        <div className="grid max-w-3xl gap-6">
          <section className="flex flex-col gap-3 rounded-3xl bg-white p-6 shadow-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {folder.code && (
                <>
                  <dt className="text-muted">Codice interno</dt>
                  <dd className="font-bold">{folder.code}</dd>
                </>
              )}
              <dt className="text-muted">Nome sulle schede</dt>
              <dd className="font-bold">{folder.materialName || <span className="font-normal text-muted">nessuno (si cambia dall’editor)</span>}</dd>
            </dl>
            <NotesField value={folder.notes} onChange={onNotes} />
          </section>
          {isOwner && (
            <section className="flex flex-col gap-2 rounded-3xl bg-white p-6 shadow-sm">
              <h3 className="font-bold">Dati del bambino</h3>
              <ChildDataActions folder={folder} exportContext={exportContext} onDeleted={onDeleted} />
            </section>
          )}
        </div>
      )}

      {renaming && (
        <FolderNameDialog
          title="Rinomina"
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

/** Menu "⋯" con le azioni meno frequenti */
function MoreMenu({ items }: { items: { label: string; danger?: boolean; run: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <Button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Altre azioni" className="min-w-11">
        ⋯
      </Button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-2 flex min-w-56 sm:left-auto sm:right-0 flex-col overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.run()
              }}
              className={`min-h-11 px-4 text-left text-sm font-bold hover:bg-cream ${item.danger ? 'text-[#b5513a]' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
