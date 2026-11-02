// Link per la famiglia: il PDF (versione WhatsApp) di un materiale, aperto senza login da chi ha il link.
//
// - Il link contiene un token casuale di 32 byte. Il server conserva solo la sua impronta SHA-256: il file
//   pubblico condivisi/link/{impronta}.{scadenza}.bin contiene il PDF cifrato (AES-256-GCM) con una chiave
//   derivata dal token (HKDF), quindi senza il link nemmeno chi legge il Blob può aprirlo.
// - Elenco dei link del centro (per vederli e revocarli): condivisi/{centro}/index.enc, cifrato con la
//   chiave del centro. Revoca = file eliminato subito. Dopo la scadenza il link non si apre più e la
//   pulizia notturna elimina il file. Se il materiale (o il suo bambino) va nel cestino o viene eliminato,
//   il link smette di aprirsi (controllo sul database a ogni apertura).
// - Ogni apertura finisce nel registro degli accessi del centro, senza utente ("Apertura dal link").
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { list } from '@vercel/blob'
import type { Tx } from './db.js'
import { UserError } from './http.js'
import { sealerFor } from './keys.js'
import { deleteImages, putBytes, readBytes, putText, readText } from './storage.js'

export const SHARE_DAYS = [7, 30] as const
const MAX_PDF_BYTES = 3 * 1024 * 1024
const LINK_PREFIX = 'condivisi/link/'
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const HASH = /^[0-9a-f]{64}$/

export interface ShareEntry {
  /** Impronta del token (identifica il link, non permette di aprirlo) */
  id: string
  materialId: string
  childId: string | null
  createdAt: string
  expiresAt: string
  createdBy: string
}

interface ShareMeta {
  orgId: string
  materialId: string
  childId: string | null
  title: string
}

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex')
const keyOf = (token: string) => Buffer.from(hkdfSync('sha256', token, 'emovere-condiviso', 'pdf', 32))
const linkPath = (id: string, expiresAt: Date) => `${LINK_PREFIX}${id}.${Math.floor(expiresAt.getTime() / 1000)}.bin`
const indexPath = (orgId: string) => `condivisi/${orgId}/index.enc`

async function readShares(tx: Tx, orgId: string): Promise<ShareEntry[]> {
  const sealed = await readText(indexPath(orgId))
  if (!sealed) return []
  const s = await sealerFor(tx, orgId)
  const all = JSON.parse(s.open(sealed.trim(), 'condivisi', 'indice', orgId) ?? '[]') as ShareEntry[]
  return all.filter((e) => new Date(e.expiresAt).getTime() > Date.now())
}

async function writeShares(tx: Tx, orgId: string, shares: ShareEntry[]) {
  const s = await sealerFor(tx, orgId)
  await putText(indexPath(orgId), s.seal(JSON.stringify(shares), 'condivisi', 'indice', orgId)!, true)
}

/** Link attivi di un materiale */
export async function listShares(tx: Tx, orgId: string, materialId: string): Promise<ShareEntry[]> {
  return (await readShares(tx, orgId)).filter((e) => e.materialId === materialId)
}

export async function createShare(
  tx: Tx,
  input: { orgId: string; userId: string; materialId: string; childId: string | null; title: string; pdf: string; days: number },
): Promise<{ token: string; share: ShareEntry }> {
  const match = input.pdf.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new UserError('PDF non valido.')
  const pdf = Buffer.from(match[1], 'base64')
  if (pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new UserError('PDF non valido o troppo grande.')

  const token = randomBytes(32).toString('base64url')
  const id = hashOf(token)
  const expiresAt = new Date(Date.now() + input.days * 86_400_000)
  const meta: ShareMeta = { orgId: input.orgId, materialId: input.materialId, childId: input.childId, title: input.title }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyOf(token), iv)
  cipher.setAAD(Buffer.from(id))
  const plain = Buffer.concat([Buffer.from(JSON.stringify(meta)), Buffer.from('\n'), pdf])
  const sealed = Buffer.concat([iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()])
  await putBytes(linkPath(id, expiresAt), sealed)

  const share: ShareEntry = {
    id,
    materialId: input.materialId,
    childId: input.childId,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdBy: input.userId,
  }
  await writeShares(tx, input.orgId, [...(await readShares(tx, input.orgId)), share])
  return { token, share }
}

async function linkFiles(id: string): Promise<{ pathname: string; expiresAt: number }[]> {
  const page = await list({ prefix: `${LINK_PREFIX}${id}.`, limit: 10 })
  return page.blobs.map((b) => ({ pathname: b.pathname, expiresAt: Number(b.pathname.split('.')[1]) * 1000 }))
}

export async function revokeShare(tx: Tx, orgId: string, materialId: string, id: string): Promise<ShareEntry> {
  if (!HASH.test(id)) throw new UserError('Link non valido.')
  const shares = await readShares(tx, orgId)
  const share = shares.find((e) => e.id === id && e.materialId === materialId)
  if (!share) throw new UserError('Link non trovato.', 404)
  const files = await linkFiles(id)
  if (files.length) await deleteImages(files.map((f) => f.pathname))
  await writeShares(tx, orgId, shares.filter((e) => e.id !== id))
  return share
}

/** Apertura pubblica: PDF e dati per il registro, oppure null (link sbagliato, scaduto o revocato) */
export async function openShare(token: string): Promise<{ pdf: Buffer; meta: ShareMeta } | null> {
  if (!TOKEN.test(token)) return null
  const id = hashOf(token)
  const file = (await linkFiles(id)).find((f) => f.expiresAt > Date.now())
  if (!file) return null
  const sealed = await readBytes(file.pathname)
  if (!sealed || sealed.length < 28) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(token), sealed.subarray(0, 12))
    decipher.setAAD(Buffer.from(id))
    decipher.setAuthTag(sealed.subarray(sealed.length - 16))
    const plain = Buffer.concat([decipher.update(sealed.subarray(12, sealed.length - 16)), decipher.final()])
    const newline = plain.indexOf(0x0a)
    return { meta: JSON.parse(plain.subarray(0, newline).toString('utf8')) as ShareMeta, pdf: plain.subarray(newline + 1) }
  } catch {
    return null
  }
}

/** Pulizia notturna: file dei link scaduti */
export async function purgeExpiredShares(): Promise<number> {
  const expired: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: LINK_PREFIX, cursor, limit: 1000 })
    for (const blob of page.blobs) {
      const seconds = Number(blob.pathname.slice(LINK_PREFIX.length).split('.')[1])
      if (!Number.isFinite(seconds) || seconds * 1000 <= Date.now()) expired.push(blob.pathname)
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  if (expired.length) await deleteImages(expired)
  return expired.length
}
