import { useId, useState } from 'react'
import { GOAL_AREAS, GOAL_STATUSES, goalStatusInfo, type GoalArea, type GoalStatus } from '../../config/profile'
import { childApi, longDate, type Goal, type GoalEvent } from '../../lib/childApi'
import { Modal } from '../Modal'
import { Button, PrivacyNote, inputClass } from '../ui'
import { ErrorText } from './ProfileTab'

// Obiettivi del bambino: attivi, raggiunti, archiviati. Ogni cambio di stato (con nota), ogni nota e ogni
// collegamento di una scheda restano nello storico, che non si modifica.

interface Props {
  childId: string
  goals: Goal[]
  isOwner: boolean
  /** Numero di schede collegate a ogni obiettivo */
  linkedCount: (goalId: string) => number
  onGoals: (update: (list: Goal[]) => Goal[]) => void
  /** Flusso guidato "Nuovo materiale" con questo obiettivo già scelto */
  onNewMaterial: (goalId: string) => void
}

export function GoalsTab({ childId, goals, isOwner, linkedCount, onGoals, onNewMaterial }: Props) {
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Record<GoalStatus, boolean>>({ attivo: true, raggiunto: false, archiviato: false })
  const replace = (goal: Goal) => onGoals((list) => list.map((g) => (g.id === goal.id ? goal : g)))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Un obiettivo raggiunto o archiviato resta consultabile, con il suo storico.</p>
        <Button tone="primary" onClick={() => setCreating(true)}>
          + Nuovo obiettivo
        </Button>
      </div>

      {GOAL_STATUSES.map((status) => {
        const list = goals.filter((g) => g.status === status.id).sort((a, b) => b.startedOn.localeCompare(a.startedOn))
        if (status.id !== 'attivo' && list.length === 0) return null
        return (
          <section key={status.id} className="flex flex-col gap-3">
            <button
              onClick={() => setOpen((o) => ({ ...o, [status.id]: !o[status.id] }))}
              aria-expanded={open[status.id]}
              className="flex items-center gap-2 self-start font-bold"
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color }} />
              {status.group}
              <span className="text-sm font-normal text-muted">({list.length})</span>
              <span aria-hidden="true" className="text-muted">
                {open[status.id] ? '▾' : '▸'}
              </span>
            </button>
            {open[status.id] &&
              (list.length === 0 ? (
                <div className="rounded-3xl bg-sand/60 px-6 py-8 text-center text-muted">
                  Nessun obiettivo attivo.{' '}
                  <button onClick={() => setCreating(true)} className="font-bold text-accent underline">
                    Aggiungine uno
                  </button>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {list.map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      linked={linkedCount(g.id)}
                      isOwner={isOwner}
                      onChange={replace}
                      onRemoved={() => onGoals((l) => l.filter((x) => x.id !== g.id))}
                      onNewMaterial={() => onNewMaterial(g.id)}
                    />
                  ))}
                </ul>
              ))}
          </section>
        )
      })}

      {creating && (
        <GoalDialog
          title="Nuovo obiettivo"
          submitLabel="Crea"
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const goal = await childApi.addGoal({ childId, title: values.title, description: values.description || undefined, area: values.area ?? undefined })
            onGoals((list) => [...list, goal])
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

function GoalCard({
  goal,
  linked,
  isOwner,
  onChange,
  onRemoved,
  onNewMaterial,
}: {
  goal: Goal
  linked: number
  isOwner: boolean
  onChange: (g: Goal) => void
  onRemoved: () => void
  onNewMaterial: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [dialog, setDialog] = useState<'status' | 'note' | 'edit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = goalStatusInfo(goal.status)
  const area = GOAL_AREAS.find((a) => a.id === goal.area)

  return (
    <li className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex items-start justify-between gap-3 text-left">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-bold leading-snug">{goal.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="rounded-full px-2 py-0.5 font-bold text-ink" style={{ backgroundColor: status.soft }}>
              {status.label}
            </span>
            {area && <span>{area.label}</span>}
            <span>dal {longDate(goal.startedOn)}</span>
            {goal.closedOn && <span>· chiuso il {longDate(goal.closedOn)}</span>}
            <span>
              · {linked} {linked === 1 ? 'materiale' : 'materiali'}
            </span>
          </span>
        </span>
        <span aria-hidden="true" className="text-muted">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <>
          {goal.description && <p className="whitespace-pre-wrap text-sm leading-relaxed">{goal.description}</p>}
          <div className="flex flex-wrap gap-2">
            {goal.status === 'attivo' && (
              <Button small tone="primary" onClick={onNewMaterial}>
                Nuovo materiale per questo obiettivo
              </Button>
            )}
            <Button small tone="soft" onClick={() => setDialog('status')}>
              Cambia stato
            </Button>
            <Button small onClick={() => setDialog('note')}>
              Aggiungi nota
            </Button>
            <Button small onClick={() => setDialog('edit')}>
              Modifica
            </Button>
            {isOwner && (
              <Button
                small
                tone="danger"
                onClick={async () => {
                  if (!confirm(`Eliminare per sempre l’obiettivo “${goal.title}” con il suo storico?\n\nSe non serve più, puoi archiviarlo.`)) return
                  try {
                    await childApi.removeGoal(goal.id)
                    onRemoved()
                  } catch (err) {
                    setError((err as Error).message)
                  }
                }}
              >
                Elimina
              </Button>
            )}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <History events={goal.events} />
        </>
      )}

      {dialog === 'status' && (
        <StatusDialog
          goal={goal}
          onClose={() => setDialog(null)}
          onSubmit={async (to, note) => {
            onChange(await childApi.updateGoal(goal.id, { status: to, ...(note ? { note } : {}) }))
            setDialog(null)
          }}
        />
      )}
      {dialog === 'note' && (
        <NoteDialog
          onClose={() => setDialog(null)}
          onSubmit={async (note) => {
            onChange(await childApi.updateGoal(goal.id, { note }))
            setDialog(null)
          }}
        />
      )}
      {dialog === 'edit' && (
        <GoalDialog
          title="Modifica obiettivo"
          submitLabel="Salva"
          initial={goal}
          onClose={() => setDialog(null)}
          onSubmit={async (values) => {
            onChange(await childApi.updateGoal(goal.id, { title: values.title, description: values.description || null, area: values.area }))
            setDialog(null)
          }}
        />
      )}
    </li>
  )
}

/** Storico dal più recente */
function History({ events }: { events: GoalEvent[] }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line/70 pt-3">
      <h4 className="text-sm font-bold">Storico</h4>
      <ol className="flex flex-col gap-2">
        {[...events].reverse().map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <time dateTime={e.createdAt} className="w-24 shrink-0 text-xs font-bold text-muted">
              {new Date(e.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
            </time>
            <span className="min-w-0">
              {eventLabel(e)}
              {e.note && <span className="mt-0.5 block whitespace-pre-wrap text-muted">“{e.note}”</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function eventLabel(e: GoalEvent): string {
  switch (e.kind) {
    case 'creato':
      return 'Obiettivo creato'
    case 'stato':
      return `Stato: ${e.fromStatus ? goalStatusInfo(e.fromStatus).label.toLowerCase() : '—'} → ${e.toStatus ? goalStatusInfo(e.toStatus).label.toLowerCase() : '—'}`
    case 'nota':
      return 'Nota'
    case 'materiale':
      return `${e.materialAction === 'collegato' ? 'Collegata' : 'Scollegata'} la scheda “${e.materialTitle ?? 'Senza titolo'}”${e.materialId ? '' : ' (eliminata)'}`
  }
}

function GoalDialog({
  title,
  submitLabel,
  initial,
  onSubmit,
  onClose,
}: {
  title: string
  submitLabel: string
  initial?: Goal
  onSubmit: (values: { title: string; description: string; area: GoalArea | null }) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [area, setArea] = useState<GoalArea | ''>(initial?.area ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleNote = useId()
  const descNote = useId()

  return (
    <Modal title={title} onClose={busy ? undefined : onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!text.trim()) return
          setBusy(true)
          setError(null)
          try {
            await onSubmit({ title: text.trim(), description: description.trim(), area: area || null })
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Obiettivo</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            autoFocus
            placeholder="Es. Aspettare il proprio turno nel gioco"
            aria-describedby={titleNote}
            className={inputClass}
          />
          <PrivacyNote id={titleNote} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Descrizione (facoltativa)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Comportamento osservabile, contesto, come capire che è raggiunto"
            aria-describedby={descNote}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <PrivacyNote id={descNote} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Area (facoltativa)</span>
          <select value={area} onChange={(e) => setArea(e.target.value as GoalArea | '')} className={inputClass}>
            <option value="">Nessuna</option>
            {GOAL_AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" tone="primary" disabled={busy || !text.trim()}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function StatusDialog({ goal, onSubmit, onClose }: { goal: Goal; onSubmit: (to: GoalStatus, note: string) => Promise<void>; onClose: () => void }) {
  const [to, setTo] = useState<GoalStatus>(goal.status === 'attivo' ? 'raggiunto' : 'attivo')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const name = useId()

  return (
    <Modal title="Cambia stato" onClose={busy ? undefined : onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await onSubmit(to, note.trim())
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <p className="text-sm text-muted">“{goal.title}” è {goalStatusInfo(goal.status).label.toLowerCase()}.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Nuovo stato</legend>
          {GOAL_STATUSES.filter((s) => s.id !== goal.status).map((s) => (
            <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-white px-4">
              <input type="radio" name={name} checked={to === s.id} onChange={() => setTo(s.id)} className="h-4 w-4 accent-[#3f74b8]" />
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="font-bold">{s.label}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Nota (facoltativa)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Perché cambia: cosa è stato osservato"
            aria-describedby={noteId}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <PrivacyNote id={noteId} />
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" tone="primary" disabled={busy}>
            Cambia stato
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function NoteDialog({ onSubmit, onClose }: { onSubmit: (note: string) => Promise<void>; onClose: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()

  return (
    <Modal title="Aggiungi nota" onClose={busy ? undefined : onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!note.trim()) return
          setBusy(true)
          setError(null)
          try {
            await onSubmit(note.trim())
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Nota</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
            aria-describedby={noteId}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <PrivacyNote id={noteId} />
          <span className="text-xs text-muted">Resta nello storico dell’obiettivo e non si modifica.</span>
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={busy} onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" tone="primary" disabled={busy || !note.trim()}>
            Aggiungi
          </Button>
        </div>
      </form>
    </Modal>
  )
}
