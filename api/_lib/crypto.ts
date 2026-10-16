// Cifratura dei campi sensibili, a chiave doppia (envelope encryption), AES-256-GCM.
//
// - DATA_ENCRYPTION_KEY (32 byte in base64, solo su Vercel) cifra la chiave dati di ogni centro:
//   organizations.dek_wrapped = "kv1:{IV}:{cifrato}".
// - La chiave dati del centro cifra i campi *_enc: "ev1:{versione}:{IV}:{cifrato}" (vedi app.encrypted_text).
// - Il contesto (es. "children.development_level_enc:{id}") entra come dato associato (AAD):
//   un valore copiato in un'altra riga o colonna non si decifra.
// Senza DATA_ENCRYPTION_KEY i dati cifrati non si recuperano: va conservata anche nel password manager.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from './auth.js'

const MASTER_VERSION = 1
const DEK_AAD = 'emovere-dek'

function masterKey(): Buffer {
  const key = Buffer.from(env('DATA_ENCRYPTION_KEY'), 'base64')
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY deve contenere 32 byte in base64')
  return key
}

function seal(key: Buffer, plain: Buffer, aad: string): { iv: string; data: string } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const data = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()])
  return { iv: iv.toString('base64'), data: data.toString('base64') }
}

function open(key: Buffer, iv: string, data: string, aad: string): Buffer {
  const raw = Buffer.from(data, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(raw.subarray(raw.length - 16))
  return Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()])
}

/** Nuova chiave dati per un centro, già cifrata con la chiave principale. */
export function newWrappedDek(): string {
  const { iv, data } = seal(masterKey(), randomBytes(32), DEK_AAD)
  return `kv${MASTER_VERSION}:${iv}:${data}`
}

export function unwrapDek(wrapped: string): Buffer {
  const [version, iv, data] = wrapped.split(':')
  if (version !== `kv${MASTER_VERSION}` || !iv || !data) throw new Error('Chiave dati del centro in un formato sconosciuto')
  return open(masterKey(), iv, data, DEK_AAD)
}

export function encryptField(dek: Buffer, text: string, context: string, keyVersion = 1): string {
  const { iv, data } = seal(dek, Buffer.from(text, 'utf8'), context)
  return `ev1:${keyVersion}:${iv}:${data}`
}

export function decryptField(dek: Buffer, value: string, context: string): string {
  const [format, , iv, data] = value.split(':')
  if (format !== 'ev1' || !iv || !data) throw new Error('Campo cifrato in un formato sconosciuto')
  return open(dek, iv, data, context).toString('utf8')
}
