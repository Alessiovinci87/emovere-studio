// /api/generate — crea una nuova vignetta con AI (versione bambina e bambino in parallelo).
//   GET  → stato: limite giornaliero, immagini già usate oggi, adulti disponibili (foglio di riferimento presente)
//   POST → { setting, outfit, expression, adult, description } → anteprima (non ancora salvata)
// Protetta dalla password dell'app: middleware.ts la controlla prima di ogni richiesta.
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AI_ADULTS, AI_DAILY_LIMIT_DEFAULT, CHILD_REFS, buildImagePrompt, isAiRequest, type AiAdult } from '../src/config/ai.js'
import { UserError, handle, json } from './_lib/http.js'
import { describeAction, editImage } from './_lib/openai.js'
import { addUsage, usedToday } from './_lib/storage.js'

export const config = { maxDuration: 300 }

const REFS_DIR = join(process.cwd(), 'public', 'library', 'refs')
const IMAGES_PER_SCENE = 2

function dailyLimit(): number {
  const value = Number(process.env.AI_DAILY_LIMIT)
  return Number.isInteger(value) && value > 0 ? value : AI_DAILY_LIMIT_DEFAULT
}

async function hasRef(name: string): Promise<boolean> {
  try {
    await access(join(REFS_DIR, name))
    return true
  } catch {
    return false
  }
}

async function availableAdults(): Promise<AiAdult[]> {
  const adults = Object.keys(AI_ADULTS) as AiAdult[]
  const present = await Promise.all(adults.map((a) => hasRef(AI_ADULTS[a].ref)))
  return adults.filter((_, i) => present[i])
}

async function readRef(name: string) {
  return { name, bytes: new Uint8Array(await readFile(join(REFS_DIR, name))) }
}

export function GET(): Promise<Response> {
  return handle(async () => {
    const [used, adults] = await Promise.all([usedToday(), availableAdults()])
    return json({ limit: dailyLimit(), used, adults })
  })
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = await request.json().catch(() => null)
    if (!isAiRequest(body)) throw new UserError('Richiesta non valida.')
    const description = body.description.trim()
    if (description.length < 3 || description.length > 300) {
      throw new UserError('Scrivi in poche parole cosa fa il bambino (massimo 300 caratteri).')
    }

    const limit = dailyLimit()
    const used = await usedToday()
    if (used + IMAGES_PER_SCENE > limit) {
      throw new UserError(
        `Limite giornaliero raggiunto: ${used} immagini su ${limit} (ogni vignetta ne crea ${IMAGES_PER_SCENE}, bambina e bambino). Si riparte domani.`,
        429,
      )
    }
    if (body.adult && !(await hasRef(AI_ADULTS[body.adult].ref))) {
      throw new UserError(`Manca il foglio di riferimento per “${AI_ADULTS[body.adult].label}”.`)
    }

    // 1. Testo: azione in inglese + titoli e tag proposti
    const text = await describeAction(description)
    // 2. Prompt dal template fisso (mai scritto dall'utente)
    const prompt = buildImagePrompt(text.action, body)
    // 3. Immagini in parallelo, ognuna con il foglio del suo personaggio (+ adulto)
    const adultRef = body.adult ? await readRef(AI_ADULTS[body.adult].ref) : null
    const characters = ['bambina', 'bambino'] as const
    const results = await Promise.allSettled(
      characters.map(async (c) => {
        const refs = [await readRef(CHILD_REFS[c])]
        if (adultRef) refs.push(adultRef)
        return editImage(prompt, refs)
      }),
    )
    const generated = results.filter((r) => r.status === 'fulfilled').length
    if (generated > 0) await addUsage(generated)
    const failure = results.find((r) => r.status === 'rejected')
    if (failure) throw failure.reason

    const [bambina, bambino] = results.map((r) => toDataUrl((r as PromiseFulfilledResult<Uint8Array>).value))
    return json({
      action: text.action,
      title_f: text.title_f,
      title_m: text.title_m,
      tags: text.tags,
      images: { bambina, bambino },
      used: used + generated,
      limit,
    })
  })
}

function toDataUrl(bytes: Uint8Array): string {
  return `data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`
}
