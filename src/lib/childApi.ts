// Cartella del bambino sul server (/api/children e /api/materials): profilo, obiettivi con storico,
// collegamenti tra materiali e obiettivi. Ogni apertura della cartella finisce nel registro degli accessi.
import type { GoalArea, GoalStatus, ProfileSection, ProfileSource } from '../config/profile'
import { call, send } from './account'
import type { ServerMaterial } from './materials'
import type { ServerChild } from './serverData'

export interface ProfileEntry {
  id: string
  childId: string
  section: ProfileSection
  text: string
  source: ProfileSource
  recordedOn: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface GoalEvent {
  id: string
  kind: 'creato' | 'stato' | 'nota' | 'materiale'
  fromStatus: GoalStatus | null
  toStatus: GoalStatus | null
  note: string | null
  materialId: string | null
  materialTitle: string | null
  materialAction: 'collegato' | 'scollegato' | null
  createdAt: string
}

export interface Goal {
  id: string
  childId: string
  title: string
  description: string | null
  area: GoalArea | null
  status: GoalStatus
  startedOn: string
  closedOn: string | null
  events: GoalEvent[]
}

export interface ChildDetail {
  child: ServerChild & { birthYear: number | null; developmentLevel: string | null; realName?: string | null }
  profile: ProfileEntry[]
  goals: Goal[]
}

const id = (value: string) => encodeURIComponent(value)

export const childApi = {
  detail: (childId: string) => call<ChildDetail>(`/api/children?id=${id(childId)}`),
  update: async (childId: string, patch: { birthYear?: number | null; developmentLevel?: string | null }) =>
    (await call<{ child: ChildDetail['child'] }>('/api/children', send('PATCH', { id: childId, ...patch }))).child,

  addEntry: async (body: { childId: string; section: ProfileSection; text: string; source: ProfileSource; recordedOn: string }) =>
    (await call<{ entry: ProfileEntry }>('/api/children?resource=profile', send('POST', body))).entry,
  updateEntry: async (entryId: string, patch: { text?: string; source?: ProfileSource; recordedOn?: string; archived?: boolean }) =>
    (await call<{ entry: ProfileEntry }>('/api/children?resource=profile', send('PATCH', { id: entryId, ...patch }))).entry,
  removeEntry: (entryId: string) => call<{ ok: true }>(`/api/children?resource=profile&id=${id(entryId)}`, send('DELETE')),

  addGoal: async (body: { childId: string; title: string; description?: string; area?: GoalArea }) =>
    (await call<{ goal: Goal }>('/api/children?resource=goals', send('POST', body))).goal,
  /** status con note facoltativa: il cambio finisce nello storico; solo note = nota nello storico */
  updateGoal: async (
    goalId: string,
    patch: { title?: string; description?: string | null; area?: GoalArea | null; status?: GoalStatus; note?: string },
  ) => (await call<{ goal: Goal }>('/api/children?resource=goals', send('PATCH', { id: goalId, ...patch }))).goal,
  /** Eliminazione definitiva (solo titolare) */
  removeGoal: (goalId: string) => call<{ ok: true }>(`/api/children?resource=goals&id=${id(goalId)}`, send('DELETE')),

  /** Obiettivi collegati alle schede del bambino (id materiale → id obiettivi) */
  goalLinks: async (childId: string) => {
    const list = (await call<{ materials: ServerMaterial[] }>(`/api/materials?child=${id(childId)}`)).materials
    return new Map(list.map((m) => [m.id, m.goalIds]))
  },
  /** Sostituisce i collegamenti; gli eventi aggiunti allo storico tornano in goalEvents */
  setGoals: (materialId: string, goalIds: string[]) =>
    call<{ material: ServerMaterial; goalEvents: { goalId: string; event: GoalEvent }[] }>(
      '/api/materials',
      send('PATCH', { id: materialId, goalIds }),
    ),
}

/** Data AAAA-MM-GG di oggi (fuso del dispositivo) */
export function todayDate(): string {
  return new Date().toLocaleDateString('sv-SE')
}

/** "2026-10-03" → "3 ottobre 2026" */
export function longDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
}
