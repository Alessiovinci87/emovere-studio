// Importazione nel centro delle cartelle e delle schede della versione precedente (punto 5):
// dal browser (localStorage) o da un file di backup. Si aggiunge ai dati del centro, mai li sostituisce.
// Ogni cartella e scheda porta il suo id originale (legacyId): importare due volte non crea doppioni.
import { accountApi } from './account'
import { materialsApi } from './materials'
import { childrenApi, sheetToServer } from './serverData'
import { loadSettings, type AppSettings } from './settings'
import { normalizeSheet } from './sheet'
import * as store from './store'
import type { Folder, Sheet, StoreData } from '../types'

const IMPORTED_KEY = 'emovere.imported.v1'

export interface ImportSource {
  kind: 'browser' | 'file'
  data: StoreData
  /** Bozza della versione precedente (solo dal browser), se contiene qualcosa */
  draft: Sheet | null
  settings: AppSettings | null
}

/** Cosa decide l'utente per ogni cartella */
export interface FolderChoice {
  folder: Folder
  /** Pseudonimo con cui il bambino compare nell'app */
  pseudonym: string
  /** Il nome della cartella era il nome vero del bambino */
  realName: boolean
  /** Nome stampato sulle schede (cifrato sul server); vuoto = nessun nome */
  materialName: string
}

export interface ImportResult {
  children: number
  materials: number
  /** Impostazioni importate nel centro (solo titolare, se il centro non ne aveva) */
  settings: AppSettings | null
}

function hasWork(sheet: Sheet): boolean {
  return sheet.cells.some((c) => c.code) || sheet.notes.trim() !== ''
}

export function localImportSource(): ImportSource {
  const draft = store.loadDraft()
  let settings: AppSettings | null = null
  try {
    settings = localStorage.getItem('emovere.settings.v1') ? loadSettings() : null
  } catch {
    settings = null
  }
  return { kind: 'browser', data: store.loadData(), draft: hasWork(draft) ? draft : null, settings }
}

/** In questo browser ci sono cartelle, schede o una bozza della versione precedente */
export function localDataPresent(): boolean {
  const source = localImportSource()
  return source.data.folders.length > 0 || source.data.sheets.length > 0 || source.draft !== null
}

/** Ci sono cartelle o schede della versione precedente non ancora importate */
export function localImportAvailable(): boolean {
  return !localImportDone() && localDataPresent()
}

export function localImportDone(): boolean {
  try {
    return localStorage.getItem(IMPORTED_KEY) !== null
  } catch {
    return false
  }
}

export function markLocalImported() {
  try {
    localStorage.setItem(IMPORTED_KEY, new Date().toISOString())
  } catch {
    // niente da fare: al massimo l'invito a importare ricompare (senza creare doppioni)
  }
}

/** Il nome più usato nelle schede della cartella: è quello che finiva stampato */
export function usualChildName(folder: Folder, sheets: Sheet[]): string {
  const counts = new Map<string, number>()
  for (const s of sheets) {
    const name = s.folderId === folder.id ? s.childName.trim() : ''
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

export function initialChoices(source: ImportSource): FolderChoice[] {
  return source.data.folders.map((folder) => ({
    folder,
    pseudonym: folder.name,
    realName: false,
    materialName: usualChildName(folder, source.data.sheets),
  }))
}

/** Problema da correggere prima di importare (null = si può partire) */
export function choiceProblem(choice: FolderChoice): string | null {
  const pseudonym = choice.pseudonym.trim()
  if (!pseudonym) return 'Scrivi lo pseudonimo.'
  if (choice.realName && pseudonym.toLowerCase() === choice.folder.name.trim().toLowerCase()) {
    return 'Il nome vero non può essere lo pseudonimo: scegline un altro.'
  }
  return null
}

export async function runImport(
  source: ImportSource,
  choices: FolderChoice[],
  options: { isOwner: boolean; centerSettingsEmpty: boolean },
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const sheets = source.data.sheets.map(normalizeSheet)
  const extra = source.draft ? [{ ...normalizeSheet(source.draft), folderId: null }] : []
  const total = choices.length + sheets.length + extra.length
  let done = 0
  const step = () => onProgress(++done, total)

  // Cartelle → bambini (id del server per ogni cartella)
  const childIds = new Map<string, string>()
  for (const choice of choices) {
    const { child } = await childrenApi.create({
      pseudonym: choice.pseudonym.trim(),
      notes: choice.folder.notes,
      materialName: choice.materialName.trim() || undefined,
      // Il nome vero lo conserva solo il titolare (campo separato e cifrato)
      realName: choice.realName && options.isOwner ? choice.folder.name.trim() : undefined,
      legacyId: choice.folder.id,
    })
    childIds.set(choice.folder.id, child.id)
    step()
  }

  // Schede → materiali (il nome del bambino non entra nel contenuto, vedi sheetToServer)
  let materials = 0
  for (const sheet of [...sheets, ...extra]) {
    const childId = sheet.folderId ? (childIds.get(sheet.folderId) ?? null) : null
    const { title, content } = sheetToServer(sheet)
    await materialsApi.create({
      childId,
      kind: 'scheda',
      title,
      content,
      status: sheet.status,
      notes: sheet.notes,
      reminder: sheet.reminder,
      legacyId: sheet.id,
    })
    materials++
    step()
  }

  // Impostazioni (logo, nome del centro): solo il titolare e solo se il centro non ne ha ancora
  let settings: AppSettings | null = null
  if (source.settings && options.isOwner && options.centerSettingsEmpty) {
    await accountApi.saveSettings(source.settings)
    settings = source.settings
  }
  return { children: childIds.size, materials, settings }
}
