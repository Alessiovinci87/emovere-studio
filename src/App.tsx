import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Composer } from './components/Composer'
import { FoldersView } from './components/FoldersView'
import { FolderView } from './components/FolderView'
import { Library } from './components/Library'
import { Modal } from './components/Modal'
import { FolderPicker, SymbolPicker, TemplatePicker } from './components/Pickers'
import { TodoPanel } from './components/TodoPanel'
import { downloadBlob } from './lib/download'
import { dueReminders, todayISO } from './lib/reminders'
import { createSheet } from './lib/sheet'
import * as store from './lib/store'
import type { Character, Scene, Sheet, StoreData, TemplateId } from './types'

type View = { name: 'cartelle' } | { name: 'cartella'; id: string } | { name: 'scheda' } | { name: 'libreria' }
type FolderAction = { mode: 'save' } | { mode: 'duplicate'; sheetId: string } | { mode: 'move'; sheetId: string }
type FolderChoice = { folderId: string } | { newName: string }
/** Voce della cronologia del browser: schermata, scheda aperta e profondità (per il tasto Indietro) */
type NavEntry = { view: View; currentId: string | null; depth: number }

/** Dopo una ricarica della pagina si riparte dalla stessa schermata, con la cronologia intatta. */
const initialNav: NavEntry =
  (window.history.state as NavEntry | null)?.view
    ? (window.history.state as NavEntry)
    : { view: { name: 'cartelle' }, currentId: null, depth: 0 }

const STORAGE_FULL = 'Spazio del browser esaurito: le ultime modifiche non sono salvate. Esporta un backup.'

export default function App() {
  const [data, setData] = useState<StoreData>(store.loadData)
  /** Scheda non ancora salvata in una cartella */
  const [draft, setDraft] = useState<Sheet>(store.loadDraft)
  /** Scheda aperta nel composer: id di una scheda salvata, null = bozza */
  const [currentId, setCurrentId] = useState<string | null>(initialNav.currentId)
  const [view, setView] = useState<View>(initialNav.view)
  const [libraryCharacter, setLibraryCharacter] = useState<Character>('bambina')

  /** Riquadro (indice) in cui va la vignetta scelta in libreria */
  const [pickTarget, setPickTarget] = useState<number | null>(null)
  const [symbolIndex, setSymbolIndex] = useState<number | null>(null)
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null)
  const [newSheetFolder, setNewSheetFolder] = useState<{ folderId: string | null } | null>(null)
  const [todoOpen, setTodoOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [navDepth, setNavDepth] = useState(initialNav.depth)
  const [lastBackup, setLastBackup] = useState<string | null>(store.loadLastBackup)

  useEffect(() => {
    if (!store.saveData(data)) setToast(STORAGE_FULL)
  }, [data])
  useEffect(() => {
    if (!store.saveDraft(draft)) setToast(STORAGE_FULL)
  }, [draft])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Navigazione legata alla cronologia del browser: funzionano il tasto Indietro dell'app,
  // quello del browser e il gesto "indietro" su tablet e telefono.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const entry = e.state as NavEntry | null
      if (!entry?.view) return
      setView(entry.view)
      setCurrentId(entry.currentId)
      setNavDepth(entry.depth)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Tiene aggiornata la voce corrente (es. dopo il salvataggio la scheda aperta cambia id)
  useEffect(() => {
    window.history.replaceState({ view, currentId, depth: navDepth } satisfies NavEntry, '')
  }, [view, currentId, navDepth])

  /** Va a una schermata. Con replace non crea una nuova voce (es. dopo un'eliminazione). */
  function navigate(next: View, nextCurrentId: string | null = currentId, replace = false) {
    const depth = replace ? navDepth : navDepth + 1
    if (!replace) window.history.pushState({ view: next, currentId: nextCurrentId, depth } satisfies NavEntry, '')
    setView(next)
    setCurrentId(nextCurrentId)
    setNavDepth(depth)
  }

  const goHome = () => {
    if (view.name !== 'cartelle') navigate({ name: 'cartelle' })
  }

  const saved = currentId ? data.sheets.find((s) => s.id === currentId) : undefined
  const sheet = saved ?? draft
  const sheetFolder = data.folders.find((f) => f.id === sheet.folderId)

  const due = useMemo(
    () => dueReminders(draft.reminder ? [...data.sheets, draft] : data.sheets, data.folders),
    [data, draft],
  )
  const backupDue = store.isBackupDue(data, lastBackup)
  const todoCount = due.length + (backupDue ? 1 : 0)

  // All'apertura dell'app: se c'è qualcosa in scadenza, il pannello "Da fare" si apre da solo
  const checkedDue = useRef(false)
  useEffect(() => {
    if (checkedDue.current) return
    checkedDue.current = true
    if (todoCount > 0) setTodoOpen(true)
  }, [todoCount])

  const updateCurrent = useCallback(
    (patch: Partial<Sheet>) => {
      if (currentId) setData((d) => store.updateSheet(d, currentId, patch))
      else setDraft((s) => ({ ...s, ...patch, updatedAt: Date.now() }))
    },
    [currentId],
  )

  function openSheet(id: string) {
    navigate({ name: 'scheda' }, id === draft.id ? null : id)
  }

  function placeScene(index: number, scene: Scene) {
    updateCurrent({
      cells: sheet.cells.map((c, i) => (i === index ? { ...c, code: scene.code, text: null } : c)),
    })
  }

  /** Dalla libreria: la vignetta va nel primo riquadro vuoto. */
  function addToSheet(scene: Scene) {
    const index = sheet.cells.findIndex((c) => !c.code)
    if (index === -1) {
      setToast('La scheda è piena: svuota un riquadro per aggiungere altre vignette.')
      return
    }
    placeScene(index, scene)
    setToast(`Aggiunta al riquadro ${index + 1}`)
  }

  /** Cartella esistente o da creare al volo. */
  function resolveFolder(d: StoreData, choice: FolderChoice) {
    if ('folderId' in choice) return { data: d, folderId: choice.folderId }
    const { data: next, folder } = store.addFolder(d, choice.newName)
    return { data: next, folderId: folder.id }
  }

  function folderName(d: StoreData, id: string) {
    return d.folders.find((f) => f.id === id)?.name ?? ''
  }

  function confirmFolderAction(action: FolderAction, choice: FolderChoice) {
    const { data: d, folderId } = resolveFolder(data, choice)
    const name = folderName(d, folderId)
    if (action.mode === 'save') {
      const savedSheet = store.withFolderName(d, { ...draft, folderId, updatedAt: Date.now() }, null)
      setData(store.upsertSheet(d, savedSheet))
      setDraft(createSheet())
      setCurrentId(savedSheet.id)
      setToast(`Scheda salvata in “${name}”`)
    } else if (action.mode === 'duplicate') {
      setData(store.duplicateSheet(d, action.sheetId, folderId).data)
      setToast(`Copia creata in “${name}”`)
    } else {
      setData(store.moveSheet(d, action.sheetId, folderId))
      setToast(`Scheda spostata in “${name}”`)
    }
    setFolderAction(null)
  }

  function createNewSheet(template: TemplateId, folderId: string | null) {
    setNewSheetFolder(null)
    if (folderId) {
      const folder = data.folders.find((f) => f.id === folderId)!
      const created = { ...createSheet(template, folder.name), folderId }
      setData((d) => store.upsertSheet(d, created))
      navigate({ name: 'scheda' }, created.id)
    } else {
      const draftHasWork = draft.cells.some((c) => c.code) || draft.notes.trim() !== ''
      if (draftHasWork && !confirm('C’è una scheda non salvata: verrà sostituita da quella nuova. Continuare?')) return
      setDraft(createSheet(template))
      navigate({ name: 'scheda' }, null)
    }
  }

  function deleteFolder(id: string) {
    setData((d) => store.deleteFolder(d, id))
    navigate({ name: 'cartelle' }, saved?.folderId === id ? null : currentId, true)
  }

  function deleteSheet(id: string) {
    setData((d) => store.deleteSheet(d, id))
    if (currentId === id) setCurrentId(null)
  }

  function markReminderDone(id: string) {
    if (id === draft.id) setDraft((s) => ({ ...s, reminder: s.reminder && { ...s.reminder, done: true } }))
    else
      setData((d) => {
        const r = d.sheets.find((s) => s.id === id)?.reminder
        return r ? store.updateSheet(d, id, { reminder: { ...r, done: true } }) : d
      })
  }

  function exportBackup() {
    const json = JSON.stringify(store.makeBackup(data), null, 2)
    downloadBlob(new Blob([json], { type: 'application/json' }), `emovere-backup_${todayISO()}.json`)
    const now = new Date().toISOString()
    store.saveLastBackup(now)
    setLastBackup(now)
    setToast('Backup scaricato')
  }

  async function importBackup(file: File) {
    try {
      const { data: incoming, exportedAt } = store.parseBackup(await file.text())
      const when = exportedAt ? ` del ${new Date(exportedAt).toLocaleString('it-IT')}` : ''
      const ok = confirm(
        `Il backup${when} contiene ${incoming.folders.length} cartelle e ${incoming.sheets.length} schede.\n\n` +
          `Sostituirà TUTTE le cartelle e le schede attuali (${data.folders.length} cartelle, ${data.sheets.length} schede). ` +
          'Non si può annullare. Continuare?',
      )
      if (!ok) return
      setData(incoming)
      navigate({ name: 'cartelle' }, null, true)
      setToast('Backup importato')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Non è stato possibile leggere il backup.')
    }
  }

  const closePicker = useCallback(() => setPickTarget(null), [])
  const closeSymbol = useCallback(() => setSymbolIndex(null), [])
  const openFolder = (id: string) => navigate({ name: 'cartella', id })
  const currentFolderView = view.name === 'cartella' ? data.folders.find((f) => f.id === view.id) : undefined

  const navItems: { id: View['name']; label: string }[] = [
    { id: 'cartelle', label: 'Cartelle' },
    { id: 'scheda', label: 'Scheda' },
    { id: 'libreria', label: 'Libreria' },
  ]
  const activeNav = view.name === 'cartella' ? 'cartelle' : view.name

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">
            <button onClick={goHome} title="Torna alla home (cartelle)" className="rounded-full px-1 hover:opacity-80">
              Emovere <span className="text-peach">Studio</span>
            </button>
          </h1>
          <button
            onClick={goHome}
            aria-label="Home"
            title="Home: tutte le cartelle"
            className="rounded-full bg-sand px-3 py-2 font-bold text-muted transition hover:text-ink"
          >
            🏠 Home
          </button>
          {navDepth > 0 && (
            <button
              onClick={() => window.history.back()}
              title="Torna alla schermata precedente"
              className="rounded-full bg-sand px-3 py-2 font-bold text-muted transition hover:text-ink"
            >
              ← Indietro
            </button>
          )}
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-sand p-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'libreria') setLibraryCharacter(sheet.character)
                  if (item.id !== activeNav || view.name === 'cartella') navigate({ name: item.id } as View)
                }}
                aria-current={activeNav === item.id ? 'page' : undefined}
                className={`rounded-full px-4 py-2 font-bold transition sm:px-5 ${
                  activeNav === item.id ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setTodoOpen(true)}
            className="relative rounded-full bg-sand px-4 py-2 font-bold text-muted transition hover:text-ink"
          >
            Da fare
            {todoCount > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-peach px-1.5 text-xs font-bold text-white"
                aria-label={`${todoCount} promemoria`}
              >
                {todoCount}
              </span>
            )}
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-[96rem] px-4 pb-16 sm:px-6">
        {view.name === 'cartelle' && (
          <FoldersView
            folders={data.folders}
            sheets={data.sheets}
            onOpenFolder={openFolder}
            onCreateFolder={(name) => {
              const { data: d, folder } = store.addFolder(data, name)
              setData(d)
              openFolder(folder.id)
            }}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
          />
        )}

        {currentFolderView && (
          <FolderView
            key={currentFolderView.id}
            folder={currentFolderView}
            sheets={data.sheets.filter((s) => s.folderId === currentFolderView.id)}
            onBack={goHome}
            onRename={(name) => setData((d) => store.updateFolder(d, currentFolderView.id, { name }))}
            onNotes={(notes) => setData((d) => store.updateFolder(d, currentFolderView.id, { notes }))}
            onDelete={() => deleteFolder(currentFolderView.id)}
            onNewSheet={() => setNewSheetFolder({ folderId: currentFolderView.id })}
            onOpenSheet={openSheet}
            onStatus={(id, status) => setData((d) => store.setStatus(d, id, status))}
            onDuplicate={(id) => setFolderAction({ mode: 'duplicate', sheetId: id })}
            onMove={(id) => setFolderAction({ mode: 'move', sheetId: id })}
            onDeleteSheet={deleteSheet}
          />
        )}
        {view.name === 'cartella' && !currentFolderView && (
          <p className="text-muted">
            Questa cartella non esiste più.{' '}
            <button onClick={goHome} className="font-bold text-sky underline">
              Torna alla home
            </button>
          </p>
        )}

        {view.name === 'scheda' && (
          <Composer
            sheet={sheet}
            folder={sheetFolder}
            onChange={updateCurrent}
            onChooseScene={setPickTarget}
            onChooseSymbol={setSymbolIndex}
            onSave={() => setFolderAction({ mode: 'save' })}
            onOpenFolder={openFolder}
            onNew={() => setNewSheetFolder({ folderId: sheet.folderId })}
          />
        )}

        {view.name === 'libreria' && (
          <Library character={libraryCharacter} onCharacterChange={setLibraryCharacter} onPick={addToSheet} />
        )}
      </main>

      {pickTarget !== null && (
        <Modal
          title={`Scegli la vignetta per il riquadro ${pickTarget + 1}`}
          onClose={closePicker}
        >
          <Library
            character={sheet.character}
            onPick={(scene) => {
              placeScene(pickTarget, scene)
              closePicker()
            }}
          />
        </Modal>
      )}

      {symbolIndex !== null && sheet.cells[symbolIndex] && (
        <SymbolPicker
          index={symbolIndex}
          value={sheet.cells[symbolIndex].symbol}
          doneCircle={sheet.doneCircle}
          onChange={(symbol) =>
            updateCurrent({ cells: sheet.cells.map((c, i) => (i === symbolIndex ? { ...c, symbol } : c)) })
          }
          onClose={closeSymbol}
        />
      )}

      {folderAction && (
        <FolderPicker
          title={
            folderAction.mode === 'save'
              ? 'Salva in una cartella'
              : folderAction.mode === 'duplicate'
                ? 'Duplica nella cartella'
                : 'Sposta nella cartella'
          }
          confirmLabel={folderAction.mode === 'save' ? 'Salva' : folderAction.mode === 'duplicate' ? 'Duplica' : 'Sposta'}
          folders={[...data.folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))}
          initialFolderId={
            folderAction.mode === 'save' ? undefined : data.sheets.find((s) => s.id === folderAction.sheetId)?.folderId
          }
          onConfirm={(choice) => confirmFolderAction(folderAction, choice)}
          onClose={() => setFolderAction(null)}
        />
      )}

      {newSheetFolder && (
        <TemplatePicker
          onPick={(template) => createNewSheet(template, newSheetFolder.folderId)}
          onClose={() => setNewSheetFolder(null)}
        />
      )}

      {todoOpen && (
        <TodoPanel
          items={due}
          backup={backupDue ? { lastExport: lastBackup } : null}
          onBackup={exportBackup}
          onOpen={(id) => {
            setTodoOpen(false)
            openSheet(id)
          }}
          onDone={markReminderDone}
          onClose={() => setTodoOpen(false)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-center text-sm font-bold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
