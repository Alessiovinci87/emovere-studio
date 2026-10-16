import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from './AuthGate'
import { AiCreateDialog } from './components/AiCreateDialog'
import { AppShell, Page, SectionHeader } from './components/AppShell'
import { Editor } from './components/Editor'
import { SparkleIcon } from './components/Icons'
import { FoldersView } from './components/FoldersView'
import { FolderView } from './components/FolderView'
import { Library } from './components/Library'
import { Modal } from './components/Modal'
import { FolderPicker, SymbolPicker } from './components/Pickers'
import { Button } from './components/ui'
import { aiApi } from './lib/ai'
import { setAiScenes } from './lib/catalog'
import { downloadBlob } from './lib/download'
import { fetchColoringKeys, requestColoring } from './lib/coloring'
import { coloringKey } from './lib/look'
import { sheetFromPreset, type Preset } from './lib/presets'
import { loadSettings, saveSettings, type AppSettings } from './lib/settings'
import { dueReminders, todayISO } from './lib/reminders'
import { useRouter, type Route, type Section, sectionOf } from './lib/router'
import { createSheet } from './lib/sheet'
import * as store from './lib/store'
import type { Character, Scene, Sheet, StoreData, TemplateId } from './types'
import { visibleIndexes } from './components/SheetView'
import { CreateView, type CreateChoice } from './views/CreateView'
import { SettingsView } from './views/SettingsView'
import { GuideScreen } from './views/GuideEditor'
import { TodayView } from './views/TodayView'

type FolderAction = { mode: 'save' } | { mode: 'duplicate'; sheetId: string } | { mode: 'move'; sheetId: string }
type FolderChoice = { folderId: string } | { newName: string }

const STORAGE_FULL = 'Spazio del browser esaurito: le ultime modifiche non sono salvate. Esporta un backup.'

export default function App({ session }: { session: Session }) {
  const { route, depth, navigate, back } = useRouter()
  const [data, setData] = useState<StoreData>(store.loadData)
  /** Scheda non ancora salvata in una cartella */
  const [draft, setDraft] = useState<Sheet>(store.loadDraft)
  const [libraryCharacter, setLibraryCharacter] = useState<Character>('bambina')

  /** Riquadro (indice) in cui va la vignetta scelta in libreria */
  const [pickTarget, setPickTarget] = useState<number | null>(null)
  const [symbolIndex, setSymbolIndex] = useState<number | null>(null)
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [lastBackup, setLastBackup] = useState<string | null>(store.loadLastBackup)
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  /** Vignette con la versione da colorare già pronta (chiavi "A01_bambina") */
  const [coloringKeys, setColoringKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [coloringProgress, setColoringProgress] = useState<{ done: number; total: number } | null>(null)
  /** Vignette generate con AI (unite al catalogo) */
  const [aiScenes, setAiList] = useState<Scene[]>([])
  const [aiOpen, setAiOpen] = useState(false)

  /** Aggiorna il catalogo con le vignette AI e ridisegna */
  const applyAiScenes = useCallback((list: Scene[]) => {
    setAiScenes(list)
    setAiList(list)
  }, [])

  useEffect(() => {
    aiApi.scenes().then(applyAiScenes)
    fetchColoringKeys().then(setColoringKeys)
  }, [applyAiScenes])

  useEffect(() => {
    if (!store.saveData(data)) setToast(STORAGE_FULL)
  }, [data])
  useEffect(() => {
    if (!store.saveDraft(draft)) setToast(STORAGE_FULL)
  }, [draft])
  useEffect(() => {
    if (!saveSettings(settings)) setToast('Spazio del browser esaurito: il logo è troppo grande per essere salvato.')
  }, [settings])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Scheda aperta nell'editor (dall'URL): null = bozza
  const editingId = route.name === 'scheda' ? route.id : null
  const editing = route.name === 'scheda' ? (route.id ? data.sheets.find((s) => s.id === route.id) : draft) : undefined
  const editingFolder = editing ? data.folders.find((f) => f.id === editing.folderId) : undefined

  /** Tutte le schede, bozza compresa (sezione Oggi, promemoria, "aperte di recente") */
  const allSheets = useMemo(() => [...data.sheets, draft], [data.sheets, draft])
  const due = useMemo(
    () => dueReminders(draft.reminder ? allSheets : data.sheets, data.folders),
    [allSheets, data, draft.reminder],
  )
  const backupDue = store.isBackupDue(data, lastBackup)
  const todoCount = due.length + (backupDue ? 1 : 0)

  const updateEditing = useCallback(
    (patch: Partial<Sheet>) => {
      if (editingId) setData((d) => store.updateSheet(d, editingId, patch))
      else setDraft((s) => ({ ...s, ...patch, updatedAt: Date.now() }))
    },
    [editingId],
  )

  /** Apre una scheda nell'editor e la segna come aperta di recente. */
  function openSheet(id: string) {
    const now = Date.now()
    if (id === draft.id) {
      setDraft((s) => ({ ...s, openedAt: now }))
      navigate({ name: 'scheda', id: null })
    } else {
      setData((d) => ({ ...d, sheets: d.sheets.map((s) => (s.id === id ? { ...s, openedAt: now } : s)) }))
      navigate({ name: 'scheda', id })
    }
  }

  /** La scheda su cui si sta lavorando: l'ultima aperta (per "aggiungi dalla libreria"). */
  const lastOpened = allSheets.filter((s) => s.openedAt).sort((a, b) => b.openedAt! - a.openedAt!)[0] ?? draft

  function placeScene(target: Sheet, index: number, scene: Scene, update: (patch: Partial<Sheet>) => void) {
    update({ cells: target.cells.map((c, i) => (i === index ? { ...c, code: scene.code, text: null } : c)) })
  }

  /** Dalla Libreria: la vignetta va nel primo riquadro vuoto dell'ultima scheda aperta. */
  function addToLastSheet(scene: Scene) {
    const target = lastOpened
    const index = target.cells.findIndex((c) => !c.code)
    if (index === -1) {
      setToast(`“${target.title || 'Scheda'}” è piena: svuota un riquadro per aggiungere altre vignette.`)
      return
    }
    const update = (patch: Partial<Sheet>) =>
      target.id === draft.id
        ? setDraft((s) => ({ ...s, ...patch, updatedAt: Date.now() }))
        : setData((d) => store.updateSheet(d, target.id, patch))
    placeScene(target, index, scene, update)
    setToast(`Aggiunta a “${target.title || 'Scheda'}”, riquadro ${index + 1}`)
  }

  /** Cartella esistente o da creare al volo. */
  function resolveFolder(d: StoreData, choice: FolderChoice) {
    if ('folderId' in choice) return { data: d, folderId: choice.folderId }
    const { data: next, folder } = store.addFolder(d, choice.newName)
    return { data: next, folderId: folder.id }
  }

  function confirmFolderAction(action: FolderAction, choice: FolderChoice) {
    const { data: d, folderId } = resolveFolder(data, choice)
    const name = d.folders.find((f) => f.id === folderId)?.name ?? ''
    if (action.mode === 'save') {
      const savedSheet = store.withFolderName(d, { ...draft, folderId, updatedAt: Date.now() }, null)
      setData(store.upsertSheet(d, savedSheet))
      setDraft(createSheet())
      navigate({ name: 'scheda', id: savedSheet.id }, { replace: true })
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

  /** Crea: nuova scheda in una cartella (anche nuova) o come bozza, poi apre l'editor. */
  function createNewSheet(template: TemplateId, choice: CreateChoice) {
    placeNewSheet(choice, (childName) => ({ ...createSheet(template, childName), uppercase: settings.uppercaseDefault }))
  }

  /** Crea da una scheda pronta: tutto già compilato e modificabile. */
  function createFromPreset(preset: Preset, character: Character, choice: CreateChoice) {
    placeNewSheet(choice, (childName) => sheetFromPreset(preset, character, childName, settings.uppercaseDefault))
  }

  function placeNewSheet(choice: CreateChoice, make: (childName: string) => Sheet) {
    const now = Date.now()
    if ('draft' in choice) {
      const draftHasWork = draft.cells.some((c) => c.code) || draft.notes.trim() !== ''
      if (draftHasWork && !confirm('C’è una bozza non salvata: verrà sostituita da quella nuova. Continuare?')) return
      setDraft({ ...make(''), openedAt: now })
      navigate({ name: 'scheda', id: null }, { replace: true })
      return
    }
    const { data: d, folderId } = resolveFolder(data, choice)
    const folder = d.folders.find((f) => f.id === folderId)!
    const created = { ...make(folder.name), folderId, openedAt: now }
    setData(store.upsertSheet(d, created))
    navigate({ name: 'scheda', id: created.id }, { replace: true })
  }

  function deleteFolder(id: string) {
    setData((d) => store.deleteFolder(d, id))
    navigate({ name: 'bambini' }, { replace: true })
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
    const json = JSON.stringify(store.makeBackup(data, settings), null, 2)
    downloadBlob(new Blob([json], { type: 'application/json' }), `emovere-backup_${todayISO()}.json`)
    const now = new Date().toISOString()
    store.saveLastBackup(now)
    setLastBackup(now)
    setToast('Backup scaricato')
  }

  async function importBackup(file: File) {
    try {
      const { data: incoming, exportedAt, settings: incomingSettings } = store.parseBackup(await file.text())
      const when = exportedAt ? ` del ${new Date(exportedAt).toLocaleString('it-IT')}` : ''
      const extra = incomingSettings ? ' Sostituirà anche logo, nome del centro e impostazioni.' : ''
      const ok = confirm(
        `Il backup${when} contiene ${incoming.folders.length} cartelle e ${incoming.sheets.length} schede.\n\n` +
          `Sostituirà TUTTE le cartelle e le schede attuali (${data.folders.length} cartelle, ${data.sheets.length} schede).${extra} ` +
          'Non si può annullare. Continuare?',
      )
      if (!ok) return
      setData(incoming)
      if (incomingSettings) setSettings(incomingSettings)
      setToast('Backup importato')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Non è stato possibile leggere il backup.')
    }
  }

  async function deleteAiScene(scene: Scene) {
    const used = allSheets.filter((s) => s.cells.some((c) => c.code === scene.code)).length
    const warning = used > 0 ? `

È usata in ${used} ${used === 1 ? 'scheda' : 'schede'}: lì il riquadro resterà vuoto.` : ''
    if (!confirm(`Eliminare la vignetta “${scene.title_f}” (${scene.code})?${warning}

Non si può annullare.`)) return
    try {
      await aiApi.remove(scene.code)
      applyAiScenes(aiScenes.filter((s) => s.code !== scene.code))
      setToast(`Vignetta ${scene.code} eliminata`)
    } catch (err) {
      alert((err as Error).message)
    }
  }

  /** Vignette visibili della scheda (personaggio attuale) senza versione da colorare. */
  function missingColoring(target: Sheet): string[] {
    const codes = new Set(
      visibleIndexes(target)
        .map((i) => target.cells[i].code)
        .filter((c): c is string => !!c),
    )
    return [...codes].filter((code) => !coloringKeys.has(coloringKey(code, target.character)))
  }

  /** Genera le versioni da colorare mancanti (due alla volta), con avanzamento; si ferma al primo errore. */
  async function makeColoring(items: { code: string; character: Character }[]): Promise<string | null> {
    if (items.length === 0 || coloringProgress) return null
    const total = items.length
    let done = 0
    let error: string | null = null
    const queue = [...items]
    setColoringProgress({ done, total })
    await Promise.all(
      [0, 1].map(async () => {
        for (let item = queue.shift(); item && !error; item = queue.shift()) {
          try {
            const key = await requestColoring(item.code, item.character)
            setColoringKeys((keys) => new Set(keys).add(key))
            done++
            setColoringProgress({ done, total })
          } catch (err) {
            error = (err as Error).message
          }
        }
      }),
    )
    setColoringProgress(null)
    if (error) alert(error)
    return error
  }

  async function generateColoring(target: Sheet) {
    const error = await makeColoring(missingColoring(target).map((code) => ({ code, character: target.character })))
    if (!error) setToast('Versioni da colorare pronte')
  }

  /** Libreria: versione da colorare di una vignetta AI, bambina e bambino (2 immagini). */
  async function generateSceneColoring(scene: Scene) {
    const items = (['bambina', 'bambino'] as const)
      .filter((c) => !coloringKeys.has(coloringKey(scene.code, c)))
      .map((character) => ({ code: scene.code, character }))
    const error = await makeColoring(items)
    if (!error) setToast(`Versione da colorare di ${scene.code} pronta`)
  }

  const closePicker = useCallback(() => setPickTarget(null), [])
  const closeSymbol = useCallback(() => setSymbolIndex(null), [])
  const openFolder = (id: string) => navigate({ name: 'cartella', id })
  const goSection = (section: Section) => {
    if (section === 'libreria') setLibraryCharacter(lastOpened.character)
    navigate({ name: section } as Route)
  }
  /** Indietro se c'è una schermata precedente nell'app */
  const backTo = (fallback: Route) => (depth > 0 ? () => back(fallback) : undefined)

  function renderSection() {
    switch (route.name) {
      case 'oggi':
        return (
          <TodayView
            due={due}
            backup={backupDue ? { lastExport: lastBackup } : null}
            sheets={allSheets.filter((s) => s.folderId || s.openedAt)}
            folders={data.folders}
            onBackup={exportBackup}
            onOpen={openSheet}
            onReminderDone={markReminderDone}
          />
        )
      case 'bambini':
        return (
          <FoldersView
            testData={!session.account?.organization?.privacyVerifiedAt}
            folders={data.folders}
            sheets={data.sheets}
            onOpenFolder={openFolder}
            onCreateFolder={(name) => {
              const { data: d, folder } = store.addFolder(data, name)
              setData(d)
              openFolder(folder.id)
            }}
          />
        )
      case 'cartella': {
        const folder = data.folders.find((f) => f.id === route.id)
        if (!folder) return <Missing text="Questa cartella non esiste più." onBack={() => navigate({ name: 'bambini' })} />
        return (
          <FolderView
            key={folder.id}
            folder={folder}
            sheets={data.sheets.filter((s) => s.folderId === folder.id)}
            onBack={() => back({ name: 'bambini' })}
            onRename={(name) => setData((d) => store.updateFolder(d, folder.id, { name }))}
            onNotes={(notes) => setData((d) => store.updateFolder(d, folder.id, { notes }))}
            onDelete={() => deleteFolder(folder.id)}
            onNewSheet={() => navigate({ name: 'crea', folderId: folder.id })}
            onOpenSheet={openSheet}
            onStatus={(id, status) => setData((d) => store.setStatus(d, id, status))}
            onDuplicate={(id) => setFolderAction({ mode: 'duplicate', sheetId: id })}
            onMove={(id) => setFolderAction({ mode: 'move', sheetId: id })}
            onDeleteSheet={(id) => setData((d) => store.deleteSheet(d, id))}
          />
        )
      }
      case 'crea':
        return (
          <CreateView
            folders={data.folders}
            folderId={route.folderId}
            onBack={backTo({ name: 'oggi' })}
            onCreate={createNewSheet}
            onCreatePreset={createFromPreset}
            guidesOnline={!!session.account?.organization}
            onOpenGuide={(id) => navigate({ name: 'guida', id })}
          />
        )
      case 'libreria':
        return (
          <Page>
            <SectionHeader
              title="Libreria"
              subtitle={`Tocca una vignetta per aggiungerla a “${lastOpened.title || 'Scheda'}”.`}
              onBack={backTo({ name: 'oggi' })}
              actions={
                <Button tone="primary" onClick={() => setAiOpen(true)} className="flex items-center gap-2">
                  <SparkleIcon className="h-5 w-5" />
                  Crea nuova vignetta con AI
                </Button>
              }
            />
            <Library
              key={aiScenes.length}
              character={libraryCharacter}
              onCharacterChange={setLibraryCharacter}
              onPick={addToLastSheet}
              onDeleteAi={deleteAiScene}
              coloringKeys={coloringKeys}
              coloringBusy={coloringProgress !== null}
              onMakeColoring={generateSceneColoring}
              stickyBar
            />
          </Page>
        )
      case 'impostazioni':
        return (
          <SettingsView
            session={session}
            settings={settings}
            onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            lastBackup={lastBackup}
            folders={data.folders.length}
            sheets={data.sheets.length}
            onExport={exportBackup}
            onImport={importBackup}
          />
        )
      default:
        return null
    }
  }

  return (
    <>
      {route.name === 'guida' ? (
        <GuideScreen
          id={route.id}
          settings={settings}
          names={[...data.folders.map((f) => f.name), ...data.sheets.map((s) => s.childName)].filter((n) => n.trim())}
          onOpen={(id) => navigate({ name: 'guida', id }, { replace: true })}
          onClose={() => back({ name: 'crea' })}
        />
      ) : route.name === 'scheda' ? (
        editing ? (
          <Editor
            sheet={editing}
            folder={editingFolder}
            settings={settings}
            coloringKeys={coloringKeys}
            coloring={{
              missing: missingColoring(editing).length,
              progress: coloringProgress,
              onGenerate: () => void generateColoring(editing),
            }}
            onChange={updateEditing}
            onChooseScene={setPickTarget}
            onChooseSymbol={setSymbolIndex}
            onSave={() => setFolderAction({ mode: 'save' })}
            onOpenFolder={openFolder}
            onNew={() => navigate({ name: 'crea', folderId: editing.folderId ?? undefined })}
            onClose={() => back(editingFolder ? { name: 'cartella', id: editingFolder.id } : { name: 'oggi' })}
          />
        ) : (
          <Missing text="Questa scheda non esiste più." onBack={() => navigate({ name: 'oggi' })} />
        )
      ) : (
        <AppShell active={sectionOf(route) ?? 'oggi'} todoCount={todoCount} onNavigate={goSection}>
          {renderSection()}
        </AppShell>
      )}

      {pickTarget !== null && editing && (
        <Modal title={`Scegli la vignetta per il riquadro ${pickTarget + 1}`} onClose={closePicker}>
          <Library
            character={editing.character}
            onPick={(scene) => {
              placeScene(editing, pickTarget, scene, updateEditing)
              closePicker()
            }}
          />
        </Modal>
      )}

      {symbolIndex !== null && editing?.cells[symbolIndex] && (
        <SymbolPicker
          index={symbolIndex}
          value={editing.cells[symbolIndex].symbol}
          doneCircle={editing.doneCircle}
          onChange={(symbol) =>
            updateEditing({ cells: editing.cells.map((c, i) => (i === symbolIndex ? { ...c, symbol } : c)) })
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
          onConfirm={(choice) => {
            if (!('draft' in choice)) confirmFolderAction(folderAction, choice)
          }}
          onClose={() => setFolderAction(null)}
        />
      )}

      {aiOpen && (
        <AiCreateDialog
          onSaved={(scene) => {
            applyAiScenes([...aiScenes, scene])
            setAiOpen(false)
            setToast(`Vignetta ${scene.code} salvata in libreria`)
          }}
          onClose={() => setAiOpen(false)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-center text-sm font-bold text-white shadow-lg ${
            route.name === 'scheda' ? 'bottom-20' : 'bottom-24 lg:bottom-6'
          }`}
        >
          {toast}
        </div>
      )}
    </>
  )
}

function Missing({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <Page>
      <SectionHeader title="Non trovata" />
      <div className="flex flex-col items-start gap-4 rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-muted">{text}</p>
        <Button tone="primary" onClick={onBack}>
          Torna indietro
        </Button>
      </div>
    </Page>
  )
}
