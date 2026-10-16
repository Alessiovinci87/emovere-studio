// Dati dell'app ↔ dati del server.
// - Cartella ↔ bambino: nome = pseudonimo, appunti cifrati, "nome sulle schede" = children.material_name (cifrato)
// - Scheda ↔ materiale di tipo "scheda": il contenuto è lo Sheet senza i campi che hanno una colonna propria;
//   il nome del bambino non si salva mai nel materiale: il titolo si salva senza " di {nome}" e con
//   `nameInTitle` il nome si rimette al caricamento (dal "nome sulle schede" del bambino).
import { call, send } from './account'
import { materialsApi, type ServerMaterial } from './materials'
import { normalizeSheet } from './sheet'
import type { Folder, Reminder, Sheet, StoreData } from '../types'

export interface ServerChild {
  id: string
  code: string
  pseudonym: string
  materialName: string | null
  notes: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : undefined)

export function childToFolder(child: ServerChild): Folder {
  return {
    id: child.id,
    name: child.pseudonym,
    notes: child.notes ?? '',
    materialName: child.materialName ?? '',
    code: child.code,
    createdAt: ms(child.createdAt)!,
    updatedAt: ms(child.updatedAt)!,
  }
}

/** Campi dello Sheet che non vanno nel contenuto del materiale */
const OWN = ['id', 'folderId', 'childName', 'notes', 'status', 'reminder', 'createdAt', 'updatedAt', 'openedAt', 'title'] as const

/** Titolo e contenuto come si salvano sul server */
export function sheetToServer(sheet: Sheet): { title: string; content: Record<string, unknown> } {
  const name = sheet.childName.trim()
  const suffix = ` di ${name}`
  const nameInTitle = name !== '' && sheet.title.endsWith(suffix)
  const content: Record<string, unknown> = { ...sheet }
  for (const key of OWN) delete content[key]
  content.nameInTitle = nameInTitle
  return { title: nameInTitle ? sheet.title.slice(0, -suffix.length) : sheet.title, content }
}

export function materialToSheet(material: ServerMaterial, folder: Folder | undefined): Sheet {
  const content = material.content as Partial<Sheet> & { nameInTitle?: boolean }
  const childName = folder?.materialName ?? ''
  const title = content.nameInTitle && childName ? `${material.title} di ${childName}` : material.title
  const { nameInTitle: _ignored, ...rest } = content
  void _ignored
  return normalizeSheet({
    ...rest,
    id: material.id,
    title,
    childName,
    folderId: material.childId,
    status: material.status,
    notes: material.notes ?? '',
    reminder: material.reminder ? ({ ...material.reminder } as Reminder) : null,
    createdAt: ms(material.createdAt)!,
    updatedAt: ms(material.updatedAt)!,
    openedAt: ms(material.openedAt),
  })
}

export const childrenApi = {
  list: async () => (await call<{ children: ServerChild[] }>('/api/children')).children,
  create: async (body: { id?: string; pseudonym: string; notes?: string; materialName?: string; realName?: string; legacyId?: string }) =>
    call<{ child: ServerChild; existing?: boolean }>('/api/children', send('POST', body)),
}

/** Tutti i dati in uso del centro: bambini (non nel cestino) e le loro schede, più le schede generiche. */
export async function loadServerData(): Promise<{ data: StoreData; revisions: Map<string, number> }> {
  const [children, materials] = await Promise.all([childrenApi.list(), materialsApi.list()])
  const folders = children.map(childToFolder)
  const byId = new Map(folders.map((f) => [f.id, f]))
  const revisions = new Map<string, number>()
  const sheets = materials
    .filter((m) => m.kind === 'scheda')
    .map((m) => {
      revisions.set(m.id, m.revision)
      return materialToSheet(m, m.childId ? byId.get(m.childId) : undefined)
    })
  return { data: { folders, sheets }, revisions }
}
