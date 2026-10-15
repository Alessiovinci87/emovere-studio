// /api/library — vignette generate con AI, salvate su Vercel Blob.
//   GET            → { scenes }  voci da unire a catalog.json
//   POST           → salva l'anteprima: assegna il codice X001, X002…, carica le immagini, aggiorna l'indice
//   DELETE ?code=  → elimina la vignetta (voce e immagini)
import { AI_ADULTS, AI_OUTFITS, AI_SETTINGS } from '../src/config/ai.js'
import type { Scene } from '../src/types.js'
import { UserError, handle, json } from './_lib/http.js'
import { deleteImages, imagePath, putImage, readIndex, writeIndex } from './_lib/storage.js'

const CODE = /^X\d{3,}$/
const MAX_IMAGE_BYTES = 3 * 1024 * 1024

interface SaveBody {
  title_f: string
  title_m: string
  tags: string[]
  setting: string
  outfit: string
  adult: string | null
  images: { bambina: string; bambino: string }
}

export function GET(): Promise<Response> {
  return handle(async () => json({ scenes: (await readIndex()).scenes }))
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = (await request.json().catch(() => null)) as SaveBody | null
    const title_f = clean(body?.title_f, 60)
    const title_m = clean(body?.title_m, 60)
    if (!body || !title_f || !title_m) throw new UserError('Scrivi il titolo della vignetta (versione bambina e bambino).')
    if (!(body.setting in AI_SETTINGS) || !(body.outfit in AI_OUTFITS)) throw new UserError('Richiesta non valida.')
    if (body.adult !== null && !(body.adult in AI_ADULTS)) throw new UserError('Richiesta non valida.')
    const bambina = decodeWebp(body.images?.bambina)
    const bambino = decodeWebp(body.images?.bambino)

    const next = (await readIndex()).lastNumber + 1
    const code = `X${String(next).padStart(3, '0')}`

    await Promise.all([putImage(imagePath(code, 'bambina'), bambina), putImage(imagePath(code, 'bambino'), bambino)])
    const scene: Scene = {
      code,
      block: 'X',
      title_f,
      title_m,
      setting: body.setting,
      outfit: body.outfit,
      actions: [],
      objects: [],
      tags: (Array.isArray(body.tags) ? body.tags : []).map((t) => clean(t, 30).toLowerCase()).filter(Boolean).slice(0, 8),
      characters: ['bambina', 'bambino'],
      adults: body.adult ? [body.adult] : [],
      ai: true,
      images: {
        bambina: `/api/image?p=${encodeURIComponent(imagePath(code, 'bambina'))}`,
        bambino: `/api/image?p=${encodeURIComponent(imagePath(code, 'bambino'))}`,
      },
    }
    // Rilegge l'indice subito prima di scrivere, per non perdere salvataggi arrivati nel frattempo
    const latest = await readIndex()
    await writeIndex({
      scenes: [...latest.scenes.filter((s) => s.code !== code), scene],
      lastNumber: Math.max(latest.lastNumber, next),
    })
    return json({ scene })
  })
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const code = new URL(request.url).searchParams.get('code') ?? ''
    if (!CODE.test(code)) throw new UserError('Codice non valido.')
    const index = await readIndex()
    if (!index.scenes.some((s) => s.code === code)) throw new UserError('Vignetta non trovata.', 404)
    await writeIndex({ scenes: index.scenes.filter((s) => s.code !== code), lastNumber: index.lastNumber })
    await deleteImages([imagePath(code, 'bambina'), imagePath(code, 'bambino')])
    return json({ deleted: code })
  })
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function decodeWebp(dataUrl: unknown): Uint8Array {
  const prefix = 'data:image/webp;base64,'
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new UserError('Immagine non valida.')
  const bytes = Uint8Array.from(Buffer.from(dataUrl.slice(prefix.length), 'base64'))
  // Intestazione WebP: "RIFF" .... "WEBP"
  const header = Buffer.from(bytes.subarray(0, 12)).toString('latin1')
  if (bytes.length > MAX_IMAGE_BYTES || !header.startsWith('RIFF') || header.slice(8) !== 'WEBP') {
    throw new UserError('Immagine non valida.')
  }
  return bytes
}
