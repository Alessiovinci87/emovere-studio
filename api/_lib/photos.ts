// Foto del centro nella libreria (es. il bagno di casa, la classe, un oggetto preciso). Possono ritrarre luoghi
// e persone reali: restano solo del centro che le carica, cifrate con la sua chiave (anche titoli e tag),
// e /api/image le serve solo ai membri di quel centro.
//   foto/{centro}/index.enc   indice cifrato: [{ code, title, tags, createdAt }], ultimo numero
//   foto/{centro}/P001.enc    immagine WebP o JPEG come data URL, cifrata
import type { Scene } from '../../src/types.js'
import type { Tx } from './db.js'
import { UserError } from './http.js'
import { sealerFor } from './keys.js'
import { deleteImages, photoIndexPath, photoPath, putText, readText } from './storage.js'

export const PHOTO_BLOCK = 'P'
export const PHOTO_CODE = /^P\d{3,}$/
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024

interface PhotoEntry {
  code: string
  title: string
  tags: string[]
  createdAt: string
}

interface PhotoIndex {
  photos: PhotoEntry[]
  lastNumber: number
}

async function readIndex(tx: Tx, orgId: string): Promise<PhotoIndex> {
  const sealed = await readText(photoIndexPath(orgId))
  if (!sealed) return { photos: [], lastNumber: 0 }
  const s = await sealerFor(tx, orgId)
  return JSON.parse(s.open(sealed.trim(), 'foto', 'indice', orgId) ?? '{"photos":[],"lastNumber":0}') as PhotoIndex
}

async function writeIndex(tx: Tx, orgId: string, index: PhotoIndex) {
  const s = await sealerFor(tx, orgId)
  await putText(photoIndexPath(orgId), s.seal(JSON.stringify(index), 'foto', 'indice', orgId)!, true)
}

export function photoUrl(orgId: string, code: string): string {
  return `/api/image?p=${encodeURIComponent(photoPath(orgId, code))}`
}

/** Foto del centro come voci della libreria (stessa immagine per bambina e bambino) */
export async function photoScenes(tx: Tx, orgId: string): Promise<Scene[]> {
  const index = await readIndex(tx, orgId)
  return index.photos.map((p) => ({
    code: p.code,
    block: PHOTO_BLOCK,
    title_f: p.title,
    title_m: p.title,
    setting: 'foto',
    outfit: '',
    actions: [],
    objects: [],
    tags: p.tags,
    characters: ['bambina', 'bambino'],
    adults: [],
    images: { bambina: photoUrl(orgId, p.code), bambino: photoUrl(orgId, p.code) },
  }))
}

export async function savePhoto(tx: Tx, orgId: string, input: { title: string; tags: string[]; dataUrl: string }): Promise<Scene> {
  const match = input.dataUrl.match(/^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new UserError('Immagine non valida.')
  const bytes = Buffer.from(match[2], 'base64')
  const header = bytes.subarray(0, 12).toString('latin1')
  const valid = match[1] === 'webp' ? header.startsWith('RIFF') && header.slice(8) === 'WEBP' : bytes[0] === 0xff && bytes[1] === 0xd8
  if (bytes.length > MAX_PHOTO_BYTES || !valid) throw new UserError('Immagine non valida.')

  const index = await readIndex(tx, orgId)
  const next = index.lastNumber + 1
  const code = `P${String(next).padStart(3, '0')}`
  const s = await sealerFor(tx, orgId)
  await putText(photoPath(orgId, code), s.seal(input.dataUrl, 'foto', 'immagine', `${orgId}/${code}`)!, false)
  const entry: PhotoEntry = { code, title: input.title, tags: input.tags, createdAt: new Date().toISOString() }
  // Rilegge l'indice subito prima di scrivere, per non perdere foto caricate nel frattempo
  const latest = await readIndex(tx, orgId)
  await writeIndex(tx, orgId, { photos: [...latest.photos.filter((p) => p.code !== code), entry], lastNumber: Math.max(latest.lastNumber, next) })
  return (await photoScenes(tx, orgId)).find((p) => p.code === code)!
}

export async function deletePhoto(tx: Tx, orgId: string, code: string): Promise<void> {
  if (!PHOTO_CODE.test(code)) throw new UserError('Codice non valido.')
  const index = await readIndex(tx, orgId)
  if (!index.photos.some((p) => p.code === code)) throw new UserError('Foto non trovata.', 404)
  await writeIndex(tx, orgId, { photos: index.photos.filter((p) => p.code !== code), lastNumber: index.lastNumber })
  await deleteImages([photoPath(orgId, code)])
}

/** Immagine decifrata, solo per il centro a cui appartiene */
export async function readPhoto(tx: Tx, orgId: string, code: string): Promise<{ bytes: Buffer; type: string } | null> {
  const sealed = await readText(photoPath(orgId, code), true)
  if (!sealed) return null
  const s = await sealerFor(tx, orgId)
  const match = s.open(sealed.trim(), 'foto', 'immagine', `${orgId}/${code}`)?.match(/^data:(image\/(?:webp|jpeg));base64,(.+)$/)
  return match ? { bytes: Buffer.from(match[2], 'base64'), type: match[1] } : null
}
