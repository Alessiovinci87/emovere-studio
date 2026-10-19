import { useRef, useState } from 'react'
import { GOAL_STATUSES, goalStatusInfo } from '../../config/profile'
import type { Goal } from '../../lib/childApi'
import { statuses } from '../../lib/sheet'
import type { Sheet, SheetStatus } from '../../types'
import { Modal } from '../Modal'
import { SheetCard } from '../SheetCard'
import { Button } from '../ui'
import { ErrorText } from './ProfileTab'

// Materiali del bambino raggruppati per obiettivo (una scheda collegata a due obiettivi compare in entrambi)
// o per stato. Il pulsante "Obiettivi" di ogni scheda collega o scollega gli obiettivi del bambino.

type Grouping = 'obiettivo' | 'stato'
const GROUPING_KEY = 'emovere.childMaterials.grouping'

export interface SheetActions {
  onOpen: (id: string) => void
  onStatus: (id: string, status: SheetStatus) => void
  onDuplicate: (id: string) => void
  onMove: (id: string) => void
  onDelete: (id: string) => void
}

interface Props {
  sheets: Sheet[]
  goals: Goal[]
  /** id scheda → obiettivi collegati (null = non ancora letti dal server) */
  links: Map<string, string[]> | null
  actions: SheetActions
  onNewSheet: () => void
  /** Collega gli obiettivi; se la scheda si sta ancora salvando aspetta (onWaiting), `signal` annulla */
  onSetGoals: (sheet: Sheet, goalIds: string[], signal: AbortSignal, onWaiting: () => void) => Promise<void>
  /** Schede senza bambino: solo per stato, senza obiettivi */
  generic?: boolean
}

export function MaterialsTab({ sheets, goals, links, actions, onNewSheet, onSetGoals, generic }: Props) {
  const [chosenGrouping, setGrouping] = useState<Grouping>(() => {
    try {
      return localStorage.getItem(GROUPING_KEY) === 'stato' ? 'stato' : 'obiettivo'
    } catch {
      return 'obiettivo'
    }
  })
  const grouping: Grouping = generic ? 'stato' : chosenGrouping
  const [linking, setLinking] = useState<Sheet | null>(null)
  const sorted = [...sheets].sort((a, b) => b.updatedAt - a.updatedAt)
  const goalIdsOf = (id: string) => (links?.get(id) ?? []).filter((g) => goals.some((x) => x.id === g))

  function choose(value: Grouping) {
    setGrouping(value)
    try {
      localStorage.setItem(GROUPING_KEY, value)
    } catch {
      // solo comodità
    }
  }

  const groups: { key: string; title: string; dot?: string; note?: string; sheets: Sheet[] }[] =
    grouping === 'stato'
      ? statuses.map((s) => ({ key: s.id, title: s.label, dot: s.color, sheets: sorted.filter((sh) => sh.status === s.id) })).filter((g) => g.sheets.length > 0)
      : [
          ...GOAL_STATUSES.flatMap((status) =>
            goals
              .filter((g) => g.status === status.id)
              .map((g) => ({
                key: g.id,
                title: g.title,
                dot: status.color,
                note: status.id === 'attivo' ? undefined : status.label,
                sheets: sorted.filter((s) => goalIdsOf(s.id).includes(g.id)),
              }))
              // Gli obiettivi attivi si vedono anche senza schede; gli altri solo se ne hanno
              .filter((g) => status.id === 'attivo' || g.sheets.length > 0),
          ),
          { key: '__senza', title: 'Senza obiettivo', sheets: sorted.filter((s) => goalIdsOf(s.id).length === 0) },
        ].filter((g) => g.key !== '__senza' || g.sheets.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {generic ? (
          <p className="max-w-xl text-sm leading-relaxed text-muted">
            Schede generiche, senza riferimenti a un bambino: si possono usare con più bambini. Con “Sposta” entrano nella
            cartella di un bambino.
          </p>
        ) : (
        <div role="radiogroup" aria-label="Raggruppa" className="inline-flex rounded-full border border-line bg-white p-1">
          {(['obiettivo', 'stato'] as const).map((g) => (
            <button
              key={g}
              role="radio"
              aria-checked={grouping === g}
              onClick={() => choose(g)}
              className={`min-h-9 rounded-full px-4 text-sm font-bold transition ${grouping === g ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
            >
              Per {g}
            </button>
          ))}
        </div>
        )}
        {!generic && (
          <span className="text-sm text-muted">
            {sheets.length} {sheets.length === 1 ? 'scheda' : 'schede'}
          </span>
        )}
      </div>

      {sheets.length === 0 && (
        <div className="rounded-3xl bg-sand/60 px-6 py-12 text-center text-muted">
          {generic ? 'Nessuna scheda senza bambino.' : 'Ancora nessuna scheda per questo bambino.'}{' '}
          <button onClick={onNewSheet} className="font-bold text-accent underline">
            Creane una
          </button>
        </div>
      )}
      {sheets.length > 0 && grouping === 'obiettivo' && goals.length === 0 && (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-muted shadow-sm">
          Nessun obiettivo ancora: crealo nella scheda Obiettivi, poi collega qui le schede con “Obiettivi”.
        </p>
      )}

      {sheets.length > 0 &&
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-3">
            <h3 className="flex flex-wrap items-center gap-2 font-bold">
              {g.dot ? <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: g.dot }} /> : null}
              {g.title}
              {g.note && <span className="text-xs font-bold text-muted">· {g.note}</span>}
              <span className="text-sm font-normal text-muted">({g.sheets.length})</span>
            </h3>
            {g.sheets.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Nessuna scheda collegata.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {g.sheets.map((sheet) => (
                  <SheetCard
                    key={sheet.id}
                    sheet={sheet}
                    onOpen={() => actions.onOpen(sheet.id)}
                    onStatus={(status) => actions.onStatus(sheet.id, status)}
                    onDuplicate={() => actions.onDuplicate(sheet.id)}
                    onMove={() => actions.onMove(sheet.id)}
                    onDelete={() => {
                      if (confirm(`Spostare nel cestino la scheda “${sheet.title || 'Senza titolo'}”? Si può ripristinare dal cestino per 30 giorni.`))
                        actions.onDelete(sheet.id)
                    }}
                    goals={links ? { count: goalIdsOf(sheet.id).length, onEdit: () => setLinking(sheet) } : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        ))}

      {linking && (
        <LinkGoalsDialog
          sheet={linking}
          goals={goals}
          initial={goalIdsOf(linking.id)}
          onClose={() => setLinking(null)}
          onSave={async (ids, signal, onWaiting) => {
            await onSetGoals(linking, ids, signal, onWaiting)
            setLinking(null)
          }}
        />
      )}
    </div>
  )
}

function LinkGoalsDialog({
  sheet,
  goals,
  initial,
  onSave,
  onClose,
}: {
  sheet: Sheet
  goals: Goal[]
  initial: string[]
  onSave: (ids: string[], signal: AbortSignal, onWaiting: () => void) => Promise<void>
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial))
  const [busy, setBusy] = useState(false)
  /** La scheda si sta ancora salvando: si aspetta, "Annulla" smette di aspettare */
  const [waiting, setWaiting] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const [error, setError] = useState<string | null>(null)
  function cancel() {
    controller.current?.abort()
    onClose()
  }
  const ordered = GOAL_STATUSES.flatMap((s) => goals.filter((g) => g.status === s.id))
  const changed = selected.size !== initial.length || initial.some((id) => !selected.has(id))

  return (
    <Modal title="Obiettivi della scheda" onClose={busy && !waiting ? undefined : cancel} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          “{sheet.title || 'Senza titolo'}”: scegli gli obiettivi a cui serve. Ogni collegamento resta nello storico dell’obiettivo.
        </p>
        {ordered.length === 0 ? (
          <p className="rounded-2xl bg-sand/60 px-4 py-6 text-center text-muted">Il bambino non ha ancora obiettivi.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ordered.map((g) => (
              <li key={g.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-white px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s)
                        if (e.target.checked) next.add(g.id)
                        else next.delete(g.id)
                        return next
                      })
                    }
                    className="h-5 w-5 shrink-0 accent-[#3f74b8]"
                  />
                  <span className="min-w-0 flex-1">{g.title}</span>
                  {g.status !== 'attivo' && <span className="shrink-0 text-xs font-bold text-muted">{goalStatusInfo(g.status).label}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {waiting && (
          <p role="status" className="text-sm font-bold text-muted">
            Aspetto che la scheda sia salvata, poi la collego…
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button disabled={busy && !waiting} onClick={cancel}>
            Annulla
          </Button>
          <Button
            tone="primary"
            disabled={busy || !changed}
            onClick={async () => {
              setBusy(true)
              setError(null)
              controller.current = new AbortController()
              try {
                await onSave([...selected], controller.current.signal, () => setWaiting(true))
              } catch (err) {
                if ((err as Error).name === 'AbortError') return
                setError((err as Error).message)
                setBusy(false)
                setWaiting(false)
              }
            }}
          >
            {waiting ? 'Salvo…' : 'Salva'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
