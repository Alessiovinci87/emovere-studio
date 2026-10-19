// Guida per genitori e scuola: materiale di tipo "guida" (/api/materials), generico (da Crea) o di un bambino
// (dal flusso guidato, con le voci del profilo scelte: nel contenuto solo i loro id, mai il testo).
import { emptyGuideInput, GUIDE_POINTS, isGuideInput, type GuideInput, type GuideVersion } from '../config/guide'
import { call, send } from './account'
import { materialsApi, type ServerMaterial } from './materials'

export interface GuidePoint {
  text: string
  /** false = "Da rivedere": ogni testo proposto dall'AI o modificato va confermato */
  confirmed: boolean
}

export interface GuideContent {
  type: 'guida'
  version: 1
  input: GuideInput
  famiglia: GuidePoint[]
  scuola: GuidePoint[]
  /** Ultima proposta dell'AI (ISO), null se mai generata */
  generatedAt: string | null
  /** Solo guide di un bambino: voci del profilo da includere nella richiesta (id) */
  profileIds: string[]
}

/** Bambino e voci del profilo da aggiungere alla richiesta (il server le legge dagli id) */
export interface ProfileRequest {
  childId: string
  profileIds: string[]
}

const emptyPoints = (): GuidePoint[] => GUIDE_POINTS.map(() => ({ text: '', confirmed: false }))

export function emptyGuide(): GuideContent {
  return { type: 'guida', version: 1, input: emptyGuideInput(), famiglia: emptyPoints(), scuola: emptyPoints(), generatedAt: null, profileIds: [] }
}

/** Contenuto letto dal server, completato se manca qualcosa */
export function normalizeGuide(raw: Record<string, unknown>): GuideContent {
  const base = emptyGuide()
  const points = (value: unknown): GuidePoint[] =>
    GUIDE_POINTS.map((_, i) => {
      const p = Array.isArray(value) ? (value[i] as Partial<GuidePoint> | undefined) : undefined
      return { text: typeof p?.text === 'string' ? p.text : '', confirmed: p?.confirmed === true }
    })
  return {
    ...base,
    input: isGuideInput(raw.input) ? raw.input : base.input,
    famiglia: points(raw.famiglia),
    scuola: points(raw.scuola),
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    profileIds: Array.isArray(raw.profileIds) ? raw.profileIds.filter((id): id is string => typeof id === 'string') : [],
  }
}

/** Una versione si esporta solo con tutti i punti scritti e confermati */
export function unconfirmed(guide: GuideContent, version: GuideVersion): number {
  return guide[version].filter((p) => !p.text.trim() || !p.confirmed).length
}

export const guideApi = {
  list: async () => (await materialsApi.list({ generic: true })).filter((m) => m.kind === 'guida'),
  create: async (title: string): Promise<ServerMaterial> =>
    (await materialsApi.create({ kind: 'guida', title, content: emptyGuide() as unknown as Record<string, unknown> })).material,
  propose: (input: GuideInput, profile?: ProfileRequest) =>
    call<{ family: string[]; school: string[] }>('/api/guide', send('POST', { input, ...profile })),
  regeneratePoint: (input: GuideInput, version: GuideVersion, index: number, current: string, profile?: ProfileRequest) =>
    call<{ text: string }>('/api/guide', send('POST', { input, point: { version, index, current }, ...profile })),
}
