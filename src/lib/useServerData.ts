import { useCallback, useEffect, useRef, useState } from 'react'
import { loadServerData } from './serverData'
import { ServerSync, type SyncStatus } from './sync'
import type { Sheet, StoreData } from '../types'

/** Cartelle e schede del centro, dal server, con salvataggio automatico (vedi sync.ts). */
export function useServerData(orgId: string) {
  const [data, setDataState] = useState<StoreData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<SyncStatus>({ state: 'saved', message: null, conflicts: new Map() })
  const engine = useRef<ServerSync | null>(null)
  const storageKey = `emovere.sync.v1:${orgId}`

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const server = await loadServerData()
      const restored = ServerSync.restore(storageKey, server.data, server.revisions)
      engine.current?.dispose()
      engine.current = new ServerSync(storageKey, server.data, restored.revisions, restored.desired, setStatus)
      setDataState(restored.desired)
      engine.current.flushSoon(0)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [storageKey])

  useEffect(() => {
    void load()
    return () => engine.current?.dispose()
  }, [load])

  // Chiudendo la pagina con modifiche non salvate (restano comunque nel browser)
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (engine.current?.hasPending()) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const setData = useCallback((update: StoreData | ((d: StoreData) => StoreData)) => {
    setDataState((prev) => {
      if (!prev) return prev
      const next = typeof update === 'function' ? update(prev) : update
      engine.current?.update(next)
      return next
    })
  }, [])

  /** Conflitto su una scheda: tenere la propria, prendere quella del server, o salvare la propria come copia. */
  const resolveConflict = useCallback(
    (id: string, choice: 'mine' | 'theirs' | 'copy', makeCopy?: (mine: Sheet) => Sheet) => {
      const sync = engine.current
      if (!sync) return
      if (choice === 'mine') {
        sync.keepMine(id)
        return
      }
      const theirs = sync.takeTheirs(id)
      if (!theirs) return
      setData((d) => {
        const mine = d.sheets.find((s) => s.id === id)
        const sheets = d.sheets.map((s) => (s.id === id ? theirs : s))
        return { ...d, sheets: choice === 'copy' && mine && makeCopy ? [...sheets, makeCopy(mine)] : sheets }
      })
    },
    [setData],
  )

  return { data, setData, status, loadError, reload: load, resolveConflict }
}
