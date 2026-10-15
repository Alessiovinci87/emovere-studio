// /api/coloring — versioni "da colorare" delle vignette (contorni neri su bianco).
//   GET  → { keys }  vignette che hanno già la versione da colorare ("A01_bambina", …)
//   POST → { code, character, image? } genera la versione mancante (una sola volta per vignetta)
// La vignetta originale arriva dall'app (catalogo disegnato) oppure si legge dal Blob (vignette AI X001…).
// Ogni versione generata conta nel limite di immagini, come le vignette AI.
import { COLORING_PROMPT } from '../src/config/ai.js'
import { UserError, handle, json } from './_lib/http.js'
import { checkLimit } from './_lib/limits.js'
import { editImage } from './_lib/openai.js'
import { addUsage, coloringPath, imagePath, listColoringKeys, putPng, readImage } from './_lib/storage.js'

export const config = { maxDuration: 300 }

const CODE = /^([A-H]\d{2}|X\d{3,})$/
const MAX_SOURCE_BYTES = 6 * 1024 * 1024

interface Body {
  code: string
  character: 'bambina' | 'bambino'
  /** Vignetta originale (data URL PNG o WebP): obbligatoria per il catalogo disegnato */
  image?: string
}

export function GET(): Promise<Response> {
  return handle(async () => json({ keys: await listColoringKeys() }))
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = (await request.json().catch(() => null)) as Body | null
    if (!body || !CODE.test(body.code ?? '') || (body.character !== 'bambina' && body.character !== 'bambino')) {
      throw new UserError('Richiesta non valida.')
    }
    const key = `${body.code}_${body.character}`
    // Si genera una sola volta: se c'è già, si riusa
    if ((await listColoringKeys()).includes(key)) return json({ key, existing: true })

    const { period } = await checkLimit(1)
    const source = body.code.startsWith('X') ? await readAiSource(body.code, body.character) : decodeSource(body.image)
    const png = await editImage(COLORING_PROMPT, [{ name: `${key}.${source.ext}`, bytes: source.bytes, type: source.type }], {
      format: 'png',
    })
    await putPng(coloringPath(body.code, body.character), png)
    await addUsage(period, 1)
    return json({ key, existing: false })
  })
}

async function readAiSource(code: string, character: 'bambina' | 'bambino') {
  const result = await readImage(imagePath(code, character))
  if (!result || result.statusCode !== 200) throw new UserError('Vignetta non trovata.', 404)
  return { bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()), type: 'image/webp', ext: 'webp' }
}

function decodeSource(dataUrl: unknown) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(/^data:image\/(png|webp);base64,(.+)$/) : null
  if (!match) throw new UserError('Immagine non valida.')
  const bytes = Uint8Array.from(Buffer.from(match[2], 'base64'))
  const header = Buffer.from(bytes.subarray(0, 12)).toString('latin1')
  const isPng = header.startsWith('\x89PNG')
  const isWebp = header.startsWith('RIFF') && header.slice(8) === 'WEBP'
  if (bytes.length > MAX_SOURCE_BYTES || !(isPng || isWebp)) throw new UserError('Immagine non valida.')
  return { bytes, type: isPng ? 'image/png' : 'image/webp', ext: isPng ? 'png' : 'webp' }
}
