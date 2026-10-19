// Appunti sull'app: chi prova l'app segna problemi, idee e domande sulla schermata in cui si trova.
// Si salva solo il nome della schermata (e un dettaglio come il passo o il modello), mai id o nomi di bambini.
// Il titolare li scarica in Markdown da Impostazioni per chi sviluppa l'app.
import { useEffect, useSyncExternalStore } from 'react'
import { call, send } from './account'
import type { Route } from './router'

export type NoteKind = 'problema' | 'idea' | 'domanda'
export type NoteStatus = 'nuovo' | 'visto' | 'fatto'

export interface AppNote {
  id: string
  author: { id: string; name: string | null }
  mine: boolean
  screen: string
  context: string
  kind: NoteKind
  text: string
  status: NoteStatus
  reply: string | null
  createdAt: string
  updatedAt: string
}

export const NOTE_KINDS: { id: NoteKind; label: string; icon: string }[] = [
  { id: 'problema', label: 'Problema', icon: '⚠️' },
  { id: 'idea', label: 'Idea', icon: '💡' },
  { id: 'domanda', label: 'Domanda', icon: '❓' },
]

export const NOTE_STATUSES: { id: NoteStatus; label: string; className: string }[] = [
  { id: 'nuovo', label: 'Nuovo', className: 'bg-accent-soft text-accent' },
  { id: 'visto', label: 'Visto', className: 'bg-butter text-ink' },
  { id: 'fatto', label: 'Fatto', className: 'bg-[#e3f3ea] text-[#2f6b4f]' },
]

const URL = '/api/organization?resource=notes'

export const notesApi = {
  list: async () => (await call<{ notes: AppNote[] }>(URL)).notes,
  create: async (note: { screen: string; context: string; kind: NoteKind; text: string }) =>
    (await call<{ note: AppNote }>(URL, send('POST', note))).note,
  update: async (id: string, patch: { kind?: NoteKind; text?: string; status?: NoteStatus; reply?: string | null }) =>
    (await call<{ note: AppNote }>(URL, send('PATCH', { id, ...patch }))).note,
  remove: (id: string) => call<{ ok: true }>(`${URL}&id=${encodeURIComponent(id)}`, send('DELETE')),
}

/** Nomi delle schermate (la chiave è quella salvata nell'appunto) */
export const SCREENS: Record<string, string> = {
  oggi: 'Oggi',
  bambini: 'Bambini',
  cartella: 'Cartella del bambino',
  generiche: 'Schede senza bambino',
  cestino: 'Cestino',
  crea: 'Crea',
  libreria: 'Libreria',
  impostazioni: 'Impostazioni',
  scheda: 'Editor della scheda',
  guida: 'Guida per genitori e scuola',
  nuovo: 'Nuovo materiale guidato',
}

export const screenLabel = (screen: string) => SCREENS[screen] ?? screen

/** Schermata di un percorso, senza id */
export function screenOf(route: Route, genericFolderId: string): { screen: string; context: string } {
  if (route.name === 'cartella') {
    if (route.id === genericFolderId) return { screen: 'generiche', context: '' }
    const tab = route.tab ?? 'materiali'
    return { screen: 'cartella', context: tab[0].toUpperCase() + tab.slice(1) }
  }
  return { screen: route.name, context: '' }
}

// Dettaglio della schermata (passo del flusso, modello della scheda…): lo indica la schermata stessa
let detail = ''
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function setDetail(value: string) {
  if (value === detail) return
  detail = value
  listeners.forEach((l) => l())
}

/** Da chiamare nella schermata: il dettaglio vale finché resta aperta */
export function useNoteDetail(value: string) {
  useEffect(() => {
    setDetail(value)
    return () => setDetail('')
  }, [value])
}

export const useCurrentNoteDetail = () => useSyncExternalStore(subscribe, () => detail)

/** Appunti in Markdown, dal più vecchio, per chi sviluppa l'app */
export function notesMarkdown(notes: AppNote[], centerName: string, now = new Date()): string {
  const date = (iso: string) => new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
  const lines = [
    `# Appunti sull'app – ${centerName}`,
    '',
    `Scaricati il ${now.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })} · ${notes.length} appunti`,
    '',
  ]
  for (const n of [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const kind = NOTE_KINDS.find((k) => k.id === n.kind)!
    const where = n.context ? `${screenLabel(n.screen)} · ${n.context}` : screenLabel(n.screen)
    lines.push(`## ${kind.icon} ${kind.label} – ${where}`, '')
    lines.push(`- id: \`${n.id}\``)
    lines.push(`- stato: ${NOTE_STATUSES.find((s) => s.id === n.status)!.label}`)
    lines.push(`- scritto da: ${n.author.name ?? 'persona non più nel centro'}, ${date(n.createdAt)}`)
    lines.push('', ...n.text.split('\n').map((l) => `> ${l}`), '')
    if (n.reply) lines.push('**Risposta:**', '', n.reply, '')
  }
  return lines.join('\n')
}
