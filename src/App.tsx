import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from './AuthGate'
import { AuditLogDialog } from './components/AuditLogDialog'
import { ImportDialog } from './components/ImportDialog'
import { accountApi } from './lib/account'
import { localDataPresent, localImportAvailable, localImportDone, localImportSource, markLocalImported, type ImportSource } from './lib/importLocal'
import { useServerData } from './lib/useServerData'
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
import { loadSettings, normalizeSettings, saveSettings, type AppSettings } from './lib/settings'
import { dueReminders, todayISO } from './lib/reminders'
import { useRouter, type Route, type Section, sectionOf } from './lib/router'
import { createSheet, newId } from './lib/sheet'
import * as store from './lib/store'
import type { Character, Folder, Scene, Sheet, StoreData, TemplateId } from './types'
import { visibleIndexes } from './components/SheetView'
import { CreateView, type CreateChoice } from './views/CreateView'
import { SettingsView } from './views/SettingsView'
import { GuideScreen } from './views/GuideEditor'
import { TodayView } from './views/TodayView'
import { TrashView } from './views/TrashView'
import { ChildView } from './views/ChildView'

type FolderAction = { mode: 'save' } | { mode: 'duplicate'; sheetId: string } | { mode: 'move'; sheetId: string }
type FolderChoice = { folderId: string } | { newName: string }

/** Cartella "virtuale" con le schede senza bambino (generiche, ex bozze) */
const GENERIC_FOLDER: Folder = { id: '__generiche', name: 'Schede senza bambino', notes: '', createdAt: 0, updatedAt: 0 }

/** Dati del centro dal server: senza accesso (o senza server in locale) l'app non parte. */
export default function App({ session }: { session: Session }) {
  const org = session.account?.organization
  if (!org) {
    return (
      <CenteredMessage title="Serve il server">
        In locale l’app lavora con il server di prova: avvia <code>npm run dev:api</code> e poi <code>npm run dev:server</code>{' '}
        (istruzioni in CLAUDE.md).
      </CenteredMessage>
    )
  }
  return <ServerWorkspace key={org.id} session={session} orgId={org.id} />
}

function ServerWorkspace({ session, orgId }: { session: Session; orgId: string }) {
  const server = useServerData(orgId)
  if (!server.data) {
    return server.loadError ? (
      <CenteredMessage title="Dati non caricati" action={{ label: 'Riprova', run: () => void server.reload() }}>
        {server.loadError}
      </CenteredMessage>
    ) : (
      <CenteredMessage title="">Carico le schede…</CenteredMessage>
    )
  }
  return <Workspace session={session} server={server} data={server.data} />
}

function CenteredMessage({ title, action, children }: { title: string; action?: { label: string; run: () => void }; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream p-6 text-center">
      {title && <h1 className="text-2xl font-bold">{title}</h1>}
      <p className="max-w-md leading-relaxed text-muted">{children}</p>
      {action && (
        <Button tone="primary" onClick={action.run}>
          {action.label}
        </Button>
      )}
    </main>
  )
}

function Workspace({ session, server, data }: { session: Session; server: ReturnType<typeof useServerData>; data: StoreData }) {
  const { route, depth, navigate, back } = useRouter()
  const { setData, status: sync, resolveConflict } = server
  const isOwner = session.account?.organization?.role === 'titolare'
  const [importSource, setImportSource] = useState<ImportSource | null>(null)
  const [libraryCharacter, setLibraryCharacter] = useState<Character>('bambina')

  /** Riquadro (indice) in cui va la vignetta scelta in libreria */
  const [pickTarget, setPickTarget] = useState<number | null>(null)
  const [symbolIndex, setSymbolIndex] = useState<number | null>(null)
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [lastBackup, setLastBackup] = useState<string | null>(store.loadLastBackup)
  // Impostazioni del centro (sul server); prima di averle salvate lì vale la copia di questo browser
  const [settings, setSettings] = useState<AppSettings>(() => orgSettings(session) ?? loadSettings())
  /** Vignette con la versione da colorare già pronta (chiavi "A01_bambina") */
  const [coloringKeys, setColoringKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [coloringProgress, setColoringProgress] = useState<{ done: number; total: number } | null>(null)
  /** Vignette generate con AI (unite al catalogo) */
  const [aiScenes, setAiList] = useState<Scene[]>([])
  const [aiOpen, setAiOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)

  /** Aggiorna il catalogo con le vignette AI e ridisegna */
  const applyAiScenes = useCallback((list: Scene[]) => {
    setAiScenes(list)
    setAiList(list)
  }, [])

  useEffect(() => {
    aiApi.scenes().then(applyAiScenes)
    fetchColoringKeys().then(setColoringKeys)
  }, [applyAiScenes])

  // Impostazioni: copia nel browser e, per il titolare, salvataggio sul server (dopo una breve pausa)
  const savedSettings = useRef(JSON.stringify(orgSettings(session)))
  useEffect(() => {
    saveSettings(settings)
    if (!isOwner || JSON.stringify(settings) === savedSettings.current) return
    const t = setTimeout(() => {
      accountApi
        .saveSettings(settings)
        .then(() => (savedSettings.current = JSON.stringify(settings)))
        .catch((err: Error) => setToast(err.message))
    }, 800)
    return () => clearTimeout(t)
  }, [settings, isOwner])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Scheda aperta nell'editor (dall'URL): null = bozza
  const editingId = route.name === 'scheda' ? route.id : null
  const editing = editingId ? data.sheets.find((s) => s.id === editingId) : undefined
  const editingFolder = editing ? data.folders.find((f) => f.id === editing.folderId) : undefined

  // La vecchia "bozza" (/scheda/bozza) non esiste più: le schede senza bambino sono generiche, sul server
  useEffect(() => {
    if (route.name === 'scheda' && !route.id) navigate({ name: 'oggi' }, { replace: true })
  }, [route, navigate])

  /** Tutte le schede, anche quelle senza bambino */
  const allSheets = data.sheets
  const due = useMemo(() => dueReminders(data.sheets, data.folders), [data])
  const backupDue = store.isBackupDue(data, lastBackup)
  const todoCount = due.length + (backupDue ? 1 : 0)

  const updateEditing = useCallback(
    (patch: Partial<Sheet>) => {
      if (!editingId) return
      setData((d) => {
        const sheet = d.sheets.find((s) => s.id === editingId)
        // Il nome sulle schede è del bambino: cambiandolo qui cambia in tutte le sue schede
        if (sheet?.folderId && patch.childName !== undefined) return store.setChildName(d, sheet.folderId, editingId, patch)
        return store.updateSheet(d, editingId, patch)
      })
    },
    [editingId, setData],
  )

  /** Apre una scheda nell'editor e la segna come aperta di recente. */
  function openSheet(id: string) {
    const now = Date.now()
    setData((d) => ({ ...d, sheets: d.sheets.map((s) => (s.id === id ? { ...s, openedAt: now } : s)) }))
    navigate({ name: 'scheda', id })
  }

  /** La scheda su cui si sta lavorando: l'ultima aperta (per "aggiungi dalla libreria"). */
  const lastOpened: Sheet | undefined = allSheets.filter((s) => s.openedAt).sort((a, b) => b.openedAt! - a.openedAt!)[0]

  function placeScene(target: Sheet, index: number, scene: Scene, update: (patch: Partial<Sheet>) => void) {
    update({ cells: target.cells.map((c, i) => (i === index ? { ...c, code: scene.code, text: null } : c)) })
  }

  /** Dalla Libreria: la vignetta va nel primo riquadro vuoto dell'ultima scheda aperta. */
  function addToLastSheet(scene: Scene) {
    const target = lastOpened
    if (!target) {
      setToast('Apri prima una scheda: la vignetta va nel suo primo riquadro vuoto.')
      return
    }
    const index = target.cells.findIndex((c) => !c.code)
    if (index === -1) {
      setToast(`“${target.title || 'Scheda'}” è piena: svuota un riquadro per aggiungere altre vignette.`)
      return
    }
    const update = (patch: Partial<Sheet>) => setData((d) => store.updateSheet(d, target.id, patch))
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
      if (!editingId) return
      setData(store.moveSheet(d, editingId, folderId))
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

  /** Crea: nuova scheda in una cartella (anche nuova) o senza bambino, poi apre l'editor. */
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
      // Senza bambino: scheda generica, salvata sul server come le altre
      const created = { ...make(''), folderId: null, openedAt: now }
      setData((d) => store.upsertSheet(d, created))
      navigate({ name: 'scheda', id: created.id }, { replace: true })
      return
    }
    const { data: d, folderId } = resolveFolder(data, choice)
    const folder = d.folders.find((f) => f.id === folderId)!
    const created = { ...make(store.folderChildName(folder)), folderId, openedAt: now }
    setData(store.upsertSheet(d, created))
    navigate({ name: 'scheda', id: created.id }, { replace: true })
  }

  function deleteFolder(id: string) {
    setData((d) => store.deleteFolder(d, id))
    navigate({ name: 'bambini' }, { replace: true })
  }

  function markReminderDone(id: string) {
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

  /** Importa un file di backup nel centro: si aggiunge ai dati, senza doppioni (vedi importLocal.ts). */
  async function importBackup(file: File) {
    try {
      const { data: incoming, settings: incomingSettings } = store.parseBackup(await file.text())
      setImportSource({ kind: 'file', data: incoming, draft: null, settings: incomingSettings })
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
            localImport={localImportAvailable() ? () => setImportSource(localImportSource()) : undefined}
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
            genericCount={data.sheets.filter((s) => !s.folderId).length}
            onOpenGeneric={() => openFolder(GENERIC_FOLDER.id)}
            onOpenFolder={openFolder}
            onOpenTrash={() => navigate({ name: 'cestino' })}
            onCreateFolder={(name) => {
              const { data: d, folder } = store.addFolder(data, name)
              setData(d)
              openFolder(folder.id)
            }}
          />
        )
      case 'cartella': {
        if (route.id === GENERIC_FOLDER.id) {
          return (
            <FolderView
              key={GENERIC_FOLDER.id}
              folder={GENERIC_FOLDER}
              generic
              sheets={data.sheets.filter((s) => !s.folderId)}
              onBack={() => back({ name: 'bambini' })}
              onRename={() => undefined}
              onNotes={() => undefined}
              onDelete={() => undefined}
              onNewSheet={() => navigate({ name: 'crea' })}
              onOpenSheet={openSheet}
              onStatus={(id, status) => setData((d) => store.setStatus(d, id, status))}
              onDuplicate={(id) => setFolderAction({ mode: 'duplicate', sheetId: id })}
              onMove={(id) => setFolderAction({ mode: 'move', sheetId: id })}
              onDeleteSheet={(id) => setData((d) => store.deleteSheet(d, id))}
            />
          )
        }
        const folder = data.folders.find((f) => f.id === route.id)
        if (!folder) return <Missing text="Questa cartella non esiste più." onBack={() => navigate({ name: 'bambini' })} />
        return (
          <ChildView
            key={folder.id}
            folder={folder}
            sheets={data.sheets.filter((s) => s.folderId === folder.id)}
            tab={route.tab ?? 'materiali'}
            isOwner={isOwner}
            exportContext={{ settings, coloringKeys }}
            sheetActions={{
              onOpen: openSheet,
              onStatus: (id, status) => setData((d) => store.setStatus(d, id, status)),
              onDuplicate: (id) => setFolderAction({ mode: 'duplicate', sheetId: id }),
              onMove: (id) => setFolderAction({ mode: 'move', sheetId: id }),
              onDelete: (id) => setData((d) => store.deleteSheet(d, id)),
            }}
            // Le schede della cartella cambiano l'URL senza nuove voci: Indietro torna a Bambini
            onTab={(tab) => navigate({ name: 'cartella', id: folder.id, tab }, { replace: true })}
            onBack={() => back({ name: 'bambini' })}
            onRename={(name) => setData((d) => store.updateFolder(d, folder.id, { name }))}
            onNotes={(notes) => setData((d) => store.updateFolder(d, folder.id, { notes }))}
            onTrash={() => deleteFolder(folder.id)}
            onNewSheet={() => navigate({ name: 'crea', folderId: folder.id })}
            // Già eliminato sul server: si toglie dai dati dell'app (il cestino risponde 404, va bene)
            onDeleted={() => {
              deleteFolder(folder.id)
              setToast(`“${folder.name}” eliminato per sempre`)
            }}
          />
        )
      }
      case 'cestino':
        return (
          <TrashView
            isOwner={isOwner}
            onBack={() => back({ name: 'bambini' })}
            onRestored={(message) => {
              setToast(message)
              void server.reload()
            }}
          />
        )
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
              subtitle={lastOpened ? `Tocca una vignetta per aggiungerla a “${lastOpened.title || 'Scheda'}”.` : 'Apri una scheda: toccando una vignetta la aggiungi lì.'}
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
            canEditCenter={isOwner}
            localImport={localImportAvailable() ? () => setImportSource(localImportSource()) : undefined}
            onForgetLocal={localImportDone() && localDataPresent() ? forgetLocalData : undefined}
            settings={settings}
            onSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            lastBackup={lastBackup}
            folders={data.folders.length}
            sheets={data.sheets.length}
            onExport={exportBackup}
            onImport={importBackup}
            onOpenAudit={isOwner ? () => setAuditOpen(true) : undefined}
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
            sync={sync}
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

      {editing && sync.conflicts.has(editing.id) && (
        <Modal title="Scheda modificata altrove" size="sm">
          <div className="flex flex-col gap-4">
            <p className="leading-relaxed">
              Mentre lavoravi, questa scheda è stata salvata su un altro dispositivo o da un’altra persona. Quale versione vuoi
              tenere?
            </p>
            <div className="flex flex-col gap-2">
              <Button tone="primary" onClick={() => resolveConflict(editing.id, 'mine')}>
                Tieni la mia
              </Button>
              <Button onClick={() => resolveConflict(editing.id, 'theirs')}>Usa quella salvata</Button>
              <Button
                onClick={() => {
                  const copyId = newId()
                  resolveConflict(editing.id, 'copy', (mine) => ({
                    ...mine,
                    id: copyId,
                    title: store.copyTitle(mine.title, mine.childName),
                    cells: mine.cells.map((c) => ({ ...c, id: newId() })),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    openedAt: Date.now(),
                  }))
                  navigate({ name: 'scheda', id: copyId }, { replace: true })
                  setToast('La tua versione è salvata come copia')
                }}
              >
                Salva la mia come copia
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {route.name !== 'scheda' && [...sync.conflicts.keys()].some((id) => data.sheets.some((s) => s.id === id)) && (
        <div role="alert" className="fixed inset-x-0 top-0 z-[55] flex flex-wrap items-center justify-center gap-3 bg-butter px-4 py-2 text-sm font-bold">
          Una scheda è stata modificata altrove: aprila per scegliere quale versione tenere.
          <Button small tone="primary" onClick={() => openSheet([...sync.conflicts.keys()].find((id) => data.sheets.some((s) => s.id === id))!)}>
            Apri
          </Button>
        </div>
      )}

      {route.name !== 'scheda' && (sync.state === 'waiting' || sync.state === 'error') && (
        <div role="status" className="fixed inset-x-0 top-0 z-[54] bg-peach-soft px-4 py-2 text-center text-sm font-bold text-[#a2472f]">
          {sync.state === 'waiting' ? 'Non salvato, riprovo… Le modifiche restano in questo browser.' : `Non salvato: ${sync.message}`}
        </div>
      )}

      {importSource && (
        <ImportDialog
          source={importSource}
          isOwner={isOwner}
          centerSettingsEmpty={!orgSettings(session)}
          onDone={(result) => {
            setImportSource(null)
            if (importSource.kind === 'browser') markLocalImported()
            setToast(`Importati ${result.children} bambini e ${result.materials} schede`)
            void server.reload()
            if (result.settings) setSettings(result.settings)
          }}
          onClose={() => setImportSource(null)}
        />
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
            folderAction.mode === 'save' ? undefined : (data.sheets.find((s) => s.id === folderAction.sheetId)?.folderId ?? undefined)
          }
          onConfirm={(choice) => {
            if (!('draft' in choice)) confirmFolderAction(folderAction, choice)
          }}
          onClose={() => setFolderAction(null)}
        />
      )}

      {auditOpen && <AuditLogDialog folders={data.folders} onClose={() => setAuditOpen(false)} />}

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

/** Impostazioni del centro salvate sul server (null se il centro non ne ha ancora) */
function orgSettings(session: Session): AppSettings | null {
  const raw = session.account?.organization?.settings
  return raw && Object.keys(raw).length > 0 ? normalizeSettings(raw) : null
}

/** Dopo l'importazione: si possono togliere cartelle, schede e bozza rimaste in questo browser */
function forgetLocalData() {
  if (!confirm('Eliminare da questo browser le cartelle e le schede di prima? Sono già importate nel centro.')) return
  store.clearLocalData()
  location.reload()
}
