// /api/children — bambini, nome reale, profilo e obiettivi. I campi sensibili sono cifrati (vedi keys.ts).
//   GET                         → { children }  (con contatori dei materiali per stato; ?trash=1 → cestino)
//   GET ?id=                    → { child, profile, goals }  (lettura registrata in audit_log)
//   POST   { pseudonym, … }     → { child, existing? }  (legacyId: importazione senza doppioni)
//   PATCH  { id, … }            → { child }  (trashed: cestino/ripristino; realName solo titolare)
//   DELETE ?id=                 → eliminazione definitiva (solo titolare)
//   ?resource=profile  POST { childId, section, text, source, recordedOn? } · PATCH { id, … archived? } · DELETE ?id=
//   ?resource=goals    POST { childId, title, description?, area? } · PATCH { id, …, status?, note? } · DELETE ?id= (titolare)
import { randomUUID } from 'node:crypto'
import { requireUser } from './_lib/auth.js'
import { asUser, audit, requireMembership, type Membership, type Tx } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'
import {
  defined,
  optBool,
  optDate,
  optOneOf,
  optText,
  readBody,
  reqText,
  uuid,
  type Body,
} from './_lib/input.js'
import { sealerFor, type Sealer } from './_lib/keys.js'

const SECTIONS = ['comunicazione', 'autonomie', 'interessi', 'difficolta', 'contesti', 'preferenze', 'rinforzatori', 'uso', 'note'] as const
const SOURCES = ['osservato', 'genitori', 'scuola', 'ipotesi'] as const
const AREAS = ['autonomie', 'comunicazione', 'emozioni', 'abilita_sociali', 'comportamento', 'funzioni_esecutive', 'scuola', 'altro'] as const
const GOAL_STATUSES = ['attivo', 'raggiunto', 'archiviato'] as const
const CHILD_STATUSES = ['attivo', 'archiviato'] as const

interface ChildRow {
  id: string
  code: string
  pseudonym: string
  birth_year: number | null
  development_level_enc: string | null
  material_name_enc: string | null
  graphic_prefs: Record<string, unknown>
  status: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

interface EntryRow {
  id: string
  child_id: string
  section: string
  text_enc: string
  source: string
  recorded_on: string
  author_id: string | null
  archived_at: Date | null
  created_at: Date
  updated_at: Date
}

interface GoalRow {
  id: string
  child_id: string
  title_enc: string
  description_enc: string | null
  area: string | null
  status: string
  started_on: string
  closed_on: string | null
  created_at: Date
  updated_at: Date
}

const CHILD_COLUMNS = 'id, code, pseudonym, birth_year, development_level_enc, material_name_enc, graphic_prefs, status, created_at, updated_at, deleted_at'
const ENTRY_COLUMNS = 'id, child_id, section, text_enc, source, recorded_on::text, author_id, archived_at, created_at, updated_at'
const GOAL_COLUMNS = 'id, child_id, title_enc, description_enc, area, status, started_on::text, closed_on::text, created_at, updated_at'

function childOut(row: ChildRow, s: Sealer, extra: { realName?: string | null; counts?: Record<string, number> } = {}) {
  return {
    id: row.id,
    code: row.code,
    pseudonym: row.pseudonym,
    birthYear: row.birth_year,
    developmentLevel: s.open(row.development_level_enc, 'children', 'development_level_enc', row.id),
    materialName: s.open(row.material_name_enc, 'children', 'material_name_enc', row.id),
    graphicPrefs: row.graphic_prefs,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    ...extra,
  }
}

function entryOut(row: EntryRow, s: Sealer) {
  return {
    id: row.id,
    childId: row.child_id,
    section: row.section,
    text: s.open(row.text_enc, 'child_profile_entries', 'text_enc', row.id),
    source: row.source,
    recordedOn: row.recorded_on,
    authorId: row.author_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function goalOut(row: GoalRow, s: Sealer) {
  return {
    id: row.id,
    childId: row.child_id,
    title: s.open(row.title_enc, 'goals', 'title_enc', row.id),
    description: s.open(row.description_enc, 'goals', 'description_enc', row.id),
    area: row.area,
    status: row.status,
    startedOn: row.started_on,
    closedOn: row.closed_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Utente, centro e chiave del centro: il punto di partenza di ogni operazione. */
async function context(tx: Tx, userId: string, role?: Membership['role']) {
  const membership = await requireMembership(tx, userId, role)
  return { ...membership, s: await sealerFor(tx, membership.orgId) }
}

const notFound = () => new UserError('Bambino non trovato.', 404)

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    return json(
      await asUser(user.id, async (tx) => {
        const { orgId, role, s } = await context(tx, user.id)
        if (id === null) {
          const trash = params.get('trash') === '1'
          const rows = await tx<(ChildRow & { counts: Record<string, number> })[]>`
            select ${tx.unsafe(CHILD_COLUMNS.split(', ').map((c) => `c.${c}`).join(', '))},
                   coalesce(jsonb_object_agg(m.status, m.n) filter (where m.status is not null), '{}') as counts
            from app.children c
            left join (
              select child_id, status, count(*)::int as n from app.materials where deleted_at is null group by 1, 2
            ) m on m.child_id = c.id
            where c.org_id = ${orgId} and (c.deleted_at is not null) = ${trash}
            group by c.id
            order by c.pseudonym`
          return { children: rows.map((row) => childOut(row, s, { counts: row.counts })) }
        }

        const [row] = await tx<ChildRow[]>`
          select ${tx.unsafe(CHILD_COLUMNS)} from app.children where id = ${uuid(id)} and org_id = ${orgId}`
        if (!row) throw notFound()
        let realName: string | null | undefined
        if (role === 'titolare') {
          const [identity] = await tx<{ real_name_enc: string | null }[]>`
            select real_name_enc from app.child_identity where child_id = ${row.id}`
          realName = s.open(identity?.real_name_enc ?? null, 'child_identity', 'real_name_enc', row.id)
        }
        const entries = await tx<EntryRow[]>`
          select ${tx.unsafe(ENTRY_COLUMNS)} from app.child_profile_entries
          where child_id = ${row.id} order by section, recorded_on, created_at`
        const goals = await tx<GoalRow[]>`
          select ${tx.unsafe(GOAL_COLUMNS)} from app.goals where child_id = ${row.id} order by status, started_on desc`
        const events = await tx<
          { id: string; goal_id: string; kind: string; from_status: string | null; to_status: string | null; note_enc: string | null; author_id: string | null; created_at: Date }[]
        >`
          select e.id, e.goal_id, e.kind, e.from_status, e.to_status, e.note_enc, e.author_id, e.created_at
          from app.goal_events e join app.goals g on g.id = e.goal_id
          where g.child_id = ${row.id} order by e.created_at`
        await audit(tx, { orgId, action: 'legge', entity: 'children', entityId: row.id, childId: row.id })
        return {
          child: childOut(row, s, realName === undefined ? {} : { realName }),
          profile: entries.map((e) => entryOut(e, s)),
          goals: goals.map((g) => ({
            ...goalOut(g, s),
            events: events
              .filter((e) => e.goal_id === g.id)
              .map((e) => ({
                id: e.id,
                kind: e.kind,
                fromStatus: e.from_status,
                toStatus: e.to_status,
                note: s.open(e.note_enc, 'goal_events', 'note_enc', e.id),
                authorId: e.author_id,
                createdAt: e.created_at,
              })),
          })),
        }
      }),
    )
  })
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const resource = new URL(request.url).searchParams.get('resource')
    const body = await readBody(request)
    if (resource === 'profile') return json(await createEntry(user.id, body))
    if (resource === 'goals') return json(await createGoal(user.id, body))
    if (resource !== null) throw new UserError('Richiesta non valida.')

    const pseudonym = reqText(body, 'pseudonym', 60, 'Il nome o lo pseudonimo')
    const birthYear = optBirthYear(body)
    const developmentLevel = optText(body, 'developmentLevel', 2000, 'Livello di sviluppo')
    const materialName = optText(body, 'materialName', 40, 'Nome sui materiali')
    const realName = optText(body, 'realName', 120, 'Nome reale')
    const graphicPrefs = optPrefs(body)
    const legacyId = optText(body, 'legacyId', 100, 'Identificativo')

    return json(
      await asUser(user.id, async (tx) => {
        const { orgId, role, s } = await context(tx, user.id)
        if (realName && role !== 'titolare') throw new UserError('Il nome reale lo inserisce solo il titolare.', 403)
        const id = randomUUID()
        const [row] = await tx<ChildRow[]>`
          insert into app.children (id, org_id, pseudonym, birth_year, development_level_enc, material_name_enc, graphic_prefs, legacy_id)
          values (${id}, ${orgId}, ${pseudonym}, ${birthYear ?? null},
                  ${s.seal(developmentLevel, 'children', 'development_level_enc', id) ?? null},
                  ${s.seal(materialName, 'children', 'material_name_enc', id) ?? null},
                  ${tx.json((graphicPrefs ?? {}) as never)}, ${legacyId ?? null})
          on conflict (org_id, legacy_id) do nothing
          returning ${tx.unsafe(CHILD_COLUMNS)}`
        if (!row) {
          // Già importato in precedenza: si restituisce quello esistente
          const [existing] = await tx<ChildRow[]>`
            select ${tx.unsafe(CHILD_COLUMNS)} from app.children where org_id = ${orgId} and legacy_id = ${legacyId!}`
          return { child: childOut(existing, s), existing: true }
        }
        if (realName) {
          await tx`
            insert into app.child_identity (child_id, org_id, real_name_enc)
            values (${id}, ${orgId}, ${s.seal(realName, 'child_identity', 'real_name_enc', id)!})`
        }
        await audit(tx, { orgId, action: legacyId ? 'importa' : 'crea', entity: 'children', entityId: id, childId: id })
        return { child: childOut(row, s, role === 'titolare' ? { realName: realName ?? null } : {}) }
      }),
    )
  })
}

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const resource = new URL(request.url).searchParams.get('resource')
    const body = await readBody(request)
    if (resource === 'profile') return json(await updateEntry(user.id, body))
    if (resource === 'goals') return json(await updateGoal(user.id, body))
    if (resource !== null) throw new UserError('Richiesta non valida.')

    const id = uuid(body.id)
    const pseudonym = optText(body, 'pseudonym', 60, 'Il nome o lo pseudonimo')
    if (pseudonym === null) throw new UserError('Scrivi il nome o lo pseudonimo.')
    const birthYear = optBirthYear(body)
    const developmentLevel = optText(body, 'developmentLevel', 2000, 'Livello di sviluppo')
    const materialName = optText(body, 'materialName', 40, 'Nome sui materiali')
    const realName = optText(body, 'realName', 120, 'Nome reale')
    const graphicPrefs = optPrefs(body)
    const status = optOneOf(body, 'status', CHILD_STATUSES)
    const trashed = optBool(body, 'trashed')

    return json(
      await asUser(user.id, async (tx) => {
        const { orgId, role, s } = await context(tx, user.id)
        if (realName !== undefined && role !== 'titolare') throw new UserError('Il nome reale lo gestisce solo il titolare.', 403)
        const updates = defined({
          pseudonym,
          birth_year: birthYear,
          development_level_enc: s.seal(developmentLevel, 'children', 'development_level_enc', id),
          material_name_enc: s.seal(materialName, 'children', 'material_name_enc', id),
          graphic_prefs: graphicPrefs === undefined ? undefined : tx.json(graphicPrefs as never),
          status,
          deleted_at: trashed === undefined ? undefined : trashed ? new Date() : null,
        })
        const [row] =
          Object.keys(updates).length > 0
            ? await tx<ChildRow[]>`
                update app.children set ${tx(updates)} where id = ${id} and org_id = ${orgId}
                returning ${tx.unsafe(CHILD_COLUMNS)}`
            : await tx<ChildRow[]>`select ${tx.unsafe(CHILD_COLUMNS)} from app.children where id = ${id} and org_id = ${orgId}`
        if (!row) throw notFound()

        if (realName === null) await tx`delete from app.child_identity where child_id = ${id}`
        if (realName) {
          await tx`
            insert into app.child_identity (child_id, org_id, real_name_enc)
            values (${id}, ${orgId}, ${s.seal(realName, 'child_identity', 'real_name_enc', id)!})
            on conflict (child_id) do update set real_name_enc = excluded.real_name_enc`
        }
        await audit(tx, {
          orgId,
          action: trashed === true ? 'elimina' : trashed === false ? 'ripristina' : 'modifica',
          entity: 'children',
          entityId: id,
          childId: id,
          details: { fields: [...Object.keys(updates), ...(realName === undefined ? [] : ['real_name_enc'])] },
        })
        let currentRealName: string | null | undefined
        if (role === 'titolare') {
          const [identity] = await tx<{ real_name_enc: string | null }[]>`
            select real_name_enc from app.child_identity where child_id = ${id}`
          currentRealName = s.open(identity?.real_name_enc ?? null, 'child_identity', 'real_name_enc', id)
        }
        return { child: childOut(row, s, currentRealName === undefined ? {} : { realName: currentRealName }) }
      }),
    )
  })
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const params = new URL(request.url).searchParams
    const id = uuid(params.get('id'))
    const resource = params.get('resource')
    return json(
      await asUser(user.id, async (tx) => {
        if (resource === 'profile') {
          const { orgId } = await requireMembership(tx, user.id)
          const [row] = await tx<{ child_id: string }[]>`
            delete from app.child_profile_entries where id = ${id} and org_id = ${orgId} returning child_id`
          if (!row) throw new UserError('Voce del profilo non trovata.', 404)
          await audit(tx, { orgId, action: 'elimina', entity: 'child_profile_entries', entityId: id, childId: row.child_id })
          return { ok: true }
        }
        // Eliminazioni definitive di obiettivi e bambini: solo il titolare (gli altri usano archivio e cestino)
        const { orgId } = await requireMembership(tx, user.id, 'titolare')
        if (resource === 'goals') {
          const [row] = await tx<{ child_id: string }[]>`delete from app.goals where id = ${id} and org_id = ${orgId} returning child_id`
          if (!row) throw new UserError('Obiettivo non trovato.', 404)
          await audit(tx, { orgId, action: 'elimina', entity: 'goals', entityId: id, childId: row.child_id })
          return { ok: true }
        }
        if (resource !== null) throw new UserError('Richiesta non valida.')
        const [row] = await tx`delete from app.children where id = ${id} and org_id = ${orgId} returning id`
        if (!row) throw notFound()
        await audit(tx, { orgId, action: 'elimina', entity: 'children', entityId: id, childId: id, details: { definitivo: true } })
        return { ok: true }
      }),
    )
  })
}

// ——— Profilo ———

async function createEntry(userId: string, body: Body) {
  const childId = uuid(body.childId)
  const section = optOneOf(body, 'section', SECTIONS)
  const source = optOneOf(body, 'source', SOURCES)
  if (!section || !source) throw new UserError('Scegli la sezione e la provenienza dell’informazione.')
  const text = reqText(body, 'text', 4000, 'Il testo')
  const recordedOn = optDate(body, 'recordedOn')
  return asUser(userId, async (tx) => {
    const { orgId, s } = await context(tx, userId)
    const id = randomUUID()
    const [row] = await tx<EntryRow[]>`
      insert into app.child_profile_entries (id, org_id, child_id, section, text_enc, source, recorded_on)
      values (${id}, ${orgId}, ${childId}, ${section}, ${s.seal(text, 'child_profile_entries', 'text_enc', id)!}, ${source},
              ${recordedOn ?? tx`current_date`})
      returning ${tx.unsafe(ENTRY_COLUMNS)}`
    await audit(tx, { orgId, action: 'crea', entity: 'child_profile_entries', entityId: id, childId })
    return { entry: entryOut(row, s) }
  })
}

async function updateEntry(userId: string, body: Body) {
  const id = uuid(body.id)
  const text = optText(body, 'text', 4000, 'Il testo')
  if (text === null) throw new UserError('Scrivi il testo (o elimina la voce).')
  const section = optOneOf(body, 'section', SECTIONS)
  const source = optOneOf(body, 'source', SOURCES)
  const recordedOn = optDate(body, 'recordedOn')
  if (recordedOn === null) throw new UserError('Data non valida.')
  const archived = optBool(body, 'archived')
  return asUser(userId, async (tx) => {
    const { orgId, s } = await context(tx, userId)
    const updates = defined({
      text_enc: s.seal(text, 'child_profile_entries', 'text_enc', id),
      section,
      source,
      recorded_on: recordedOn,
      archived_at: archived === undefined ? undefined : archived ? new Date() : null,
    })
    if (Object.keys(updates).length === 0) throw new UserError('Niente da modificare.')
    const [row] = await tx<EntryRow[]>`
      update app.child_profile_entries set ${tx(updates)} where id = ${id} and org_id = ${orgId}
      returning ${tx.unsafe(ENTRY_COLUMNS)}`
    if (!row) throw new UserError('Voce del profilo non trovata.', 404)
    await audit(tx, {
      orgId,
      action: 'modifica',
      entity: 'child_profile_entries',
      entityId: id,
      childId: row.child_id,
      details: { fields: Object.keys(updates) },
    })
    return { entry: entryOut(row, s) }
  })
}

// ——— Obiettivi ———

async function createGoal(userId: string, body: Body) {
  const childId = uuid(body.childId)
  const title = reqText(body, 'title', 300, 'L’obiettivo')
  const description = optText(body, 'description', 4000, 'Descrizione')
  const area = optOneOf(body, 'area', AREAS)
  return asUser(userId, async (tx) => {
    const { orgId, s } = await context(tx, userId)
    const id = randomUUID()
    const [row] = await tx<GoalRow[]>`
      insert into app.goals (id, org_id, child_id, title_enc, description_enc, area)
      values (${id}, ${orgId}, ${childId}, ${s.seal(title, 'goals', 'title_enc', id)!},
              ${s.seal(description, 'goals', 'description_enc', id) ?? null}, ${area ?? null})
      returning ${tx.unsafe(GOAL_COLUMNS)}`
    await tx`insert into app.goal_events (org_id, goal_id, kind, to_status) values (${orgId}, ${id}, 'creato', 'attivo')`
    await audit(tx, { orgId, action: 'crea', entity: 'goals', entityId: id, childId })
    return { goal: goalOut(row, s) }
  })
}

async function updateGoal(userId: string, body: Body) {
  const id = uuid(body.id)
  const title = optText(body, 'title', 300, 'L’obiettivo')
  if (title === null) throw new UserError('Scrivi l’obiettivo.')
  const description = optText(body, 'description', 4000, 'Descrizione')
  const area = 'area' in body && body.area === null ? null : optOneOf(body, 'area', AREAS)
  const status = optOneOf(body, 'status', GOAL_STATUSES)
  const note = optText(body, 'note', 2000, 'Nota')
  return asUser(userId, async (tx) => {
    const { orgId, s } = await context(tx, userId)
    const [before] = await tx<{ status: string; child_id: string }[]>`
      select status, child_id from app.goals where id = ${id} and org_id = ${orgId} for update`
    if (!before) throw new UserError('Obiettivo non trovato.', 404)
    const statusChanged = status !== undefined && status !== before.status
    const updates = defined({
      title_enc: s.seal(title, 'goals', 'title_enc', id),
      description_enc: s.seal(description, 'goals', 'description_enc', id),
      area,
      status: statusChanged ? status : undefined,
      closed_on: statusChanged ? (status === 'attivo' ? null : todayInItaly()) : undefined,
    })
    const [row] =
      Object.keys(updates).length > 0
        ? await tx<GoalRow[]>`
            update app.goals set ${tx(updates)} where id = ${id} returning ${tx.unsafe(GOAL_COLUMNS)}`
        : await tx<GoalRow[]>`select ${tx.unsafe(GOAL_COLUMNS)} from app.goals where id = ${id}`
    // Storico: cambio di stato (con la nota, se c'è) oppure solo una nota
    if (statusChanged || note) {
      const eventId = randomUUID()
      await tx`
        insert into app.goal_events (id, org_id, goal_id, kind, from_status, to_status, note_enc)
        values (${eventId}, ${orgId}, ${id}, ${statusChanged ? 'stato' : 'nota'},
                ${statusChanged ? before.status : null}, ${statusChanged ? status! : null},
                ${s.seal(note, 'goal_events', 'note_enc', eventId) ?? null})`
    }
    await audit(tx, {
      orgId,
      action: 'modifica',
      entity: 'goals',
      entityId: id,
      childId: before.child_id,
      details: { fields: Object.keys(updates), ...(note ? { note: true } : {}) },
    })
    return { goal: goalOut(row, s) }
  })
}

// ——— Campi particolari ———

/** Data di oggi (AAAA-MM-GG) nel fuso orario italiano */
function todayInItaly(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
}

function optBirthYear(body: Body): number | null | undefined {
  if (!('birthYear' in body)) return undefined
  const value = body.birthYear
  if (value === null || value === '') return null
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new UserError('Anno di nascita non valido.')
  return year
}

/** Preferenze grafiche: oggetto piccolo, senza testi lunghi (non è un campo cifrato). */
function optPrefs(body: Body): Record<string, unknown> | undefined {
  if (!('graphicPrefs' in body)) return undefined
  const value = body.graphicPrefs
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 2000) {
    throw new UserError('Preferenze grafiche non valide.')
  }
  return value as Record<string, unknown>
}

