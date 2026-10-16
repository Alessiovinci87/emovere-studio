// Lettura e controllo dei dati in ingresso. Convenzione nelle modifiche (PATCH):
// campo assente = non cambia; null o testo vuoto = svuota; altrimenti il nuovo valore.
import { UserError } from './http.js'

export type Body = Record<string, unknown>

export async function readBody(request: Request): Promise<Body> {
  const body = (await request.json().catch(() => null)) as unknown
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('Richiesta non valida.')
  return body as Body
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function uuid(value: unknown): string {
  if (!isUuid(value)) throw new UserError('Richiesta non valida.')
  return value
}

/** Testo facoltativo: undefined se assente, null se vuoto. */
export function optText(body: Body, key: string, max: number, label: string): string | null | undefined {
  if (!(key in body)) return undefined
  const value = body[key]
  if (value === null) return null
  if (typeof value !== 'string') throw new UserError('Richiesta non valida.')
  const text = value.trim()
  if (text.length > max) throw new UserError(`${label}: al massimo ${max} caratteri.`)
  return text || null
}

/** Testo obbligatorio (in creazione). */
export function reqText(body: Body, key: string, max: number, label: string): string {
  const text = optText(body, key, max, label)
  if (!text) throw new UserError(`Scrivi ${label.toLowerCase()}.`)
  return text
}

export function optOneOf<T extends string>(body: Body, key: string, values: readonly T[]): T | undefined {
  if (!(key in body)) return undefined
  const value = body[key]
  if (!values.includes(value as T)) throw new UserError('Richiesta non valida.')
  return value as T
}

export function optBool(body: Body, key: string): boolean | undefined {
  if (!(key in body)) return undefined
  if (typeof body[key] !== 'boolean') throw new UserError('Richiesta non valida.')
  return body[key] as boolean
}

/** Data AAAA-MM-GG facoltativa. */
export function optDate(body: Body, key: string): string | null | undefined {
  if (!(key in body)) return undefined
  const value = body[key]
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new UserError('Data non valida.')
  }
  return value
}

/** Uuid facoltativo: undefined se assente, null se esplicitamente vuoto. */
export function optUuid(body: Body, key: string): string | null | undefined {
  if (!(key in body)) return undefined
  if (body[key] === null) return null
  return uuid(body[key])
}

/** Tiene solo i campi presenti (undefined = non cambia). */
export function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Partial<T>
}
