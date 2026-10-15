// Versioni "da colorare" delle vignette: elenco e generazione tramite /api/coloring.
import type { Character } from '../types'
import { sceneImage } from './catalog'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new Error('Connessione non riuscita. Controlla internet e riprova.')
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('La versione da colorare si crea solo nella versione online dell’app.')
  }
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Qualcosa non ha funzionato. Riprova.')
  return body as T
}

/** Chiavi "A01_bambina" delle versioni già pronte. In locale (senza /api) restituisce un elenco vuoto. */
export async function fetchColoringKeys(): Promise<Set<string>> {
  try {
    return new Set((await call<{ keys: string[] }>('/api/coloring')).keys)
  } catch {
    return new Set()
  }
}

/**
 * Genera la versione da colorare di una vignetta. Per il catalogo disegnato l'app invia l'immagine
 * (WebP a piena risoluzione); per le vignette AI (X…) il server la legge dal Blob.
 */
export async function requestColoring(code: string, character: Character): Promise<string> {
  let image: string | undefined
  if (!code.startsWith('X')) image = await toDataUrl(sceneImage(code, character, 'web'))
  const { key } = await call<{ key: string }>('/api/coloring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, character, image }),
  })
  return key
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Non è stato possibile leggere la vignetta.'))
    reader.readAsDataURL(blob)
  })
}
