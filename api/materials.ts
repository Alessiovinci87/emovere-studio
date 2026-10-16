// /api/materials — materiali (oggi: schede) di un bambino o generici, con versioni e controllo di revisione.
//   GET                          → { materials }  tutti quelli in uso (bambini non nel cestino)
//   GET ?child={id} | ?generic=1 | ?trash=1     → { materials } filtrati
//   GET ?id=                     → { material (con notes), versions }  (lettura registrata se è di un bambino)
//   GET ?id=&version={n}         → { version }  copia fissa
//   POST   { childId?, kind?, title, content, … }      → { material, existing? }  (legacyId: importazione)
//   POST ?action=duplicate { id, childId? }             → { material }  copia che riparte da "Da fare"
//   POST ?action=version   { id, reason }               → { versionNo }  ('export' | 'manuale')
//   PATCH  { id, baseRevision?, title?, content?, status?, notes?, reminder?, opened?, childId?, goalIds?, trashed? }
//          → { material }  oppure 409 { conflict: true, current } se titolo/contenuto sono cambiati altrove
//   DELETE ?id=                  → eliminazione definitiva (solo titolare; gli altri usano il cestino)
//
// Il contenuto (lo Sheet dell'app) arriva senza i campi che stanno in colonne proprie: il server toglie
// id, folderId, childName, notes, status, reminder e date. Il nome del bambino non si salva mai nel materiale.
import { randomUUID } from 'node:crypto'
import { requireUser } from './_lib/auth.js'
import { asUser, audit, requireMembership, type Tx } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'
import { defined, optBool, optOneOf, optText, readBody, uuid, type Body } from './_lib/input.js'
import { sealerFor, type Sealer } from './_lib/keys.js'

const KINDS = ['scheda', 'storia_sociale', 'scenario', 'sequenza', 'guida', 'caa', 'rinforzo', 'attivita'] as const
const STATUSES = ['da-fare', 'in-lavorazione', 'pronta', 'consegnata'] as const
const REMINDER_KINDS = ['creare', 'stampare', 'consegnare', 'rivedere'] as const
const VERSION_REASONS = ['export', 'manuale'] as const
const MAX_CONTENT = 300_000
/** Campi dello Sheet che hanno una colonna propria (o non si salvano) */
const OWN_COLUMNS = ['id', 'folderId', 'childName', 'notes', 'status', 'reminder', 'createdAt', 'updatedAt', 'openedAt']

interface MaterialRow {
  id: string
  child_id: string | null
  is_generic: boolean
  kind: string
  title: string
  status: string
  content: Record<string, unknown>
  revision: number
  current_version: number
  from_template_id: string | null
  notes_enc: string | null
  reminder_date: string | null
  reminder_kind: string | null
  reminder_done: boolean
  opened_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  goal_ids: string[]
}

const COLUMNS = `m.id, m.child_id, m.is_generic, m.kind, m.title, m.status, m.content, m.revision, m.current_version,
  m.from_template_id, m.notes_enc, m.reminder_date::text, m.reminder_kind, m.reminder_done, m.opened_at,
  m.created_at, m.updated_at, m.deleted_at,
  coalesce((select array_agg(g.goal_id order by g.created_at) from app.material_goals g where g.material_id = m.id), '{}') as goal_ids`

function materialOut(row: MaterialRow, s: Sealer, withNotes: boolean) {
  return {
    id: row.id,
    childId: row.child_id,
    isGeneric: row.is_generic,
    kind: row.kind,
    title: row.title,
    status: row.status,
    content: row.content,
    revision: row.revision,
    currentVersion: row.current_version,
    fromTemplateId: row.from_template_id,
    ...(withNotes ? { notes: s.open(row.notes_enc, 'materials', 'notes_enc', row.id) ?? '' } : {}),
    reminder: row.reminder_date ? { date: row.reminder_date, kind: row.reminder_kind, done: row.reminder_done } : null,
    openedAt: row.opened_at,
    goalIds: row.goal_ids,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

async function context(tx: Tx, userId: string) {
  const membership = await requireMembership(tx, userId)
  return { ...membership, s: await sealerFor(tx, membership.orgId) }
}

async function load(tx: Tx, orgId: string, id: string, lock = false): Promise<MaterialRow> {
  const [row] = lock
    ? await tx<MaterialRow[]>`select ${tx.unsafe(COLUMNS)} from app.materials m where m.id = ${id} and m.org_id = ${orgId} for update`
    : await tx<MaterialRow[]>`select ${tx.unsafe(COLUMNS)} from app.materials m where m.id = ${id} and m.org_id = ${orgId}`
  if (!row) throw new UserError('Scheda non trovata.', 404)
  return row
}

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    return json(
      await asUser(user.id, async (tx) => {
        const { orgId, s } = await context(tx, user.id)
        if (id === null) {
          const child = params.get('child')
          const filter =
            child !== null
              ? tx`m.child_id = ${uuid(child)} and m.deleted_at is null`
              : params.get('generic') === '1'
                ? tx`m.child_id is null and m.deleted_at is null`
                : params.get('trash') === '1'
                  ? tx`m.deleted_at is not null`
                  : tx`m.deleted_at is null and (m.child_id is null or exists (
                      select 1 from app.children c where c.id = m.child_id and c.deleted_at is null))`
          const rows = await tx<MaterialRow[]>`
            select ${tx.unsafe(COLUMNS)} from app.materials m
            where m.org_id = ${orgId} and ${filter}
            order by m.updated_at desc`
          return { materials: rows.map((row) => materialOut(row, s, false)) }
        }

        const row = await load(tx, orgId, uuid(id))
        const versionParam = params.get('version')
        if (versionParam !== null) {
          const [version] = await tx<{ version_no: number; title: string; content: unknown; reason: string; created_at: Date; created_by: string | null }[]>`
            select version_no, title, content, reason, created_at, created_by from app.material_versions
            where material_id = ${row.id} and version_no = ${Number(versionParam) || 0}`
          if (!version) throw new UserError('Versione non trovata.', 404)
          return {
            version: {
              versionNo: version.version_no,
              title: version.title,
              content: version.content,
              reason: version.reason,
              createdAt: version.created_at,
              createdBy: version.created_by,
            },
          }
        }
        const versions = await tx<{ version_no: number; reason: string; created_at: Date; created_by: string | null }[]>`
          select version_no, reason, created_at, created_by from app.material_versions
          where material_id = ${row.id} order by version_no desc`
        if (row.child_id) {
          await audit(tx, { orgId, action: 'legge', entity: 'materials', entityId: row.id, childId: row.child_id })
        }
        return {
          material: materialOut(row, s, true),
          versions: versions.map((v) => ({ versionNo: v.version_no, reason: v.reason, createdAt: v.created_at, createdBy: v.created_by })),
        }
      }),
    )
  })
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const action = new URL(request.url).searchParams.get('action')
    const body = await readBody(request)
    if (action === 'duplicate') return json(await duplicate(user.id, body))
    if (action === 'version') return json(await saveVersion(user.id, body))
    if (action !== null) throw new UserError('Richiesta non valida.')

    const childId = 'childId' in body && body.childId !== null ? uuid(body.childId) : null
    const kind = optOneOf(body, 'kind', KINDS) ?? 'scheda'
    const title = optText(body, 'title', 200, 'Il titolo') ?? ''
    const content = cleanContent(body.content)
    const status = optOneOf(body, 'status', STATUSES) ?? 'da-fare'
    const notes = optText(body, 'notes', 4000, 'Gli appunti')
    const reminder = optReminder(body)
    const isGeneric = childId === null ? true : (optBool(body, 'isGeneric') ?? false)
    const fromTemplateId = 'fromTemplateId' in body && body.fromTemplateId !== null ? uuid(body.fromTemplateId) : null
    const legacyId = optText(body, 'legacyId', 100, 'Identificativo')

    return json(
      await asUser(user.id, async (tx) => {
        const { orgId, s } = await context(tx, user.id)
        const id = randomUUID()
        const [inserted] = await tx<{ id: string }[]>`
          insert into app.materials (id, org_id, child_id, is_generic, kind, title, status, content, notes_enc,
                                     reminder_date, reminder_kind, reminder_done, from_template_id, legacy_id)
          values (${id}, ${orgId}, ${childId}, ${isGeneric}, ${kind}, ${title}, ${status}, ${tx.json(content as never)},
                  ${s.seal(notes, 'materials', 'notes_enc', id) ?? null},
                  ${reminder?.date ?? null}, ${reminder?.kind ?? null}, ${reminder?.done ?? false},
                  ${fromTemplateId}, ${legacyId ?? null})
          on conflict (org_id, legacy_id) do nothing
          returning id`
        if (!inserted) {
          const [existing] = await tx<{ id: string }[]>`
            select id from app.materials where org_id = ${orgId} and legacy_id = ${legacyId!}`
          return { material: materialOut(await load(tx, orgId, existing.id), s, true), existing: true }
        }
        await audit(tx, { orgId, action: legacyId ? 'importa' : 'crea', entity: 'materials', entityId: id, childId })
        return { material: materialOut(await load(tx, orgId, id), s, true) }
      }),
    )
  })
}

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = await readBody(request)
    const id = uuid(body.id)
    const title = optText(body, 'title', 200, 'Il titolo')
    const content = 'content' in body ? cleanContent(body.content) : undefined
    const status = optOneOf(body, 'status', STATUSES)
    const notes = optText(body, 'notes', 4000, 'Gli appunti')
    const reminder = optReminder(body)
    const opened = optBool(body, 'opened')
    const trashed = optBool(body, 'trashed')
    const childId = 'childId' in body ? (body.childId === null ? null : uuid(body.childId)) : undefined
    const goalIds = 'goalIds' in body ? goalList(body.goalIds) : undefined
    const editsText = title !== undefined || content !== undefined
    const baseRevision = body.baseRevision
    if (editsText && (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision))) {
      throw new UserError('Richiesta non valida (manca la revisione).')
    }

    return asUser(user.id, async (tx) => {
      const { orgId, s } = await context(tx, user.id)
      const before = await load(tx, orgId, id, true)

      // Titolo o contenuto cambiati altrove dopo che questa copia è stata aperta: decide l'utente
      if (editsText && baseRevision !== before.revision) {
        return json(
          {
            error: 'Questa scheda è stata modificata su un altro dispositivo o da un’altra persona.',
            conflict: true,
            current: materialOut(before, s, true),
          },
          409,
        )
      }

      const moving = childId !== undefined && childId !== before.child_id
      if (moving || goalIds !== undefined) {
        // Gli obiettivi sono del bambino: spostando la scheda i collegamenti si tolgono
        await tx`delete from app.material_goals where material_id = ${id}`
      }
      const updates = defined({
        title: title === undefined ? undefined : (title ?? ''),
        content: content === undefined ? undefined : tx.json(content as never),
        status,
        notes_enc: s.seal(notes, 'materials', 'notes_enc', id),
        reminder_date: reminder === undefined ? undefined : (reminder?.date ?? null),
        reminder_kind: reminder === undefined ? undefined : (reminder?.kind ?? null),
        reminder_done: reminder === undefined ? undefined : (reminder?.done ?? false),
        opened_at: opened ? new Date() : undefined,
        deleted_at: trashed === undefined ? undefined : trashed ? new Date() : null,
        child_id: moving ? childId : undefined,
        is_generic: moving && childId === null ? true : undefined,
      })
      if (Object.keys(updates).length > 0) {
        await tx`update app.materials set ${tx(updates)} where id = ${id}`
      }
      const targetChild = moving ? childId : before.child_id
      if (goalIds && goalIds.length > 0) {
        if (!targetChild) throw new UserError('Una scheda generica non si collega agli obiettivi.')
        for (const goalId of goalIds) {
          await tx`
            insert into app.material_goals (material_id, goal_id, child_id, org_id)
            values (${id}, ${goalId}, ${targetChild}, ${orgId})`
        }
      }
      // Passando a "Pronta" si conserva una copia fissa
      if (status === 'pronta' && before.status !== 'pronta') {
        await tx`
          insert into app.material_versions (org_id, material_id, title, content, reason)
          select org_id, id, title, content, 'pronta' from app.materials where id = ${id}`
      }
      const onlyOpened = Object.keys(updates).length === 1 && opened
      if (!onlyOpened) {
        await audit(tx, {
          orgId,
          action: trashed === true ? 'elimina' : trashed === false ? 'ripristina' : 'modifica',
          entity: 'materials',
          entityId: id,
          childId: targetChild,
          details: { fields: [...Object.keys(updates), ...(goalIds ? ['goal_ids'] : [])] },
        })
      }
      return json({ material: materialOut(await load(tx, orgId, id), s, true) })
    })
  })
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const id = uuid(new URL(request.url).searchParams.get('id'))
    return json(
      await asUser(user.id, async (tx) => {
        const { orgId } = await requireMembership(tx, user.id, 'titolare')
        const [row] = await tx<{ child_id: string | null }[]>`
          delete from app.materials where id = ${id} and org_id = ${orgId} returning child_id`
        if (!row) throw new UserError('Scheda non trovata.', 404)
        await audit(tx, { orgId, action: 'elimina', entity: 'materials', entityId: id, childId: row.child_id, details: { definitivo: true } })
        return { ok: true }
      }),
    )
  })
}

/** Copia indipendente, anche per un altro bambino o generica: riparte da "Da fare", senza promemoria. */
async function duplicate(userId: string, body: Body) {
  const sourceId = uuid(body.id)
  return asUser(userId, async (tx) => {
    const { orgId, s } = await context(tx, userId)
    const source = await load(tx, orgId, sourceId)
    const childId = 'childId' in body ? (body.childId === null ? null : uuid(body.childId)) : source.child_id
    const id = randomUUID()
    const notes = s.open(source.notes_enc, 'materials', 'notes_enc', source.id)
    const title = childId === source.child_id ? `${source.title} (copia)`.slice(0, 200) : source.title
    await tx`
      insert into app.materials (id, org_id, child_id, is_generic, kind, title, status, content, notes_enc, from_template_id)
      values (${id}, ${orgId}, ${childId}, ${childId === null ? true : source.is_generic}, ${source.kind}, ${title}, 'da-fare',
              ${tx.json(source.content as never)}, ${s.seal(notes, 'materials', 'notes_enc', id) ?? null}, ${source.from_template_id})`
    await audit(tx, { orgId, action: 'crea', entity: 'materials', entityId: id, childId, details: { copiaDi: sourceId } })
    return { material: materialOut(await load(tx, orgId, id), s, true) }
  })
}

async function saveVersion(userId: string, body: Body) {
  const id = uuid(body.id)
  const reason = optOneOf(body, 'reason', VERSION_REASONS)
  if (!reason) throw new UserError('Richiesta non valida.')
  return asUser(userId, async (tx) => {
    const { orgId } = await requireMembership(tx, userId)
    const [row] = await tx<{ version_no: number }[]>`
      insert into app.material_versions (org_id, material_id, title, content, reason)
      select org_id, id, title, content, ${reason} from app.materials where id = ${id} and org_id = ${orgId}
      returning version_no`
    if (!row) throw new UserError('Scheda non trovata.', 404)
    return { versionNo: row.version_no }
  })
}

/** Contenuto della scheda senza i campi che hanno una colonna propria (e mai il nome del bambino). */
function cleanContent(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserError('Contenuto della scheda non valido.')
  const content = { ...(value as Record<string, unknown>) }
  for (const key of OWN_COLUMNS) delete content[key]
  if (JSON.stringify(content).length > MAX_CONTENT) throw new UserError('La scheda è troppo grande per essere salvata.')
  return content
}

function optReminder(body: Body): { date: string; kind: string; done: boolean } | null | undefined {
  if (!('reminder' in body)) return undefined
  const value = body.reminder as { date?: unknown; kind?: unknown; done?: unknown } | null
  if (value === null) return null
  if (
    typeof value !== 'object' ||
    typeof value.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    !REMINDER_KINDS.includes(value.kind as (typeof REMINDER_KINDS)[number])
  ) {
    throw new UserError('Promemoria non valido.')
  }
  return { date: value.date, kind: value.kind as string, done: value.done === true }
}

function goalList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50) throw new UserError('Richiesta non valida.')
  return [...new Set(value.map((v) => uuid(v)))]
}

