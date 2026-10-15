// Chiamate a OpenAI con fetch (nessun SDK). La chiave è solo in OPENAI_API_KEY, mai nel codice o nel browser.
import { AI_IMAGE, AI_MODELS } from '../../src/config/ai.js'
import { UserError } from './http.js'

const API = 'https://api.openai.com/v1'

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new UserError('La generazione con AI non è configurata (manca OPENAI_API_KEY).', 503)
  return key
}

async function openaiError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
  const code = body?.error?.code
  console.error('OpenAI', response.status, body?.error)
  if (code === 'moderation_blocked') {
    throw new UserError('La richiesta è stata bloccata dai filtri di sicurezza. Prova a descrivere la scena in un altro modo.')
  }
  if (response.status === 429) throw new UserError('Il servizio AI è occupato. Riprova tra qualche minuto.', 429)
  throw new UserError('Il servizio AI non ha risposto correttamente. Riprova tra poco.', 502)
}

export interface ActionText {
  /** Frase d'azione in inglese per il prompt dell'immagine */
  action: string
  title_f: string
  title_m: string
  tags: string[]
}

const ACTION_INSTRUCTIONS = `You prepare illustration requests for a library of visual supports for children aged 3-8.
Input: an Italian description of what a child does.
Return:
- action: one short English sentence describing only the child's visible action, starting with "the child", present tense, ending with a period. No names, no setting, no clothes, no extra objects beyond those needed for the action.
- title_f / title_m: a short Italian first-person title for the picture, feminine and masculine versions (e.g. "Mi allaccio le scarpe da sola" / "Mi allaccio le scarpe da solo"), max 7 words, no final period.
- tags: 3 to 6 Italian lowercase single-word or two-word tags useful to search the picture.`

/** Modello di testo: traduce la descrizione e propone titoli e tag (risposta JSON a schema fisso). */
export async function describeAction(description: string): Promise<ActionText> {
  const response = await fetch(`${API}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODELS.text,
      input: [
        { role: 'system', content: ACTION_INSTRUCTIONS },
        { role: 'user', content: description },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'scene_action',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              title_f: { type: 'string' },
              title_m: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['action', 'title_f', 'title_m', 'tags'],
            additionalProperties: false,
          },
        },
      },
    }),
  })
  if (!response.ok) await openaiError(response)
  const data = (await response.json()) as {
    output?: { type: string; content?: { type: string; text?: string }[] }[]
  }
  const text = data.output
    ?.filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .find((part) => part.type === 'output_text')?.text
  if (!text) throw new UserError('Il servizio AI non ha risposto correttamente. Riprova tra poco.', 502)
  const parsed = JSON.parse(text) as ActionText
  return {
    // Una sola frase pulita: finisce nel template fisso del prompt
    action: oneLine(parsed.action, 220).replace(/([^.])$/, '$1.'),
    title_f: oneLine(parsed.title_f, 60),
    title_m: oneLine(parsed.title_m, 60),
    tags: parsed.tags.map((t) => oneLine(t, 30).toLowerCase()).filter(Boolean).slice(0, 6),
  }
}

function oneLine(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Modello immagini, endpoint di modifica: prompt + fogli di riferimento (bambino ed eventuale adulto). */
export async function editImage(prompt: string, references: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const form = new FormData()
  form.append('model', AI_MODELS.image)
  form.append('prompt', prompt)
  form.append('size', AI_IMAGE.size)
  form.append('quality', AI_IMAGE.quality)
  form.append('output_format', AI_IMAGE.format)
  form.append('output_compression', String(AI_IMAGE.compression))
  form.append('n', '1')
  for (const ref of references) {
    form.append('image[]', new Blob([new Uint8Array(ref.bytes)], { type: 'image/png' }), ref.name)
  }
  const response = await fetch(`${API}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  })
  if (!response.ok) await openaiError(response)
  const data = (await response.json()) as { data?: { b64_json?: string }[] }
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new UserError('Il servizio AI non ha restituito l’immagine. Riprova.', 502)
  return Uint8Array.from(Buffer.from(b64, 'base64'))
}
