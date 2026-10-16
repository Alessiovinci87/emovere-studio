import { useEffect, useState } from 'react'
import { guideApi, normalizeGuide, unconfirmed } from '../lib/guide'
import type { ServerMaterial } from '../lib/materials'
import { Button } from './ui'

/** Crea → "Guide per genitori e scuola": nuova guida ed elenco delle guide salvate sul server. */
export function GuidesSection({ online, onOpen }: { online: boolean; onOpen: (id: string) => void }) {
  const [guides, setGuides] = useState<ServerMaterial[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!online) return
    guideApi.list().then(setGuides, (err: Error) => setError(err.message))
  }, [online])

  async function create() {
    setCreating(true)
    setError(null)
    try {
      onOpen((await guideApi.create('Nuova guida')).id)
    } catch (err) {
      setError((err as Error).message)
      setCreating(false)
    }
  }

  return (
    <section className="mb-10 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Guide per genitori e scuola</h2>
          <p className="text-sm text-muted">Dalla difficoltà e dall’obiettivo, una bozza in 10 punti da rivedere: versione famiglia e scuola.</p>
        </div>
        <Button tone="primary" disabled={!online || creating} onClick={() => void create()}>
          {creating ? 'Creo…' : '+ Nuova guida'}
        </Button>
      </div>
      {!online && <p className="text-sm text-muted">Le guide si salvano sul server: disponibili nella versione online, dopo l’accesso.</p>}
      {error && (
        <p role="alert" className="text-sm font-bold text-[#a2472f]">
          {error}
        </p>
      )}
      {guides && guides.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {guides.map((g) => {
            const content = normalizeGuide(g.content)
            const todo = unconfirmed(content, 'famiglia') + unconfirmed(content, 'scuola')
            return (
              <li key={g.id}>
                <button
                  onClick={() => onOpen(g.id)}
                  className="flex h-full w-full flex-col gap-1 rounded-3xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="font-bold">{g.title || 'Senza titolo'}</span>
                  <span className="text-sm text-muted">
                    {todo === 0 ? 'Tutti i punti confermati' : `${todo} ${todo === 1 ? 'punto' : 'punti'} da rivedere`} · modificata il{' '}
                    {new Date(g.updatedAt).toLocaleDateString('it-IT')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
