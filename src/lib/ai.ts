// Chiamate dell'app alle funzioni /api delle vignette AI.
import type { AiAdult, AiRequest } from '../config/ai'
import type { Scene } from '../types'

export interface AiStatus {
  limit: number
  used: number
  /** Adulti con il foglio di riferimento caricato */
  adults: AiAdult[]
}

export interface AiPreview {
  action: string
  title_f: string
  title_m: string
  tags: string[]
  images: { bambina: string; bambino: string }
  used: number
  limit: number
}

export interface AiSave {
  title_f: string
  title_m: string
  tags: string[]
  setting: string
  outfit: string
  adult: AiAdult | null
  images: { bambina: string; bambino: string }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new Error('Connessione non riuscita. Controlla internet e riprova.')
  }
  const isJson = response.headers.get('content-type')?.includes('application/json')
  if (!isJson) {
    // In locale (npm run dev) le funzioni /api non esistono; online la sessione può essere scaduta
    throw new Error('La creazione con AI funziona solo nella versione online dell’app.')
  }
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Qualcosa non ha funzionato. Riprova.')
  return body as T
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const aiApi = {
  /** Vignette AI salvate, da unire al catalogo. In locale (senza /api) restituisce un elenco vuoto. */
  async scenes(): Promise<Scene[]> {
    try {
      return (await call<{ scenes: Scene[] }>('/api/library')).scenes
    } catch {
      return []
    }
  },
  status: () => call<AiStatus>('/api/generate'),
  generate: (request: AiRequest) => call<AiPreview>('/api/generate', post(request)),
  save: (data: AiSave) => call<{ scene: Scene }>('/api/library', post(data)),
  remove: (code: string) => call<{ deleted: string }>(`/api/library?code=${encodeURIComponent(code)}`, { method: 'DELETE' }),
}
