import { useEffect, useId, useMemo, useState } from 'react'
import { OBS_CONTEXTS, PROMPT_LEVELS, promptLabel, promptScore, type ObservationContext, type PromptLevel } from '../../config/observations'
import { observationsApi, type Goal, type Observation, type ObservationInput } from '../../lib/childApi'
import { Modal } from '../Modal'
import { Button, PrivacyNote, inputClass } from '../ui'
import { ErrorText } from './ProfileTab'

// Osservazioni del bambino (specifica, sezione 13): dati registrati (antecedente, comportamento, conseguenza,
// livello di aiuto, frequenza, durata, risposta al materiale) separati da note e interpretazioni.
// L'andamento per obiettivo mostra solo i dati: nessuna conclusione automatica sull'efficacia.

interface Props {
  childId: string
  goals: Goal[]
  /** Schede e guide del bambino, per collegare l'osservazione al materiale usato */
  materials: { id: string; title: string }[]
}

export function ObservationsTab({ childId, goals, materials }: Props) {
  const [list, setList] = useState<Observation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [goalFilter, setGoalFilter] = useState<string>('')
  const [editing, setEditing] = useState<Observation | 'new' | null>(null)

  useEffect(() => {
    let alive = true
    observationsApi
      .list(childId)
      .then((l) => alive && setList(l))
      .catch((err: Error) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [childId])

  const shown = useMemo(
    () => (list ?? []).filter((o) => !goalFilter || (goalFilter === '-' ? !o.goalId : o.goalId === goalFilter)),
    [list, goalFilter],
  )
  const goalTitle = (id: string | null) => goals.find((g) => g.id === id)?.title
  const materialTitle = (id: string | null) => materials.find((m) => m.id === id)?.title

  async function remove(o: Observation) {
    if (!confirm('Eliminare questa osservazione? Non si può annullare.')) return
    try {
      await observationsApi.remove(o.id)
      setList((l) => (l ?? []).filter((x) => x.id !== o.id))
    } catch (err) {
      alert((err as Error).message)
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>
  if (!list) return <p className="text-muted">Caricamento…</p>

  const charted = goals.filter((g) => list.some((o) => o.goalId === g.id && (o.promptLevel || o.frequency !== null)))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          I dati registrati restano separati da note e interpretazioni. L’andamento mostra solo ciò che è stato registrato: le conclusioni sono
          tue.
        </p>
        <Button tone="primary" onClick={() => setEditing('new')}>
          + Nuova osservazione
        </Button>
      </div>

      {charted.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="font-bold">Andamento per obiettivo</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {charted.map((g) => (
              <GoalTrend key={g.id} goal={g} observations={list.filter((o) => o.goalId === g.id)} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">
            Registro <span className="font-normal text-muted">({shown.length})</span>
          </h3>
          {goals.length > 0 && (
            <select value={goalFilter} onChange={(e) => setGoalFilter(e.target.value)} className={`${inputClass} max-w-xs`} aria-label="Filtra per obiettivo">
              <option value="">Tutti gli obiettivi</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
              <option value="-">Senza obiettivo</option>
            </select>
          )}
        </div>
        {shown.length === 0 ? (
          <div className="rounded-3xl bg-sand/60 px-6 py-10 text-center text-muted">
            Nessuna osservazione.{' '}
            <button onClick={() => setEditing('new')} className="font-bold text-accent underline">
              Registra la prima
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((o) => (
              <ObservationCard
                key={o.id}
                observation={o}
                goal={goalTitle(o.goalId)}
                material={materialTitle(o.materialId)}
                onEdit={() => setEditing(o)}
                onRemove={() => void remove(o)}
              />
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <ObservationDialog
          initial={editing === 'new' ? null : editing}
          goals={goals}
          materials={materials}
          defaultGoalId={goalFilter && goalFilter !== '-' ? goalFilter : null}
          onClose={() => setEditing(null)}
          onSubmit={async (input) => {
            const saved = editing === 'new' ? await observationsApi.add(childId, input) : await observationsApi.update(editing.id, input)
            setList((l) => {
              const rest = (l ?? []).filter((x) => x.id !== saved.id)
              return [saved, ...rest].sort((a, b) => b.observedAt.localeCompare(a.observedAt))
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ObservationCard({
  observation: o,
  goal,
  material,
  onEdit,
  onRemove,
}: {
  observation: Observation
  goal?: string
  material?: string
  onEdit: () => void
  onRemove: () => void
}) {
  const data: [string, string | null][] = [
    ['Antecedente', o.antecedent],
    ['Comportamento', o.behavior],
    ['Conseguenza', o.consequence],
    ['Risposta al materiale', o.materialResponse],
  ]
  const measures = [
    o.promptLevel ? promptLabel(o.promptLevel) : null,
    o.frequency !== null ? `${o.frequency} ${o.frequency === 1 ? 'volta' : 'volte'}` : null,
    o.durationSeconds !== null ? formatDuration(o.durationSeconds) : null,
  ].filter(Boolean)
  return (
    <li className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="font-bold">{formatWhen(o.observedAt)}</span>
          <span className="flex flex-wrap gap-x-2 text-xs text-muted">
            {o.context && <span>{OBS_CONTEXTS.find((c) => c.id === o.context)?.label}</span>}
            {goal && <span>· Obiettivo: {goal}</span>}
            {material && <span>· Materiale: {material}</span>}
            {o.authorName && <span>· {o.authorName}</span>}
          </span>
        </div>
        <div className="flex gap-1">
          <Button small onClick={onEdit}>
            Modifica
          </Button>
          {(
            <Button small tone="danger" onClick={onRemove}>
              Elimina
            </Button>
          )}
        </div>
      </div>
      {measures.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {measures.map((m) => (
            <span key={m} className="rounded-full bg-sky-soft px-3 py-1 text-xs font-bold">
              {m}
            </span>
          ))}
        </div>
      )}
      <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        {data
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-bold text-muted">{label}</dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
      </dl>
      {(o.operatorNotes || o.interpretation) && (
        <div className="flex flex-col gap-1 rounded-2xl border border-dashed border-line px-4 py-3 text-sm">
          {o.operatorNotes && (
            <p className="whitespace-pre-wrap">
              <span className="font-bold text-muted">Note: </span>
              {o.operatorNotes}
            </p>
          )}
          {o.interpretation && (
            <p className="whitespace-pre-wrap italic">
              <span className="font-bold not-italic text-muted">Interpretazione · da verificare: </span>
              {o.interpretation}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** Andamento di un obiettivo: livello di aiuto nel tempo (punti) e frequenza (barre), solo i dati registrati */
function GoalTrend({ goal, observations }: { goal: Goal; observations: Observation[] }) {
  const points = [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  const W = 520
  const H = 200
  const left = 118
  const right = 12
  const top = 12
  const bottom = 26
  const plotW = W - left - right
  const plotH = H - top - bottom
  const times = points.map((p) => Date.parse(p.observedAt))
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const x = (t: number) => left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW)
  const y = (score: number) => top + plotH - (score / 5) * plotH
  const scored = points.filter((p) => p.promptLevel).map((p) => ({ t: Date.parse(p.observedAt), s: promptScore(p.promptLevel)! }))
  const freqs = points.filter((p) => p.frequency !== null)
  const maxFreq = Math.max(1, ...freqs.map((p) => p.frequency!))
  // Collegamenti dei materiali all'obiettivo: segnati come linee verticali (le modifiche al materiale nel tempo)
  const marks = goal.events.filter((e) => e.kind === 'materiale' && Date.parse(e.createdAt) >= t0 && Date.parse(e.createdAt) <= t1)

  return (
    <figure className="flex flex-col gap-2 rounded-3xl bg-white p-4 shadow-sm">
      <figcaption className="text-sm font-bold leading-snug">{goal.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Andamento del livello di aiuto per ${goal.title}`}>
        {PROMPT_LEVELS.map((p, i) => (
          <g key={p.id}>
            <line x1={left} x2={W - right} y1={y(i)} y2={y(i)} stroke="#ece6dc" />
            <text x={left - 6} y={y(i) + 4} textAnchor="end" fontSize="11" fill="#7d7686">
              {p.label.replace('Aiuto ', '')}
            </text>
          </g>
        ))}
        {freqs.map((p) => {
          const h = (p.frequency! / maxFreq) * plotH * 0.5
          return <rect key={p.id} x={x(Date.parse(p.observedAt)) - 4} y={top + plotH - h} width={8} height={h} fill="#f2c94c66" rx={2} />
        })}
        {marks.map((e) => (
          <line key={e.id} x1={x(Date.parse(e.createdAt))} x2={x(Date.parse(e.createdAt))} y1={top} y2={top + plotH} stroke="#a58bd6" strokeDasharray="4 3" />
        ))}
        {scored.length > 1 && (
          <polyline points={scored.map((p) => `${x(p.t)},${y(p.s)}`).join(' ')} fill="none" stroke="#3f74b8" strokeWidth="2" />
        )}
        {scored.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.s)} r={4.5} fill="#3f74b8" />
        ))}
        <text x={left} y={H - 6} fontSize="11" fill="#7d7686">
          {shortDate(t0)}
        </text>
        {t1 !== t0 && (
          <text x={W - right} y={H - 6} fontSize="11" fill="#7d7686" textAnchor="end">
            {shortDate(t1)}
          </text>
        )}
      </svg>
      <p className="text-xs text-muted">
        Punti blu: livello di aiuto
        {freqs.length > 0 ? ` · barre gialle: frequenza (massimo ${maxFreq})` : ''}
        {marks.length > 0 ? ' · linee viola: materiale collegato o scollegato' : ''} · {points.length}{' '}
        {points.length === 1 ? 'osservazione' : 'osservazioni'}
      </p>
    </figure>
  )
}

function ObservationDialog({
  initial,
  goals,
  materials,
  defaultGoalId,
  onSubmit,
  onClose,
}: {
  initial: Observation | null
  goals: Goal[]
  materials: { id: string; title: string }[]
  defaultGoalId: string | null
  onSubmit: (input: ObservationInput) => Promise<void>
  onClose: () => void
}) {
  const [when, setWhen] = useState(() => toLocalInput(initial?.observedAt ?? new Date().toISOString()))
  const [context, setContext] = useState<ObservationContext | ''>(initial?.context ?? '')
  const [goalId, setGoalId] = useState(initial?.goalId ?? defaultGoalId ?? '')
  const [materialId, setMaterialId] = useState(initial?.materialId ?? '')
  const [antecedent, setAntecedent] = useState(initial?.antecedent ?? '')
  const [behavior, setBehavior] = useState(initial?.behavior ?? '')
  const [consequence, setConsequence] = useState(initial?.consequence ?? '')
  const [promptLevel, setPromptLevel] = useState<PromptLevel | ''>(initial?.promptLevel ?? '')
  const [frequency, setFrequency] = useState(initial?.frequency?.toString() ?? '')
  const [minutes, setMinutes] = useState(initial?.durationSeconds != null ? String(Math.round((initial.durationSeconds / 60) * 10) / 10) : '')
  const [materialResponse, setMaterialResponse] = useState(initial?.materialResponse ?? '')
  const [operatorNotes, setOperatorNotes] = useState(initial?.operatorNotes ?? '')
  const [interpretation, setInterpretation] = useState(initial?.interpretation ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectableGoals = goals.filter((g) => g.status === 'attivo' || g.id === goalId)

  return (
    <Modal title={initial ? 'Modifica osservazione' : 'Nuova osservazione'} onClose={busy ? undefined : onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault()
          const freq = frequency.trim() === '' ? null : Number(frequency)
          const mins = minutes.trim() === '' ? null : Number(minutes.replace(',', '.'))
          if ((freq !== null && (!Number.isInteger(freq) || freq < 0)) || (mins !== null && (Number.isNaN(mins) || mins < 0))) {
            setError('Frequenza e durata: solo numeri positivi.')
            return
          }
          setBusy(true)
          setError(null)
          try {
            await onSubmit({
              observedAt: new Date(when).toISOString(),
              context: context || null,
              goalId: goalId || null,
              materialId: materialId || null,
              antecedent,
              behavior,
              consequence,
              promptLevel: promptLevel || null,
              frequency: freq,
              durationSeconds: mins === null ? null : Math.round(mins * 60),
              materialResponse,
              operatorNotes,
              interpretation,
            })
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Quando</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Contesto</span>
            <select value={context} onChange={(e) => setContext(e.target.value as ObservationContext | '')} className={inputClass}>
              <option value="">—</option>
              {OBS_CONTEXTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Obiettivo</span>
            <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className={inputClass}>
              <option value="">Nessuno</option>
              {selectableGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Materiale usato</span>
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={inputClass}>
              <option value="">Nessuno</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="flex flex-col gap-4 rounded-3xl bg-white p-4">
          <legend className="px-2 text-sm font-bold">Dati registrati</legend>
          <Text label="Antecedente (cosa è successo prima)" value={antecedent} onChange={setAntecedent} max={2000} />
          <Text label="Comportamento (cosa ha fatto, in modo osservabile)" value={behavior} onChange={setBehavior} max={2000} />
          <Text label="Conseguenza (cosa è successo dopo)" value={consequence} onChange={setConsequence} max={2000} />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 sm:col-span-1">
              <span className="text-sm font-bold">Livello di aiuto</span>
              <select value={promptLevel} onChange={(e) => setPromptLevel(e.target.value as PromptLevel | '')} className={inputClass}>
                <option value="">—</option>
                {[...PROMPT_LEVELS].reverse().map((p) => (
                  <option key={p.id} value={p.id} title={p.hint}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Frequenza (volte)</span>
              <input inputMode="numeric" value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Durata (minuti)</span>
              <input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputClass} />
            </label>
          </div>
          <Text label="Risposta al materiale" value={materialResponse} onChange={setMaterialResponse} max={2000} />
        </fieldset>

        <fieldset className="flex flex-col gap-4 rounded-3xl border border-dashed border-line p-4">
          <legend className="px-2 text-sm font-bold">Note e interpretazioni (separate dai dati)</legend>
          <Text label="Note" value={operatorNotes} onChange={setOperatorNotes} max={4000} />
          <Text label="Interpretazione (ipotesi da verificare)" value={interpretation} onChange={setInterpretation} max={4000} />
        </fieldset>

        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" tone="primary" disabled={busy}>
            {busy ? 'Salvo…' : 'Salva'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Text({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max: number }) {
  const note = useId()
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={max}
        aria-describedby={note}
        className={`${inputClass} resize-y leading-relaxed`}
      />
      <PrivacyNote id={note} />
    </label>
  )
}

/** ISO → valore per <input type="datetime-local"> (ora locale) */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shortDate(t: number): string {
  return new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const m = Math.round((seconds / 60) * 10) / 10
  return `${String(m).replace('.', ',')} min`
}
