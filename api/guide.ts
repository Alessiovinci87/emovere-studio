// /api/guide — proposte di testo dell'AI (bozze da rivedere): guida per genitori e scuola e sequenza del flusso guidato.
//   POST { input, childId?, profileIds? }                   → { family: string[10], school: string[10] }
//   POST { input, point: { version, index, current }, … }   → { text }  rigenera un solo punto
//   POST { sequence, childId?, profileIds? }                → { title, steps: [{ text, code }] }  (code: vignetta o null)
// Il testo inviato all'AI è solo quello di guideRequestText / sequenceRequestText (lo stesso dell'anteprima nell'app).
// Le voci del profilo arrivano come id: il server le legge (stesso bambino, non archiviate), le decifra e le mette nel
// testo con profileRequestText. Mai nomi o dati identificativi: il server li cerca (formati riconoscibili, pseudonimi e
// nomi sui materiali dei bambini del centro) e blocca l'invio.
// Ogni chiamata finisce in ai_requests con i nomi dei campi inviati (es. profilo:interessi), mai il contenuto.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AI_GUIDE_REASONING, AI_MODELS, AI_TEXT_LIMIT_DEFAULT } from '../src/config/ai.js'
import {
  FLOW_MAX,
  isSequenceInput,
  profileFields,
  sequenceFields,
  sequenceInstructions,
  sequenceRequestText,
  sortProfileLines,
  type ProfileLine,
  type SequenceInput,
} from '../src/config/flow.js'
import {
  GUIDE_INPUT_MAX,
  GUIDE_INSTRUCTIONS,
  GUIDE_POINTS,
  guidePointInstructions,
  guideRequestText,
  identifyingProblems,
  isGuideInput,
  type GuideInput,
  type GuideVersion,
} from '../src/config/guide.js'
import type { ProfileSection, ProfileSource } from '../src/config/profile.js'
import type { Catalog, Scene } from '../src/types.js'
import { requireUser } from './_lib/auth.js'
import { asUser, audit, requireMembership } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'
import { isUuid } from './_lib/input.js'
import { sealerFor } from './_lib/keys.js'
import { structuredText, type TextUsage } from './_lib/openai.js'
import { readIndex } from './_lib/storage.js'

/** Listino del modello delle guide, dollari per milione di token (documentazione OpenAI, ottobre 2026) */
const PRICE = { input: 2, output: 10 }

const pointKeys = GUIDE_POINTS.map((_, i) => `punto_${i + 1}`)
const versionSchema = {
  type: 'object',
  properties: Object.fromEntries(pointKeys.map((k) => [k, { type: 'string' }])),
  required: pointKeys,
  additionalProperties: false,
}
const GUIDE_SCHEMA = {
  type: 'object',
  properties: { famiglia: versionSchema, scuola: versionSchema },
  required: ['famiglia', 'scuola'],
  additionalProperties: false,
}
const POINT_SCHEMA = {
  type: 'object',
  properties: { testo: { type: 'string' } },
  required: ['testo'],
  additionalProperties: false,
}

interface PointRequest {
  version: GuideVersion
  index: number
  current: string
}

interface Body {
  input?: unknown
  point?: unknown
  sequence?: unknown
  childId?: unknown
  profileIds?: unknown
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = ((await request.json().catch(() => null)) ?? {}) as Body
    const sequence = body.sequence === undefined ? null : cleanSequence(body.sequence)
    const input = sequence ? null : cleanInput(body.input)
    const point = sequence || body.point === undefined ? null : cleanPoint(body.point)
    const { childId, profileIds } = cleanProfileRequest(body)

    // Permessi, limite giornaliero, voci del profilo e controllo dei nomi del centro prima di chiamare l'AI
    const { orgId, profile, requestText } = await asUser(user.id, async (tx) => {
      const membership = await requireMembership(tx, user.id)
      const [{ used }] = await tx<{ used: number }[]>`
        select count(*)::int as used from app.ai_requests
        where org_id = ${membership.orgId} and kind = 'testo'
          and created_at >= (date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome')`
      const limit = textLimit()
      if (used >= limit) {
        throw new UserError(`Limite giornaliero raggiunto: ${used} proposte su ${limit}. Si riparte domani.`, 429)
      }
      const s = await sealerFor(tx, membership.orgId)

      let profile: ProfileLine[] = []
      if (childId) {
        const [child] = await tx<{ id: string }[]>`
          select id from app.children where id = ${childId} and org_id = ${membership.orgId} and deleted_at is null`
        if (!child) throw new UserError('Bambino non trovato.', 404)
        if (profileIds.length > 0) {
          const rows = await tx<{ id: string; section: ProfileSection; source: ProfileSource; text_enc: string }[]>`
            select id, section, source, text_enc from app.child_profile_entries
            where child_id = ${childId} and org_id = ${membership.orgId} and archived_at is null and id = any(${profileIds}::uuid[])
            order by recorded_on, created_at`
          profile = sortProfileLines(
            rows.map((r) => ({ section: r.section, source: r.source, text: s.open(r.text_enc, 'child_profile_entries', 'text_enc', r.id) ?? '' })),
          )
          await audit(tx, {
            orgId: membership.orgId,
            action: 'legge',
            entity: 'child_profile_entries',
            childId,
            details: { ai: true, campi: profileFields(profile) },
          })
        }
      }
      const requestText = sequence ? sequenceRequestText(sequence, profile) : guideRequestText(input!, profile)

      const children = await tx<{ id: string; pseudonym: string; material_name_enc: string | null }[]>`
        select id, pseudonym, material_name_enc from app.children where org_id = ${membership.orgId}`
      const names = children.flatMap((c) => [c.pseudonym, s.open(c.material_name_enc, 'children', 'material_name_enc', c.id) ?? ''])
      const problems = identifyingProblems(`${requestText}\n${point?.current ?? ''}`, names)
      if (problems.length > 0) {
        throw new UserError(`Prima di inviare togli ${problems.join(', ')}. All'AI non vanno mai dati che identificano un bambino.`)
      }
      return { orgId: membership.orgId, profile, requestText }
    })
    const log = (fields: string[], usage: TextUsage) => logRequest(user.id, orgId, childId, fields, usage)

    if (sequence) return json(await proposeSequence(sequence, requestText, profile, log))

    const fields = ['difficolta', 'obiettivo', ...(input!.situations.trim() ? ['situazioni'] : []), 'fascia_eta', 'linguaggio', ...profileFields(profile)]
    if (point) {
      const { value, usage } = await structuredText<{ testo: string }>({
        model: AI_MODELS.guide,
        instructions: guidePointInstructions(point.version, point.index),
        input: `${requestText}\n\nVersione attuale del punto:\n${point.current}`,
        name: 'guide_point',
        schema: POINT_SCHEMA,
        reasoning: AI_GUIDE_REASONING,
      })
      await log([...fields, 'punto_attuale'], usage)
      return json({ text: tidy(value.testo) })
    }

    const { value, usage } = await structuredText<Record<'famiglia' | 'scuola', Record<string, string>>>({
      model: AI_MODELS.guide,
      instructions: GUIDE_INSTRUCTIONS,
      input: requestText,
      name: 'guide',
      schema: GUIDE_SCHEMA,
      reasoning: AI_GUIDE_REASONING,
    })
    await log(fields, usage)
    return json({
      family: pointKeys.map((k) => tidy(value.famiglia[k] ?? '')),
      school: pointKeys.map((k) => tidy(value.scuola[k] ?? '')),
    })
  })
}

/** Sequenza: titolo e passaggi; la vignetta si sceglie solo tra quelle del catalogo con il personaggio richiesto */
async function proposeSequence(
  input: SequenceInput,
  requestText: string,
  profile: ProfileLine[],
  log: (fields: string[], usage: TextUsage) => Promise<void>,
) {
  const scenes = (await availableScenes()).filter((s) => s.characters.includes(input.character))
  const title = (s: Scene) => (input.character === 'bambina' ? s.title_f : s.title_m)
  const codes = scenes.map((s) => s.code)
  const { value, usage } = await structuredText<{ titolo: string; passaggi: { frase: string; vignetta: string }[] }>({
    model: AI_MODELS.guide,
    instructions: sequenceInstructions(scenes.map((s) => `${s.code}: ${title(s)} (${s.tags.join(', ')})`)),
    input: requestText,
    name: 'sequence',
    schema: {
      type: 'object',
      properties: {
        titolo: { type: 'string' },
        passaggi: {
          type: 'array',
          items: {
            type: 'object',
            properties: { frase: { type: 'string' }, vignetta: { type: 'string', enum: [...codes, ''] } },
            required: ['frase', 'vignetta'],
            additionalProperties: false,
          },
        },
      },
      required: ['titolo', 'passaggi'],
      additionalProperties: false,
    },
    reasoning: AI_GUIDE_REASONING,
  })
  await log(sequenceFields(profile), usage)
  const steps = Array.from({ length: input.steps }, (_, i) => {
    const step = value.passaggi[i]
    return { text: clean(step?.frase ?? '').replace(/\.$/, ''), code: step && codes.includes(step.vignetta) ? step.vignetta : null }
  })
  return { title: clean(value.titolo).replace(/\.$/, '').slice(0, 120), steps }
}

/** Catalogo disegnato + vignette create con AI (se l'archivio non risponde, solo il catalogo) */
async function availableScenes(): Promise<Scene[]> {
  const catalog = JSON.parse(await readFile(join(process.cwd(), 'src', 'data', 'catalog.json'), 'utf8')) as Catalog
  const ai = await readIndex().then(
    (index) => index.scenes,
    () => [],
  )
  return [...catalog.scenes, ...ai]
}

function cleanInput(value: unknown): GuideInput {
  if (!isGuideInput(value)) throw new UserError('Richiesta non valida.')
  const input = { ...value, difficulty: value.difficulty.trim(), goal: value.goal.trim(), situations: value.situations.trim() }
  if (!input.difficulty || !input.goal) throw new UserError('Scrivi la difficoltà osservata e l’obiettivo.')
  for (const key of ['difficulty', 'goal', 'situations'] as const) {
    if (input[key].length > GUIDE_INPUT_MAX[key]) throw new UserError('Testo troppo lungo: accorcialo un po’.')
  }
  return input
}

function cleanSequence(value: unknown): SequenceInput {
  if (!isSequenceInput(value)) throw new UserError('Richiesta non valida.')
  const input = { ...value, goal: value.goal.trim(), situation: value.situation.trim() }
  if (!input.goal || !input.situation) throw new UserError('Scrivi l’obiettivo e la situazione.')
  if (input.goal.length > FLOW_MAX.goal || input.situation.length > FLOW_MAX.situation) throw new UserError('Testo troppo lungo: accorcialo un po’.')
  return input
}

function cleanPoint(value: unknown): PointRequest {
  const v = value as Partial<PointRequest> | null
  if (
    !v ||
    (v.version !== 'famiglia' && v.version !== 'scuola') ||
    !Number.isInteger(v.index) ||
    v.index! < 0 ||
    v.index! >= GUIDE_POINTS.length ||
    typeof v.current !== 'string' ||
    v.current.length > 4000
  ) {
    throw new UserError('Richiesta non valida.')
  }
  return v as PointRequest
}

/** Voci del profilo: solo con il bambino, al massimo 60 id */
function cleanProfileRequest(body: Body): { childId: string | null; profileIds: string[] } {
  const childId = body.childId === undefined || body.childId === null ? null : body.childId
  const ids = body.profileIds === undefined ? [] : body.profileIds
  if (
    (childId !== null && !isUuid(childId)) ||
    !Array.isArray(ids) ||
    ids.length > 60 ||
    !ids.every(isUuid) ||
    (ids.length > 0 && childId === null)
  ) {
    throw new UserError('Richiesta non valida.')
  }
  return { childId, profileIds: [...new Set(ids)] }
}

function textLimit(): number {
  const value = Number(process.env.AI_TEXT_LIMIT)
  return Number.isInteger(value) && value > 0 ? value : AI_TEXT_LIMIT_DEFAULT
}

/** Testo pulito: niente markdown di troppo, righe vuote ridotte. */
function tidy(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Una riga sola, senza markdown (titoli e frasi della sequenza) */
function clean(text: string): string {
  return tidy(text).replace(/\s+/g, ' ').slice(0, 200)
}

async function logRequest(userId: string, orgId: string, childId: string | null, fields: string[], usage: TextUsage) {
  const cost =
    usage.inputTokens !== null && usage.outputTokens !== null
      ? (usage.inputTokens * PRICE.input + usage.outputTokens * PRICE.output) / 1_000_000
      : null
  await asUser(userId, (tx) =>
    tx`
      insert into app.ai_requests (org_id, child_id, kind, fields_sent, model, images, input_tokens, output_tokens, cost_estimate_usd)
      values (${orgId}, ${childId}, 'testo', ${fields}, ${AI_MODELS.guide}, 0, ${usage.inputTokens}, ${usage.outputTokens}, ${cost})`,
  )
}
