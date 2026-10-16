// /api/guide — proposta della guida per genitori e scuola (bozza da rivedere), con il modello di testo.
//   POST { input }                                   → { family: string[10], school: string[10] }
//   POST { input, point: { version, index, current } } → { text }  rigenera un solo punto
// Il testo inviato all'AI è solo quello di guideRequestText (lo stesso dell'anteprima nell'app):
// difficoltà, obiettivo, situazioni, fascia d'età, linguaggio. Mai nomi o dati identificativi: il server
// li cerca (formati riconoscibili, pseudonimi e nomi sui materiali dei bambini del centro) e blocca l'invio.
// Ogni chiamata finisce in ai_requests con i nomi dei campi inviati, mai il contenuto.
import { AI_GUIDE_REASONING, AI_MODELS, AI_TEXT_LIMIT_DEFAULT } from '../src/config/ai.js'
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
import { requireUser } from './_lib/auth.js'
import { asUser, requireMembership } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'
import { sealerFor } from './_lib/keys.js'
import { structuredText, type TextUsage } from './_lib/openai.js'

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

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as { input?: unknown; point?: unknown } | null
    const input = cleanInput(body?.input)
    const point = body?.point === undefined ? null : cleanPoint(body.point)
    const requestText = guideRequestText(input)

    // Permessi, limite giornaliero e controllo dei nomi del centro prima di chiamare l'AI
    const { orgId } = await asUser(user.id, async (tx) => {
      const membership = await requireMembership(tx, user.id)
      const [{ used }] = await tx<{ used: number }[]>`
        select count(*)::int as used from app.ai_requests
        where org_id = ${membership.orgId} and kind = 'testo'
          and created_at >= (date_trunc('day', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome')`
      const limit = textLimit()
      if (used >= limit) {
        throw new UserError(`Limite giornaliero raggiunto: ${used} guide su ${limit}. Si riparte domani.`, 429)
      }
      const s = await sealerFor(tx, membership.orgId)
      const children = await tx<{ id: string; pseudonym: string; material_name_enc: string | null }[]>`
        select id, pseudonym, material_name_enc from app.children where org_id = ${membership.orgId}`
      const names = children.flatMap((c) => [c.pseudonym, s.open(c.material_name_enc, 'children', 'material_name_enc', c.id) ?? ''])
      const problems = identifyingProblems(`${requestText}\n${point?.current ?? ''}`, names)
      if (problems.length > 0) {
        throw new UserError(`Prima di inviare togli ${problems.join(', ')}. All'AI non vanno mai dati che identificano un bambino.`)
      }
      return membership
    })

    const fields = ['difficolta', 'obiettivo', ...(input.situations.trim() ? ['situazioni'] : []), 'fascia_eta', 'linguaggio']
    if (point) {
      const { value, usage } = await structuredText<{ testo: string }>({
        model: AI_MODELS.guide,
        instructions: guidePointInstructions(point.version, point.index),
        input: `${requestText}\n\nVersione attuale del punto:\n${point.current}`,
        name: 'guide_point',
        schema: POINT_SCHEMA,
        reasoning: AI_GUIDE_REASONING,
      })
      await logRequest(user.id, orgId, [...fields, 'punto_attuale'], usage)
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
    await logRequest(user.id, orgId, fields, usage)
    return json({
      family: pointKeys.map((k) => tidy(value.famiglia[k] ?? '')),
      school: pointKeys.map((k) => tidy(value.scuola[k] ?? '')),
    })
  })
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

async function logRequest(userId: string, orgId: string, fields: string[], usage: TextUsage) {
  const cost =
    usage.inputTokens !== null && usage.outputTokens !== null
      ? (usage.inputTokens * PRICE.input + usage.outputTokens * PRICE.output) / 1_000_000
      : null
  await asUser(userId, (tx) =>
    tx`
      insert into app.ai_requests (org_id, kind, fields_sent, model, images, input_tokens, output_tokens, cost_estimate_usd)
      values (${orgId}, 'testo', ${fields}, ${AI_MODELS.guide}, 0, ${usage.inputTokens}, ${usage.outputTokens}, ${cost})`,
  )
}
