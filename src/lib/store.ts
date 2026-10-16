import type { Folder, Sheet, SheetStatus, StoreData } from '../types'
import { normalizeSettings, type AppSettings } from './settings'
import { createSheet, newId, normalizeSheet, retitleForName } from './sheet'

// Operazioni pure su cartelle e schede. I dati stanno sul server (sync.ts); loadData/loadDraft leggono
// quelli rimasti nel browser dalla versione precedente, solo per importarli (importLocal.ts).
const DATA_KEY = 'emovere.data.v1'
const DRAFT_KEY = 'emovere.draft.v1'

export function loadData(): StoreData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) return normalizeData(JSON.parse(raw))
  } catch {
    // dati illeggibili: si riparte vuoti (il backup resta il paracadute)
  }
  return { folders: [], sheets: [] }
}

export function saveData(data: StoreData): boolean {
  return write(DATA_KEY, data)
}

/** Bozza: la scheda in lavorazione non ancora salvata in una cartella. */
export function loadDraft(): Sheet {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return { ...normalizeSheet(JSON.parse(raw)), folderId: null }
  } catch {
    // bozza illeggibile: se ne crea una nuova
  }
  return createSheet()
}

export function saveDraft(sheet: Sheet): boolean {
  return write(DRAFT_KEY, sheet)
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function normalizeData(raw: Partial<StoreData>): StoreData {
  const folders = (raw.folders ?? []).map((f): Folder => ({ ...f, notes: f.notes ?? '' }))
  const folderIds = new Set(folders.map((f) => f.id))
  const sheets = (raw.sheets ?? []).map(normalizeSheet).filter((s) => s.folderId && folderIds.has(s.folderId))
  return { folders, sheets }
}

// ——— Operazioni: funzioni pure StoreData → StoreData ———

export function addFolder(data: StoreData, name: string): { data: StoreData; folder: Folder } {
  const now = Date.now()
  const folder: Folder = { id: newId(), name: name.trim(), notes: '', createdAt: now, updatedAt: now }
  return { data: { ...data, folders: [...data.folders, folder] }, folder }
}

export function updateFolder(data: StoreData, id: string, patch: Partial<Folder>): StoreData {
  return {
    ...data,
    folders: data.folders.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: Date.now() } : f)),
  }
}

/** Elimina la cartella e tutte le sue schede. */
export function deleteFolder(data: StoreData, id: string): StoreData {
  return { folders: data.folders.filter((f) => f.id !== id), sheets: data.sheets.filter((s) => s.folderId !== id) }
}

export function upsertSheet(data: StoreData, sheet: Sheet): StoreData {
  const exists = data.sheets.some((s) => s.id === sheet.id)
  return {
    ...data,
    sheets: exists ? data.sheets.map((s) => (s.id === sheet.id ? sheet : s)) : [...data.sheets, sheet],
  }
}

export function updateSheet(data: StoreData, id: string, patch: Partial<Sheet>): StoreData {
  return {
    ...data,
    sheets: data.sheets.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)),
  }
}

export function deleteSheet(data: StoreData, id: string): StoreData {
  return { ...data, sheets: data.sheets.filter((s) => s.id !== id) }
}

export function setStatus(data: StoreData, id: string, status: SheetStatus): StoreData {
  return updateSheet(data, id, { status })
}

/**
 * Copia di una scheda, anche in un'altra cartella. Riparte da "Da fare", senza promemoria.
 * Se la cartella cambia e il nome del bambino era quello della cartella, si propone il nuovo nome.
 */
export function duplicateSheet(data: StoreData, id: string, folderId: string): { data: StoreData; sheet: Sheet } {
  const source = data.sheets.find((s) => s.id === id)!
  const now = Date.now()
  let copy: Sheet = {
    ...structuredClone(source),
    id: newId(),
    folderId,
    status: 'da-fare',
    reminder: null,
    createdAt: now,
    updatedAt: now,
  }
  copy.cells = copy.cells.map((c) => ({ ...c, id: newId() }))
  copy = withFolderName(data, copy, source.folderId)
  if (folderId === source.folderId) copy.title = copyTitle(copy.title, copy.childName)
  return { data: upsertSheet(data, copy), sheet: copy }
}

export function moveSheet(data: StoreData, id: string, folderId: string): StoreData {
  const sheet = data.sheets.find((s) => s.id === id)!
  const moved = withFolderName(data, { ...sheet, folderId, updatedAt: Date.now() }, sheet.folderId)
  return upsertSheet(data, moved)
}

/**
 * Nome del bambino proposto dalla cartella: se la scheda non ha un nome,
 * o aveva quello della cartella di provenienza, prende quello della nuova cartella.
 */
export function withFolderName(data: StoreData, sheet: Sheet, previousFolderId: string | null): Sheet {
  const folder = data.folders.find((f) => f.id === sheet.folderId)
  if (!folder) return sheet
  const previous = data.folders.find((f) => f.id === previousFolderId)
  const current = sheet.childName.trim()
  if (current && previous && current !== folderChildName(previous)) return sheet
  const name = folderChildName(folder)
  return { ...sheet, childName: name, title: retitleForName(sheet.title, current, name) }
}

/**
 * Titolo di una copia: "(copia)" va prima del nome del bambino ("La mattina (copia) di Sofia"),
 * così il nome resta in fondo e non si salva nel titolo (vedi sheetToServer).
 */
export function copyTitle(title: string, childName: string): string {
  const suffix = ` di ${childName.trim()}`
  return childName.trim() && title.endsWith(suffix) ? `${title.slice(0, -suffix.length)} (copia)${suffix}` : `${title} (copia)`
}

/** Nome da mettere nelle schede di una cartella: sul server il "nome sulle schede" del bambino, altrimenti il nome della cartella */
export function folderChildName(folder: Folder): string {
  return folder.materialName !== undefined ? folder.materialName : folder.name
}

/**
 * Nome sulle schede cambiato da una scheda: vale per il bambino e quindi per tutte le sue schede
 * (titoli compresi, se contenevano il nome).
 */
export function setChildName(data: StoreData, folderId: string, sheetId: string, patch: Partial<Sheet>): StoreData {
  const name = (patch.childName ?? '').trim()
  const now = Date.now()
  return {
    folders: data.folders.map((f) => (f.id === folderId ? { ...f, materialName: name, updatedAt: now } : f)),
    sheets: data.sheets.map((s) => {
      if (s.id === sheetId) return { ...s, ...patch, updatedAt: now }
      if (s.folderId !== folderId) return s
      return { ...s, childName: name, title: retitleForName(s.title, s.childName.trim(), name), updatedAt: now }
    }),
  }
}

/** Dopo l'importazione nel centro: si tolgono dal browser cartelle, schede e bozza della versione precedente */
export function clearLocalData() {
  try {
    localStorage.removeItem(DATA_KEY)
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // niente da fare
  }
}

export function countByStatus(sheets: Sheet[]): Record<SheetStatus, number> {
  const counts: Record<SheetStatus, number> = { 'da-fare': 0, 'in-lavorazione': 0, pronta: 0, consegnata: 0 }
  for (const s of sheets) counts[s.status]++
  return counts
}

// ——— Backup ———

const LAST_BACKUP_KEY = 'emovere.lastBackup.v1'
const BACKUP_INTERVAL_DAYS = 7

/** Data dell'ultimo "Esporta tutto" (ISO), null se mai fatto. */
export function loadLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

export function saveLastBackup(iso: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso)
  } catch {
    // non critico: al massimo il promemoria del backup ricompare
  }
}

/** Serve un backup se ci sono schede salvate e l'ultimo è più vecchio di 7 giorni (o non c'è). */
export function isBackupDue(data: StoreData, lastBackup: string | null, now = Date.now()): boolean {
  if (data.sheets.length === 0) return false
  if (!lastBackup) return true
  return now - new Date(lastBackup).getTime() > BACKUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000
}

const BACKUP_APP = 'emovere-studio'

export interface Backup extends StoreData {
  app: typeof BACKUP_APP
  version: 1
  exportedAt: string
  /** Impostazioni dell'app, logo compreso (assenti nei backup meno recenti) */
  settings?: AppSettings
}

export function makeBackup(data: StoreData, settings: AppSettings): Backup {
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), ...data, settings }
}

/** Legge un file di backup; lancia un errore con un messaggio leggibile se non è valido. */
export function parseBackup(text: string): { data: StoreData; exportedAt: string; settings: AppSettings | null } {
  let json: Partial<Backup>
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('Il file non è un backup valido (non è JSON).')
  }
  if (json.app !== BACKUP_APP || !Array.isArray(json.folders) || !Array.isArray(json.sheets)) {
    throw new Error('Il file non sembra un backup di Emovere Studio.')
  }
  return {
    data: normalizeData(json),
    exportedAt: json.exportedAt ?? '',
    settings: json.settings ? normalizeSettings(json.settings) : null,
  }
}
