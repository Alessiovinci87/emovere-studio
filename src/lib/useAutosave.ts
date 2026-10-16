import { useCallback, useEffect, useRef, useState } from 'react'
import { materialsApi, type ServerMaterial } from './materials'

// Salvataggio automatico di un materiale sul server, con controllo di revisione.
// - Ogni modifica si salva da sola dopo una breve pausa, indicando la revisione da cui si è partiti.
// - Senza rete (o server momentaneamente giù) le modifiche restano in attesa nel browser
//   ("Non salvato, riprovo…") e si salvano appena possibile, anche dopo una ricarica della pagina.
// - Se sul server la revisione è cambiata (altro dispositivo, altra persona) non vince nessuno da solo:
//   si sceglie tra la propria versione, quella salvata, o salvare la propria come copia.

export interface Draft {
  title: string
  content: Record<string, unknown>
}

export type SyncStatus =
  | { state: 'saved' }
  | { state: 'saving' }
  | { state: 'waiting'; message: string }
  | { state: 'error'; message: string }
  | { state: 'conflict'; current: ServerMaterial }

const PENDING_KEY = 'emovere.pending.v1'
const DEBOUNCE_MS = 800
const RETRY_MS = 5000

interface Pending extends Draft {
  baseRevision: number
  savedAt: number
}

function readPending(): Record<string, Pending> {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as Record<string, Pending>
  } catch {
    return {}
  }
}

function writePending(id: string, pending: Pending | null) {
  try {
    const all = readPending()
    if (pending) all[id] = pending
    else delete all[id]
    localStorage.setItem(PENDING_KEY, JSON.stringify(all))
  } catch {
    // spazio esaurito o storage non disponibile: resta solo in memoria
  }
}

/** Modifiche in attesa per un materiale (es. per segnalarle negli elenchi) */
export function hasPending(id: string): boolean {
  return id in readPending()
}

export function useAutosave(initial: ServerMaterial) {
  const pending = readPending()[initial.id]
  const [server, setServer] = useState(initial)
  const [draft, setDraftState] = useState<Draft>(() => (pending ? { title: pending.title, content: pending.content } : { title: initial.title, content: initial.content }))
  const [status, setStatus] = useState<SyncStatus>(
    pending ? { state: 'waiting', message: 'Modifiche in attesa di salvataggio.' } : { state: 'saved' },
  )

  // Stato letto dalle operazioni asincrone
  const draftRef = useRef(draft)
  const baseRevision = useRef(pending ? pending.baseRevision : initial.revision)
  const dirty = useRef(!!pending)
  const edits = useRef(0)
  const inFlight = useRef(false)
  const blocked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (!dirty.current || inFlight.current || blocked.current) return
    inFlight.current = true
    const sentEdits = edits.current
    const sent = draftRef.current
    setStatus({ state: 'saving' })
    const result = await materialsApi.save(initial.id, baseRevision.current, { title: sent.title, content: sent.content })
    inFlight.current = false
    switch (result.kind) {
      case 'saved':
        setServer(result.material)
        baseRevision.current = result.material.revision
        if (sentEdits === edits.current) {
          dirty.current = false
          writePending(initial.id, null)
          setStatus({ state: 'saved' })
        } else {
          // Modifiche arrivate durante il salvataggio: si salvano subito dopo
          writePending(initial.id, { ...draftRef.current, baseRevision: baseRevision.current, savedAt: Date.now() })
          timer.current = setTimeout(() => void flush(), 0)
        }
        break
      case 'conflict':
        blocked.current = true
        setStatus({ state: 'conflict', current: result.current })
        break
      case 'retry':
        setStatus({ state: 'waiting', message: result.message })
        timer.current = setTimeout(() => void flush(), RETRY_MS)
        break
      case 'error':
        setStatus({ state: 'error', message: result.message })
        break
    }
  }, [initial.id])

  const setDraft = useCallback(
    (update: (draft: Draft) => Draft) => {
      const next = update(draftRef.current)
      draftRef.current = next
      setDraftState(next)
      dirty.current = true
      edits.current++
      writePending(initial.id, { ...next, baseRevision: baseRevision.current, savedAt: Date.now() })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS)
    },
    [flush, initial.id],
  )

  // Modifiche rimaste in attesa da una sessione precedente: si prova subito
  useEffect(() => {
    if (dirty.current) void flush()
    const online = () => void flush()
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('online', online)
      clearTimeout(timer.current)
      // Uscendo dall'editor si prova un ultimo salvataggio (se fallisce, resta in attesa nel browser)
      void flush()
    }
  }, [flush])

  /** Conflitto: tenere la propria versione, quella salvata, oppure salvare la propria come copia (restituita). */
  const resolve = useCallback(
    async (choice: 'mine' | 'theirs' | 'copy'): Promise<ServerMaterial | null> => {
      if (status.state !== 'conflict') return null
      const current = status.current
      blocked.current = false
      if (choice === 'mine') {
        baseRevision.current = current.revision
        setServer(current)
        dirty.current = true
        await flush()
        return null
      }
      let copy: ServerMaterial | null = null
      if (choice === 'copy') {
        const created = await materialsApi.create({
          childId: current.childId,
          kind: current.kind,
          title: `${draftRef.current.title} (copia)`.slice(0, 200),
          content: draftRef.current.content,
        })
        copy = created.material
      }
      // La versione salvata diventa quella aperta
      draftRef.current = { title: current.title, content: current.content }
      setDraftState(draftRef.current)
      baseRevision.current = current.revision
      setServer(current)
      dirty.current = false
      writePending(initial.id, null)
      setStatus({ state: 'saved' })
      return copy
    },
    [flush, initial.id, status],
  )

  return { draft, setDraft, server, status, flush, resolve }
}

/** Testo breve dello stato, per la barra in alto */
export function syncLabel(status: SyncStatus): string {
  switch (status.state) {
    case 'saved':
      return 'Salvata'
    case 'saving':
      return 'Salvo…'
    case 'waiting':
      return 'Non salvato, riprovo…'
    case 'error':
      return 'Non salvato'
    case 'conflict':
      return 'Modificata altrove'
  }
}
