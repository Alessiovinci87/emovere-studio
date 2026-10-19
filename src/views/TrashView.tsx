import { useCallback, useEffect, useState } from 'react'
import { Page, SectionHeader } from '../components/AppShell'
import { Button } from '../components/ui'
import { KIND_LABELS, TRASH_DAYS, materialsApi, trashDaysLeft, type ServerMaterial } from '../lib/materials'
import { childrenApi, type ServerChild } from '../lib/serverData'

interface Props {
  isOwner: boolean
  onBack: () => void
  /** Dopo un ripristino: i dati dell'app si ricaricano dal server */
  onRestored: (message: string) => void
}

type TrashChild = ServerChild & { counts: Record<string, number> }

/**
 * Cestino: bambini e materiali eliminati negli ultimi 30 giorni. Tutti i membri li ripristinano;
 * l'eliminazione definitiva è del titolare. Dopo 30 giorni la pulizia notturna li elimina da sola.
 */
export function TrashView({ isOwner, onBack, onRestored }: Props) {
  const [children, setChildren] = useState<TrashChild[] | null>(null)
  const [materials, setMaterials] = useState<ServerMaterial[]>([])
  /** Bambini attivi e nel cestino, per mostrare a chi appartiene un materiale */
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [trashed, active, mats] = await Promise.all([childrenApi.trash(), childrenApi.list(), materialsApi.list({ trash: true })])
      setChildren(trashed)
      setMaterials(mats)
      setNames(new Map([...active, ...trashed].map((c) => [c.id, c.pseudonym])))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])
  useEffect(() => void load(), [load])

  const trashedIds = new Set(children?.map((c) => c.id))

  async function act(id: string, run: () => Promise<unknown>, done: string, restored: boolean) {
    setBusy(id)
    setError(null)
    try {
      await run()
      await load()
      if (restored) onRestored(done)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const empty = children !== null && children.length === 0 && materials.length === 0

  return (
    <Page>
      <SectionHeader
        title="Cestino"
        subtitle={`Bambini e materiali eliminati: si possono ripristinare per ${TRASH_DAYS} giorni, poi vengono eliminati per sempre.`}
        onBack={onBack}
      />

      {error && (
        <p role="alert" className="mb-4 rounded-2xl bg-peach-soft px-4 py-3 text-sm font-bold text-[#a2472f]">
          {error}
        </p>
      )}
      {children === null && !error && <p className="text-muted">Caricamento…</p>}
      {empty && <div className="rounded-3xl bg-sand/60 px-6 py-12 text-center text-muted">Il cestino è vuoto.</div>}

      <div className="flex flex-col gap-8">
        {children && children.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Bambini</h2>
            <ul className="flex flex-col gap-3">
              {children.map((c) => {
                const n = Object.values(c.counts).reduce((a, b) => a + b, 0)
                return (
                  <TrashRow
                    key={c.id}
                    title={c.pseudonym}
                    detail={`${c.code} · ${n} ${n === 1 ? 'materiale' : 'materiali'}`}
                    deletedAt={c.deletedAt!}
                    busy={busy === c.id}
                    onRestore={() => void act(c.id, () => childrenApi.restore(c.id), `“${c.pseudonym}” ripristinato`, true)}
                    onDelete={
                      isOwner
                        ? () => {
                            const what = n === 0 ? '' : ` e ${n === 1 ? 'il suo materiale' : `i suoi ${n} materiali`}`
                            if (
                              confirm(
                                `Eliminare per sempre “${c.pseudonym}” (${c.code})${what}, con profilo, obiettivi e osservazioni?\n\nNon si può annullare.`,
                              )
                            )
                              void act(c.id, () => childrenApi.remove(c.id), '', false)
                          }
                        : undefined
                    }
                  />
                )
              })}
            </ul>
          </section>
        )}

        {materials.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Materiali</h2>
            <ul className="flex flex-col gap-3">
              {materials.map((m) => {
                const childTrashed = m.childId !== null && trashedIds.has(m.childId)
                const owner = m.childId ? (names.get(m.childId) ?? 'bambino') : 'senza bambino'
                return (
                  <TrashRow
                    key={m.id}
                    title={m.title || 'Senza titolo'}
                    detail={`${KIND_LABELS[m.kind]} · ${owner}`}
                    deletedAt={m.deletedAt!}
                    busy={busy === m.id}
                    restoreBlocked={childTrashed ? `Ripristina prima “${owner}”` : undefined}
                    onRestore={() =>
                      void act(m.id, () => materialsApi.update(m.id, { trashed: false }).then(check), `“${m.title || 'Scheda'}” ripristinata`, true)
                    }
                    onDelete={
                      isOwner
                        ? () => {
                            if (confirm(`Eliminare per sempre “${m.title || 'Senza titolo'}”, con tutte le sue versioni?\n\nNon si può annullare.`))
                              void act(m.id, () => materialsApi.remove(m.id), '', false)
                          }
                        : undefined
                    }
                  />
                )
              })}
            </ul>
          </section>
        )}

        {!isOwner && !empty && children !== null && (
          <p className="text-sm text-muted">L’eliminazione definitiva prima dei {TRASH_DAYS} giorni è riservata al titolare.</p>
        )}
      </div>
    </Page>
  )
}

/** materialsApi.update non lancia errori: qui si trasformano in eccezioni */
function check(result: Awaited<ReturnType<typeof materialsApi.update>>) {
  if (result.kind === 'retry' || result.kind === 'error') throw new Error(result.message)
}

function TrashRow({
  title,
  detail,
  deletedAt,
  busy,
  restoreBlocked,
  onRestore,
  onDelete,
}: {
  title: string
  detail: string
  deletedAt: string
  busy: boolean
  restoreBlocked?: string
  onRestore: () => void
  onDelete?: () => void
}) {
  const days = trashDaysLeft(deletedAt)
  const when = new Date(deletedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white px-5 py-4 shadow-sm">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold">{title}</span>
        <span className="text-sm text-muted">{detail}</span>
        <span className="text-xs text-muted">
          Eliminato il {when} · {days === 0 ? 'si elimina stanotte' : `si elimina da solo tra ${days} ${days === 1 ? 'giorno' : 'giorni'}`}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {restoreBlocked ? (
          <span className="text-xs font-bold text-muted">{restoreBlocked}</span>
        ) : (
          <Button small tone="soft" disabled={busy} onClick={onRestore}>
            Ripristina
          </Button>
        )}
        {onDelete && (
          <Button small tone="danger" disabled={busy} onClick={onDelete}>
            Elimina per sempre
          </Button>
        )}
      </span>
    </li>
  )
}
