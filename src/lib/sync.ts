// Sincronizzazione dei dati dell'app (cartelle e schede) con il server.
//
// L'app continua a lavorare su StoreData con le operazioni pure di store.ts. Questo motore confronta i dati
// con l'ultima versione salvata sul server e manda solo le differenze:
// - cartella nuova/modificata/eliminata → POST/PATCH /api/children (eliminata = cestino)
// - scheda nuova/modificata/eliminata → POST/PATCH /api/materials (eliminata = cestino); titolo e contenuto
//   con la revisione di partenza, stato/appunti/promemoria/apertura/spostamento senza
// Senza rete: "Non salvato, riprovo…", nuovo tentativo ogni 5 s e al ritorno della rete; le modifiche non salvate
// restano nel browser (emovere.sync.v1:{centro}) e alla riapertura si rimettono sopra i dati del server.
// Revisione cambiata altrove: la scheda va in conflitto e si sceglie (vedi resolve).
import { apiRequest, send, type ApiResult } from './account'
import type { ServerMaterial } from './materials'
import { materialToSheet, sheetToServer } from './serverData'
import type { Folder, Sheet, StoreData } from '../types'

const DEBOUNCE_MS = 800
const RETRY_MS = 5000

interface FolderForm {
  pseudonym: string
  notes: string
  materialName: string
}

interface SheetForm {
  childId: string | null
  title: string
  /** JSON del contenuto (confronto semplice) */
  content: string
  status: Sheet['status']
  notes: string
  reminder: string
  openedAt: number
}

function folderForm(f: Folder): FolderForm {
  return { pseudonym: f.name, notes: f.notes, materialName: f.materialName ?? '' }
}

function sheetForm(s: Sheet): SheetForm {
  const { title, content } = sheetToServer(s)
  return {
    childId: s.folderId,
    title,
    content: JSON.stringify(content),
    status: s.status,
    notes: s.notes,
    reminder: JSON.stringify(s.reminder),
    openedAt: s.openedAt ?? 0,
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export type SyncState = 'saved' | 'saving' | 'waiting' | 'error'

export interface SyncStatus {
  state: SyncState
  message: string | null
  /** Schede modificate altrove: id → versione sul server */
  conflicts: ReadonlyMap<string, ServerMaterial>
}

type Op =
  | { kind: 'folder-create'; folder: Folder }
  | { kind: 'folder-patch'; folder: Folder; before: FolderForm }
  | { kind: 'folder-trash'; id: string }
  | { kind: 'sheet-create'; sheet: Sheet }
  | { kind: 'sheet-patch'; sheet: Sheet; before: SheetForm }
  | { kind: 'sheet-trash'; id: string }

interface Stored {
  desired: StoreData
  synced: { folders: [string, FolderForm][]; sheets: [string, SheetForm][] }
  revisions: [string, number][]
}

type Outcome = 'ok' | 'stop'

export class ServerSync {
  private synced = { folders: new Map<string, FolderForm>(), sheets: new Map<string, SheetForm>() }
  private revisions: Map<string, number>
  private desired: StoreData
  private conflicts = new Map<string, ServerMaterial>()
  /** Entità rifiutate dal server (es. dati non validi): non si riprova finché non cambiano */
  private failed = new Map<string, string>()
  private running = false
  private again = false
  private waiting = false
  private message: string | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly onOnline = () => this.flushSoon(0)

  constructor(
    private readonly storageKey: string,
    server: StoreData,
    revisions: Map<string, number>,
    desired: StoreData,
    private readonly onStatus: (status: SyncStatus) => void,
  ) {
    for (const f of server.folders) this.synced.folders.set(f.id, folderForm(f))
    for (const s of server.sheets) this.synced.sheets.set(s.id, sheetForm(s))
    this.revisions = new Map(revisions)
    this.desired = desired
    window.addEventListener('online', this.onOnline)
  }

  /**
   * Dati del server + modifiche rimaste in attesa nel browser (sessione precedente, magari offline).
   * Per le schede modificate si riparte dalla revisione di allora: se nel frattempo è cambiata, conflitto.
   */
  static restore(storageKey: string, server: StoreData, revisions: Map<string, number>): { desired: StoreData; revisions: Map<string, number> } {
    let stored: Stored | null = null
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Stored | null
    } catch {
      stored = null
    }
    if (!stored) return { desired: server, revisions }
    const syncedFolders = new Map(stored.synced.folders)
    const syncedSheets = new Map(stored.synced.sheets)
    const storedRevisions = new Map(stored.revisions)
    const folders = new Map(server.folders.map((f) => [f.id, f]))
    const sheets = new Map(server.sheets.map((s) => [s.id, s]))
    const nextRevisions = new Map(revisions)

    for (const f of stored.desired.folders) {
      const before = syncedFolders.get(f.id)
      if (!before || !same(before, folderForm(f))) folders.set(f.id, f)
    }
    for (const id of syncedFolders.keys()) if (!stored.desired.folders.some((f) => f.id === id)) folders.delete(id)
    for (const s of stored.desired.sheets) {
      const before = syncedSheets.get(s.id)
      if (!before || !same(before, sheetForm(s))) {
        sheets.set(s.id, s)
        const base = storedRevisions.get(s.id)
        if (base !== undefined && nextRevisions.has(s.id)) nextRevisions.set(s.id, base)
      }
    }
    for (const id of syncedSheets.keys()) if (!stored.desired.sheets.some((s) => s.id === id)) sheets.delete(id)
    return { desired: { folders: [...folders.values()], sheets: [...sheets.values()] }, revisions: nextRevisions }
  }

  dispose() {
    clearTimeout(this.timer)
    window.removeEventListener('online', this.onOnline)
  }

  update(data: StoreData) {
    this.desired = data
    this.persist()
    this.flushSoon(DEBOUNCE_MS)
  }

  flushSoon(delay = 0) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), delay)
  }

  /** Modifiche non ancora salvate (per avvisare prima di chiudere) */
  hasPending(): boolean {
    return this.plan().length > 0 || this.conflicts.size > 0
  }

  /** Conflitto: "mine" = salva la versione di questo dispositivo sopra quella del server. */
  keepMine(id: string) {
    const current = this.conflicts.get(id)
    if (!current) return
    this.conflicts.delete(id)
    this.revisions.set(id, current.revision)
    this.synced.sheets.set(id, sheetForm(materialToSheet(current, this.folder(current.childId))))
    this.flushSoon(0)
  }

  /** Conflitto: si prende la versione del server (restituita, da mettere nei dati dell'app). */
  takeTheirs(id: string): Sheet | null {
    const current = this.conflicts.get(id)
    if (!current) return null
    this.conflicts.delete(id)
    const sheet = materialToSheet(current, this.folder(current.childId))
    this.revisions.set(id, current.revision)
    this.synced.sheets.set(id, sheetForm(sheet))
    this.emit()
    return sheet
  }

  private folder(id: string | null): Folder | undefined {
    return id ? this.desired.folders.find((f) => f.id === id) : undefined
  }

  private plan(): Op[] {
    const ops: Op[] = []
    const desiredFolders = new Set(this.desired.folders.map((f) => f.id))
    const removedFolders = new Set([...this.synced.folders.keys()].filter((id) => !desiredFolders.has(id)))
    const skip = (id: string, form: unknown) => this.failed.get(id) === JSON.stringify(form)

    for (const f of this.desired.folders) {
      const form = folderForm(f)
      const before = this.synced.folders.get(f.id)
      if (skip(f.id, form)) continue
      if (!before) ops.push({ kind: 'folder-create', folder: f })
      else if (!same(before, form)) ops.push({ kind: 'folder-patch', folder: f, before })
    }
    const desiredSheets = new Set(this.desired.sheets.map((s) => s.id))
    for (const s of this.desired.sheets) {
      if (this.conflicts.has(s.id)) continue
      const form = sheetForm(s)
      const before = this.synced.sheets.get(s.id)
      if (skip(s.id, form)) continue
      if (!before) ops.push({ kind: 'sheet-create', sheet: s })
      else if (!same(before, form)) ops.push({ kind: 'sheet-patch', sheet: s, before })
    }
    for (const [id, before] of this.synced.sheets) {
      if (desiredSheets.has(id)) continue
      // Le schede di una cartella eliminata vanno nel cestino con il bambino: niente da fare
      if (before.childId && removedFolders.has(before.childId)) continue
      ops.push({ kind: 'sheet-trash', id })
    }
    for (const id of removedFolders) ops.push({ kind: 'folder-trash', id })
    return ops
  }

  private async flush() {
    if (this.running) {
      this.again = true
      return
    }
    const ops = this.plan()
    if (ops.length === 0) {
      this.waiting = false
      this.persist()
      this.emit()
      return
    }
    this.running = true
    this.again = false
    this.emit()
    for (const op of ops) {
      if ((await this.run(op)) === 'stop') {
        this.waiting = true
        break
      }
      this.waiting = false
    }
    this.running = false
    this.persist()
    this.emit()
    if (this.waiting) this.flushSoon(RETRY_MS)
    else if (this.again) this.flushSoon(0)
  }

  /** Esito comune: rete o server giù → si riprova; altri errori → si segna e si va avanti. */
  private handleFailure(result: ApiResult, id: string, form: unknown): Outcome {
    const message = (result.body.error as string | undefined) ?? 'Qualcosa non ha funzionato.'
    if (result.network || result.status === 0 || result.status >= 500 || result.status === 429 || result.status === 401) {
      this.message = message
      return 'stop'
    }
    this.failed.set(id, JSON.stringify(form))
    this.message = message
    return 'ok'
  }

  private async run(op: Op): Promise<Outcome> {
    switch (op.kind) {
      case 'folder-create': {
        const form = folderForm(op.folder)
        const result = await apiRequest('/api/children', send('POST', { id: op.folder.id, ...form, materialName: form.materialName || null }))
        if (result.ok || result.status === 409) {
          // 409 = già creato (es. risposta persa): la prossima volta si allineano i campi con un PATCH
          this.synced.folders.set(op.folder.id, result.ok ? form : { pseudonym: '', notes: '', materialName: '\u0000' })
          this.message = null
          return 'ok'
        }
        return this.handleFailure(result, op.folder.id, form)
      }
      case 'folder-patch': {
        const form = folderForm(op.folder)
        const body: Record<string, unknown> = { id: op.folder.id }
        if (form.pseudonym !== op.before.pseudonym) body.pseudonym = form.pseudonym
        if (form.notes !== op.before.notes) body.notes = form.notes
        if (form.materialName !== op.before.materialName) body.materialName = form.materialName
        const result = await apiRequest('/api/children', send('PATCH', body))
        if (result.ok) {
          this.synced.folders.set(op.folder.id, form)
          this.message = null
          return 'ok'
        }
        return this.handleFailure(result, op.folder.id, form)
      }
      case 'folder-trash': {
        const result = await apiRequest('/api/children', send('PATCH', { id: op.id, trashed: true }))
        if (result.ok || result.status === 404) {
          this.synced.folders.delete(op.id)
          for (const [id, s] of this.synced.sheets) if (s.childId === op.id) this.synced.sheets.delete(id)
          return 'ok'
        }
        return this.handleFailure(result, op.id, 'trash')
      }
      case 'sheet-create': {
        const form = sheetForm(op.sheet)
        const { title, content } = sheetToServer(op.sheet)
        const result = await apiRequest(
          '/api/materials',
          send('POST', {
            id: op.sheet.id,
            childId: op.sheet.folderId,
            kind: 'scheda',
            title,
            content,
            status: op.sheet.status,
            notes: op.sheet.notes,
            reminder: op.sheet.reminder,
          }),
        )
        if (result.ok) {
          const material = result.body.material as ServerMaterial
          this.revisions.set(op.sheet.id, material.revision)
          // L'apertura non si manda alla creazione: la segna il prossimo PATCH
          this.synced.sheets.set(op.sheet.id, { ...form, openedAt: 0 })
          this.message = null
          return 'ok'
        }
        if (result.status === 409) {
          // Già creata (risposta persa): si legge la versione del server e si confronta da lì
          const existing = await apiRequest(`/api/materials?id=${encodeURIComponent(op.sheet.id)}`)
          if (existing.ok) {
            const material = existing.body.material as ServerMaterial
            this.revisions.set(op.sheet.id, material.revision)
            this.synced.sheets.set(op.sheet.id, sheetForm(materialToSheet(material, this.folder(material.childId))))
            return 'ok'
          }
          return this.handleFailure(existing, op.sheet.id, form)
        }
        return this.handleFailure(result, op.sheet.id, form)
      }
      case 'sheet-patch': {
        const form = sheetForm(op.sheet)
        const body: Record<string, unknown> = { id: op.sheet.id }
        if (form.title !== op.before.title || form.content !== op.before.content) {
          const { title, content } = sheetToServer(op.sheet)
          Object.assign(body, { baseRevision: this.revisions.get(op.sheet.id) ?? 1, title, content })
        }
        if (form.status !== op.before.status) body.status = form.status
        if (form.notes !== op.before.notes) body.notes = form.notes
        if (form.reminder !== op.before.reminder) body.reminder = op.sheet.reminder
        if (form.childId !== op.before.childId) body.childId = form.childId
        if (form.openedAt > op.before.openedAt) body.opened = true
        const result = await apiRequest('/api/materials', send('PATCH', body))
        if (result.ok) {
          const material = result.body.material as ServerMaterial
          this.revisions.set(op.sheet.id, material.revision)
          this.synced.sheets.set(op.sheet.id, form)
          this.message = null
          return 'ok'
        }
        if (result.status === 409 && result.body.conflict) {
          this.conflicts.set(op.sheet.id, result.body.current as ServerMaterial)
          return 'ok'
        }
        if (result.status === 404) {
          // Eliminata altrove (es. cestino da un altro dispositivo): la si ricrea con un nuovo invio
          this.synced.sheets.delete(op.sheet.id)
          this.failed.set(op.sheet.id, JSON.stringify(form))
          this.message = 'Una scheda è stata eliminata da un altro dispositivo: le ultime modifiche non sono salvate.'
          return 'ok'
        }
        return this.handleFailure(result, op.sheet.id, form)
      }
      case 'sheet-trash': {
        const result = await apiRequest('/api/materials', send('PATCH', { id: op.id, trashed: true }))
        if (result.ok || result.status === 404) {
          this.synced.sheets.delete(op.id)
          return 'ok'
        }
        return this.handleFailure(result, op.id, 'trash')
      }
    }
  }

  private persist() {
    try {
      if (this.plan().length === 0 && this.conflicts.size === 0) {
        localStorage.removeItem(this.storageKey)
        return
      }
      const stored: Stored = {
        desired: this.desired,
        synced: { folders: [...this.synced.folders], sheets: [...this.synced.sheets] },
        revisions: [...this.revisions],
      }
      localStorage.setItem(this.storageKey, JSON.stringify(stored))
    } catch {
      // spazio esaurito: le modifiche restano solo in memoria finché non si salvano
    }
  }

  private emit() {
    const pending = this.plan().length > 0
    const state: SyncState = this.waiting
      ? 'waiting'
      : this.running || pending
        ? 'saving'
        : this.message
          ? 'error'
          : 'saved'
    this.onStatus({ state, message: this.message, conflicts: new Map(this.conflicts) })
  }
}
