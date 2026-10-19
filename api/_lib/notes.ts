// Appunti sull'app (/api/organization?resource=notes): problemi, idee e domande di chi prova l'app, legati alla
// schermata. Testo e risposta cifrati (contesto app_notes.{colonna}:{id}). Tutti i membri scrivono e leggono;
// stato e risposta solo il titolare; il testo solo chi l'ha scritto (gli stessi controlli sono nel database).
import { randomUUID } from 'node:crypto'
import { asUser, requireMembership, type Tx } from './db.js'
import { UserError } from './http.js'
import { optOneOf, optText, readBody, reqText, uuid } from './input.js'
import { sealerFor, type Sealer } from './keys.js'

const KINDS = ['problema', 'idea', 'domanda'] as const
const STATUSES = ['nuovo', 'visto', 'fatto'] as const
const TEXT_MAX = 3000

interface NoteRow {
  id: string
  author_id: string
  author_name: string | null
  screen: string
  context: string
  kind: string
  text_enc: string
  status: string
  reply_enc: string | null
  created_at: Date
  updated_at: Date
}

const COLUMNS = `n.id, n.author_id, coalesce(nullif(m.display_name, ''), m.email) as author_name, n.screen, n.context, n.kind,
  n.text_enc, n.status, n.reply_enc, n.created_at, n.updated_at`

function noteOut(row: NoteRow, s: Sealer, userId: string) {
  return {
    id: row.id,
    author: { id: row.author_id, name: row.author_name },
    mine: row.author_id === userId,
    screen: row.screen,
    context: row.context,
    kind: row.kind,
    text: s.open(row.text_enc, 'app_notes', 'text_enc', row.id) ?? '',
    status: row.status,
    reply: s.open(row.reply_enc, 'app_notes', 'reply_enc', row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listNotes(userId: string) {
  return asUser(userId, async (tx) => {
    const { orgId } = await requireMembership(tx, userId)
    const s = await sealerFor(tx, orgId)
    const rows = await tx<NoteRow[]>`
      select ${tx.unsafe(COLUMNS)} from app.app_notes n
      left join app.memberships m on m.org_id = n.org_id and m.user_id = n.author_id
      where n.org_id = ${orgId}
      order by n.created_at desc
      limit 1000`
    return { notes: rows.map((r) => noteOut(r, s, userId)) }
  })
}

export async function createNote(userId: string, request: Request) {
  const body = await readBody(request)
  const screen = reqText(body, 'screen', 40, 'Schermata')
  const context = optText(body, 'context', 120, 'Dettaglio') ?? ''
  const kind = optOneOf(body, 'kind', KINDS)
  if (!kind) throw new UserError('Richiesta non valida.')
  const text = reqText(body, 'text', TEXT_MAX, 'L’appunto')
  return asUser(userId, async (tx) => {
    const { orgId } = await requireMembership(tx, userId)
    const s = await sealerFor(tx, orgId)
    const id = randomUUID()
    await tx`
      insert into app.app_notes (id, org_id, screen, context, kind, text_enc)
      values (${id}, ${orgId}, ${screen}, ${context}, ${kind}, ${s.seal(text, 'app_notes', 'text_enc', id)!})`
    return { note: await readNote(tx, s, orgId, id, userId) }
  })
}

export async function updateNote(userId: string, request: Request) {
  const body = await readBody(request)
  const id = uuid(body.id)
  const kind = optOneOf(body, 'kind', KINDS)
  const status = optOneOf(body, 'status', STATUSES)
  const text = 'text' in body ? reqText(body, 'text', TEXT_MAX, 'L’appunto') : undefined
  const reply = optText(body, 'reply', TEXT_MAX, 'La risposta')
  if (kind === undefined && status === undefined && text === undefined && reply === undefined) throw new UserError('Richiesta non valida.')
  return asUser(userId, async (tx) => {
    const { orgId, role } = await requireMembership(tx, userId)
    const s = await sealerFor(tx, orgId)
    const [current] = await tx<{ author_id: string }[]>`select author_id from app.app_notes where id = ${id} and org_id = ${orgId}`
    if (!current) throw new UserError('Appunto non trovato.', 404)
    if ((kind !== undefined || text !== undefined) && current.author_id !== userId) {
      throw new UserError('Solo chi ha scritto l’appunto può modificarlo.', 403)
    }
    if ((status !== undefined || reply !== undefined) && role !== 'titolare') {
      throw new UserError('Stato e risposta degli appunti li cambia il titolare.', 403)
    }
    const updates: Record<string, unknown> = {}
    if (kind !== undefined) updates.kind = kind
    if (status !== undefined) updates.status = status
    if (text !== undefined) updates.text_enc = s.seal(text, 'app_notes', 'text_enc', id)
    if (reply !== undefined) updates.reply_enc = reply === null ? null : s.seal(reply, 'app_notes', 'reply_enc', id)
    await tx`update app.app_notes set ${tx(updates)} where id = ${id} and org_id = ${orgId}`
    return { note: await readNote(tx, s, orgId, id, userId) }
  })
}

export function deleteNote(userId: string, id: string) {
  return asUser(userId, async (tx) => {
    const { orgId } = await requireMembership(tx, userId)
    const deleted = await tx`delete from app.app_notes where id = ${uuid(id)} and org_id = ${orgId} returning id`
    if (deleted.length === 0) throw new UserError('Appunto non trovato o non tuo.', 404)
    return { ok: true }
  })
}

async function readNote(tx: Tx, s: Sealer, orgId: string, id: string, userId: string) {
  const [row] = await tx<NoteRow[]>`
    select ${tx.unsafe(COLUMNS)} from app.app_notes n
    left join app.memberships m on m.org_id = n.org_id and m.user_id = n.author_id
    where n.id = ${id} and n.org_id = ${orgId}`
  return noteOut(row, s, userId)
}
