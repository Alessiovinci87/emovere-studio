// Archivio su Vercel Blob, tutto privato: le immagini si leggono solo passando da /api/image,
// quindi restano dietro la stessa password dell'app. Token: BLOB_READ_WRITE_TOKEN (o OIDC su Vercel).
//
//   bambina/X001_bambina.webp, bambino/X001_bambino.webp   immagini generate
//   index.json                                             voci della libreria AI (si uniscono a catalog.json)
//   usage.json                                             contatore delle immagini generate oggi
import { del, get, list, put } from '@vercel/blob'
import type { AiLimitPeriod } from '../../src/config/ai.js'
import type { Scene } from '../../src/types.js'

const INDEX = 'index.json'
const USAGE = 'usage.json'

export interface AiIndex {
  scenes: Scene[]
  /** Ultimo numero di codice assegnato: i codici eliminati non si riusano (le immagini restano in cache nei browser) */
  lastNumber: number
}

interface Usage {
  /** Periodo del conteggio (ora italiana): AAAA-MM-GG per giorno, AAAA-MM per mese */
  period?: string
  /** Versioni precedenti: solo giorno */
  date?: string
  count: number
}

async function readJson<T>(pathname: string): Promise<T | null> {
  // useCache: false → sempre l'ultima versione (questi file vengono sovrascritti)
  const result = await get(pathname, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return null
  return (await new Response(result.stream).json()) as T
}

async function writeJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  })
}

export async function readIndex(): Promise<AiIndex> {
  const index = await readJson<Partial<AiIndex>>(INDEX)
  const scenes = index?.scenes ?? []
  const lastNumber = Math.max(index?.lastNumber ?? 0, ...scenes.map((s) => Number(s.code.slice(1))))
  return { scenes, lastNumber }
}

export async function writeIndex(index: AiIndex): Promise<void> {
  await writeJson(INDEX, index)
}

/**
 * Periodo corrente in Italia: "2026-10-15" (giorno) o "2026-10" (mese).
 * Il limite si azzera a mezzanotte italiana o il primo del mese.
 */
export function currentPeriod(period: AiLimitPeriod, now = new Date()): string {
  const day = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
  return period === 'mese' ? day.slice(0, 7) : day
}

export async function usedInPeriod(period: AiLimitPeriod): Promise<number> {
  const usage = await readJson<Usage>(USAGE)
  return usage && (usage.period ?? usage.date) === currentPeriod(period) ? usage.count : 0
}

export async function addUsage(period: AiLimitPeriod, images: number): Promise<void> {
  const count = (await usedInPeriod(period)) + images
  await writeJson(USAGE, { period: currentPeriod(period), count } satisfies Usage)
}

export function imagePath(code: string, character: 'bambina' | 'bambino'): string {
  return `${character}/${code}_${character}.webp`
}

export async function putImage(pathname: string, bytes: Uint8Array): Promise<void> {
  await put(pathname, Buffer.from(bytes), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: 'image/webp',
  })
}

/** Versione da colorare: coloring/A01_bambina_colorare.png */
export function coloringPath(code: string, character: 'bambina' | 'bambino'): string {
  return `coloring/${code}_${character}_colorare.png`
}

/** Chiavi "A01_bambina" delle versioni da colorare già salvate (elenco completo, a pagine). */
export async function listColoringKeys(): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: 'coloring/', cursor, limit: 1000 })
    for (const blob of page.blobs) {
      const match = blob.pathname.match(/^coloring\/(.+)_colorare\.png$/)
      if (match) keys.push(match[1])
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return keys
}

export async function putPng(pathname: string, bytes: Uint8Array): Promise<void> {
  await put(pathname, Buffer.from(bytes), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'image/png',
  })
}

export async function readImage(pathname: string) {
  return get(pathname, { access: 'private' })
}

export async function deleteImages(pathnames: string[]): Promise<void> {
  await del(pathnames)
}
