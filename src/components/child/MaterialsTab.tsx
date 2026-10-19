import { useRef, useState } from 'react'
import { GOAL_STATUSES, goalStatusInfo } from '../../config/profile'
import type { Goal } from '../../lib/childApi'
import { normalizeGuide, unconfirmed } from '../../lib/guide'
import type { ServerMaterial } from '../../lib/materials'
import { statuses } from '../../lib/sheet'
import type { Sheet, SheetStatus } from '../../types'
import { Modal } from '../Modal'
import { SheetCard } from '../SheetCard'
import { Button } from '../ui'
import { ErrorText } from './ProfileTab'

// Materiali del bambino (schede e guide) raggruppati per obiettivo (un materiale collegato a due obiettivi compare
// in entrambi) o per stato. Il pulsante "Obiettivi" di ogni materiale collega o scollega gli obiettivi del bambino.

type Grouping = 'obiettivo' | 'stato'
const GROUPING_KEY = 'emovere.childMaterials.grouping'

export interface SheetActions {
  onOpen: (id: string) => void
  onStatus: (id: string, status: SheetStatus) => void
  onDuplicate: (id: string) => void
  onMove: (id: string) => void
  onDelete: (id: string) => void
}

/** Materiale da collegare: le guide sono già sul server, le schede forse si stanno ancora salvando */
interface Linkable {
  id: string
  title: string
  guide: boolean
}

interface Props {
  sheets: Sheet[]
  /** Guide del bambino (dal server) */
  guides?: ServerMaterial[]
  goals: Goal[]
  /** id scheda → obiettivi collegati (null = non ancora letti dal server) */
  links: Map<string, string[]> | null
  actions: SheetActions
  onOpenGuide?: (id: string) => void
  onNewSheet: () => void
  /** Collega gli obiettivi; se la scheda si sta ancora salvando aspetta (onWaiting), `signal` annulla */
  onSetGoals: (item: Linkable, goalIds: string[], signal: AbortSignal, onWaiting: () => void) => Promise<void>
  /** Schede senza bambino: solo per stato, senza obiettivi */
  generic?: boolean
}

export function MaterialsTab({ sheets, guides = [], goals, links, actions, onOpenGuide, onNewSheet, onSetGoals, generic }: Props) {
  const [chosenGrouping, setGrouping] = useState<Grouping>(() => {
    try {
      return localStorage.getItem(GROUPING_KEY) === 'stato' ? 'stato' : 'obiettivo'
    } catch {
      return 'obiettivo'
    }
  })
  const grouping: Grouping = generic ? 'stato' : chosenGrouping
  const [linking, setLinking] = useState<Linkable | null>(null)
  const sorted = [...sheets].sort((a, b) => b.updatedAt - a.updatedAt)
  const sortedGuides = [...guides].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const total = sheets.length + guides.length
  const goalIdsOf = (id: string) => (links?.get(id) ?? []).filter((g) => goals.some((x) => x.id === g))

  function choose(value: Grouping) {
    setGrouping(value)
    try {
      localStorage.setItem(GROUPING_KEY, value)
    } catch {
      // solo comodità
    }
  }

  const groups: { key: string; title: string; dot?: string; note?: string; sheets: Sheet[]; guides: ServerMaterial[] }[] =
    grouping === 'stato'
      ? statuses
          .map((s) => ({
            key: s.id,
            title: s.label,
            dot: s.color,
            sheets: sorted.filter((sh) => sh.status === s.id),
            guides: sortedGuides.filter((g) => g.status === s.id),
          }))
          .filter((g) => g.sheets.length + g.guides.length > 0)
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
                guides: sortedGuides.filter((m) => goalIdsOf(m.id).includes(g.id)),
              }))
              // Gli obiettivi attivi si vedono anche senza materiali; gli altri solo se ne hanno
              .filter((g) => status.id === 'attivo' || g.sheets.length + g.guides.length > 0),
          ),
          {
            key: '__senza',
            title: 'Senza obiettivo',
            sheets: sorted.filter((s) => goalIdsOf(s.id).length === 0),
            guides: sortedGuides.filter((m) => goalIdsOf(m.id).length === 0),
          },
        ].filter((g) => g.key !== '__senza' || g.sheets.length + g.guides.length > 0)

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
            {total} {total === 1 ? 'materiale' : 'materiali'}
          </span>
        )}
      </div>

      {total === 0 && (
        <div className="rounded-3xl bg-sand/60 px-6 py-12 text-center text-muted">
          {generic ? 'Nessuna scheda senza bambino.' : 'Ancora nessuna scheda per questo bambino.'}{' '}
          <button onClick={onNewSheet} className="font-bold text-accent underline">
            Creane una
          </button>
        </div>
      )}
      {total > 0 && grouping === 'obiettivo' && goals.length === 0 && (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-muted shadow-sm">
          Nessun obiettivo ancora: crealo nella scheda Obiettivi, poi collega qui i materiali con “Obiettivi”.
        </p>
      )}

      {total > 0 &&
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-3">
            <h3 className="flex flex-wrap items-center gap-2 font-bold">
              {g.dot ? <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: g.dot }} /> : null}
              {g.title}
              {g.note && <span className="text-xs font-bold text-muted">· {g.note}</span>}
              <span className="text-sm font-normal text-muted">({g.sheets.length + g.guides.length})</span>
            </h3>
            {g.sheets.length + g.guides.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">Nessun materiale collegato.</p>
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
                    goals={
                      links
                        ? { count: goalIdsOf(sheet.id).length, onEdit: () => setLinking({ id: sheet.id, title: sheet.title, guide: false }) }
                        : undefined
                    }
                  />
                ))}
                {g.guides.map((guide) => (
                  <GuideCard
                    key={guide.id}
                    guide={guide}
                    goals={goalIdsOf(guide.id).length}
                    onOpen={() => onOpenGuide?.(guide.id)}
                    onGoals={() => setLinking({ id: guide.id, title: guide.title, guide: true })}
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

/** Guida per genitori e scuola del bambino: si apre nel suo editor */
function GuideCard({ guide, goals, onOpen, onGoals }: { guide: ServerMaterial; goals: number; onOpen: () => void; onGoals: () => void }) {
  const content = normalizeGuide(guide.content)
  const todo = unconfirmed(content, 'famiglia') + unconfirmed(content, 'scuola')
  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <button onClick={onOpen} className="group flex gap-3 text-left" aria-label={`Apri ${guide.title || 'guida'}`}>
        <span className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-soft text-center text-xs font-bold leading-tight text-accent">
          <span className="text-xl">10</span>
          punti
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-bold group-hover:text-sky">{guide.title || 'Senza titolo'}</span>
          <span className="text-xs text-muted">
            Guida per genitori e scuola · {todo === 0 ? 'tutti i punti confermati' : `${todo} ${todo === 1 ? 'punto' : 'punti'} da rivedere`} ·
            modificata il {new Date(guide.updatedAt).toLocaleDateString('it-IT')}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap gap-1.5">
        <Button small onClick={onGoals} aria-label={`Obiettivi di ${guide.title || 'questa guida'}: ${goals}`}>
          Obiettivi ({goals})
        </Button>
      </div>
    </article>
  )
}

function LinkGoalsDialog({
  sheet,
  goals,
  initial,
  onSave,
  onClose,
}: {
  sheet: Linkable
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
    <Modal title={sheet.guide ? 'Obiettivi della guida' : 'Obiettivi della scheda'} onClose={busy && !waiting ? undefined : cancel} size="sm">
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
