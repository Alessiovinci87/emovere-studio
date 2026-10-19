// Storico degli obiettivi (goal_events): righe e forma restituita all'app. Usato da /api/children e /api/materials.
import type { Sealer } from './keys.js'

export interface EventRow {
  id: string
  goal_id: string
  kind: string
  from_status: string | null
  to_status: string | null
  note_enc: string | null
  material_id: string | null
  material_title: string | null
  material_action: string | null
  author_id: string | null
  created_at: Date
}

/** Colonne di goal_events con alias "e" */
export const EVENT_COLUMNS =
  'e.id, e.goal_id, e.kind, e.from_status, e.to_status, e.note_enc, e.material_id, e.material_title, e.material_action, e.author_id, e.created_at'

export function eventOut(e: EventRow, s: Sealer) {
  return {
    id: e.id,
    kind: e.kind,
    fromStatus: e.from_status,
    toStatus: e.to_status,
    note: s.open(e.note_enc, 'goal_events', 'note_enc', e.id),
    materialId: e.material_id,
    materialTitle: e.material_title,
    materialAction: e.material_action,
    authorId: e.author_id,
    createdAt: e.created_at,
  }
}
