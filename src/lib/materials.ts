// Materiali sul server (/api/materials): tipi e chiamate. Il salvataggio automatico è in useAutosave.ts.
import { apiRequest, call, send, type ApiResult } from './account'

export type MaterialKind = 'scheda' | 'storia_sociale' | 'scenario' | 'sequenza' | 'guida' | 'caa' | 'rinforzo' | 'attivita'

export interface ServerMaterial {
  id: string
  childId: string | null
  isGeneric: boolean
  kind: MaterialKind
  title: string
  status: 'da-fare' | 'in-lavorazione' | 'pronta' | 'consegnata'
  content: Record<string, unknown>
  revision: number
  currentVersion: number
  /** Solo nel dettaglio (GET ?id=) */
  notes?: string
  reminder: { date: string; kind: string; done: boolean } | null
  openedAt: string | null
  goalIds: string[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Esito di un salvataggio con controllo di revisione */
export type SaveResult =
  | { kind: 'saved'; material: ServerMaterial }
  | { kind: 'conflict'; current: ServerMaterial }
  /** Rete assente o server momentaneamente non disponibile: si riprova */
  | { kind: 'retry'; message: string }
  /** Errore definitivo (permessi, sessione, dati non validi): non si riprova da soli */
  | { kind: 'error'; message: string }

export function saveResult(result: ApiResult): SaveResult {
  if (result.ok) return { kind: 'saved', material: result.body.material as ServerMaterial }
  if (result.status === 409 && result.body.conflict) return { kind: 'conflict', current: result.body.current as ServerMaterial }
  const message = (result.body.error as string | undefined) ?? 'Qualcosa non ha funzionato.'
  if (result.network || result.status === 0 || result.status >= 500 || result.status === 429) return { kind: 'retry', message }
  return { kind: 'error', message }
}

export const materialsApi = {
  list: async (filter: { child?: string; generic?: boolean; trash?: boolean } = {}) => {
    const query = filter.child
      ? `?child=${encodeURIComponent(filter.child)}`
      : filter.generic
        ? '?generic=1'
        : filter.trash
          ? '?trash=1'
          : ''
    return (await call<{ materials: ServerMaterial[] }>(`/api/materials${query}`)).materials
  },
  get: (id: string) =>
    call<{ material: ServerMaterial; versions: { versionNo: number; reason: string; createdAt: string }[] }>(
      `/api/materials?id=${encodeURIComponent(id)}`,
    ),
  create: async (body: {
    childId?: string | null
    kind: MaterialKind
    title: string
    content: Record<string, unknown>
    status?: ServerMaterial['status']
    notes?: string
    legacyId?: string
  }) => (await call<{ material: ServerMaterial; existing?: boolean }>('/api/materials', send('POST', body))),
  /** Titolo e contenuto con la revisione di partenza: può rispondere con un conflitto */
  save: async (id: string, baseRevision: number, patch: { title?: string; content?: Record<string, unknown> }) =>
    saveResult(await apiRequest('/api/materials', send('PATCH', { id, baseRevision, ...patch }))),
  /** Campi senza revisione: stato, appunti, promemoria, apertura, cestino, spostamento */
  update: async (id: string, patch: Record<string, unknown>) =>
    saveResult(await apiRequest('/api/materials', send('PATCH', { id, ...patch }))),
  saveVersion: (id: string, reason: 'export' | 'manuale') =>
    call<{ versionNo: number }>('/api/materials?action=version', send('POST', { id, reason })),
  duplicate: async (id: string, childId?: string | null) =>
    (await call<{ material: ServerMaterial }>(
      '/api/materials?action=duplicate',
      send('POST', childId === undefined ? { id } : { id, childId }),
    )).material,
  remove: (id: string) => call<{ ok: true }>(`/api/materials?id=${encodeURIComponent(id)}`, send('DELETE')),
}
