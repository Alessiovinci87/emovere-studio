import { useId, useState } from 'react'
import { OTHER_NOTES_SECTION, PROFILE_SECTIONS, PROFILE_SOURCES, sourceInfo, type ProfileSection, type ProfileSource } from '../../config/profile'
import { childApi, longDate, todayDate, type ChildDetail, type ProfileEntry } from '../../lib/childApi'
import { Button, PrivacyNote, inputClass } from '../ui'

// Profilo del bambino: dati di base e voci per sezione, ognuna con la provenienza (osservato, genitori,
// scuola, ipotesi). Le ipotesi sono distinte a colpo d'occhio: bordo tratteggiato, corsivo, "da verificare".

interface Props {
  child: ChildDetail['child']
  entries: ProfileEntry[]
  onChild: (child: ChildDetail['child']) => void
  onEntries: (update: (list: ProfileEntry[]) => ProfileEntry[]) => void
}

export function ProfileTab({ child, entries, onChild, onEntries }: Props) {
  const [filter, setFilter] = useState<ProfileSource | null>(null)
  const sections = entries.some((e) => e.section === 'note') ? [...PROFILE_SECTIONS, OTHER_NOTES_SECTION] : PROFILE_SECTIONS

  return (
    <div className="flex flex-col gap-6">
      <BasicData child={child} onChild={onChild} />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mostra le voci">
        <span className="text-sm font-bold text-muted">Mostra:</span>
        <FilterPill active={filter === null} onClick={() => setFilter(null)}>
          Tutte
        </FilterPill>
        {PROFILE_SOURCES.map((s) => (
          <FilterPill key={s.id} active={filter === s.id} color={s.color} onClick={() => setFilter(filter === s.id ? null : s.id)}>
            {s.short}
          </FilterPill>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            childId={child.id}
            section={section}
            entries={entries.filter((e) => e.section === section.id && (!filter || e.source === filter))}
            filtered={filter !== null}
            onEntries={onEntries}
          />
        ))}
      </div>
    </div>
  )
}

function FilterPill({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition ${
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-white text-muted hover:text-ink'
      }`}
    >
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}

/** Anno di nascita (solo l'anno) e livello di sviluppo di riferimento */
function BasicData({ child, onChild }: { child: ChildDetail['child']; onChild: (c: ChildDetail['child']) => void }) {
  const [editing, setEditing] = useState(false)
  const [year, setYear] = useState(child.birthYear ? String(child.birthYear) : '')
  const [level, setLevel] = useState(child.developmentLevel ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const thisYear = new Date().getFullYear()

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const updated = await childApi.update(child.id, { birthYear: year ? Number(year) : null, developmentLevel: level.trim() || null })
      onChild({ ...child, birthYear: updated.birthYear, developmentLevel: updated.developmentLevel })
      setEditing(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">Dati di base</h3>
        {!editing && (
          <Button small onClick={() => setEditing(true)}>
            Modifica
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="flex flex-col gap-1.5 sm:max-w-xs">
            <span className="text-sm font-bold">Anno di nascita</span>
            <select value={year} onChange={(e) => setYear(e.target.value)} className={inputClass}>
              <option value="">Non indicato</option>
              {Array.from({ length: 16 }, (_, i) => thisYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">Solo l’anno, mai la data completa.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Livello di sviluppo di riferimento</span>
            <textarea
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Es. comprende consegne di due passaggi, si orienta con le immagini"
              aria-describedby={noteId}
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <PrivacyNote id={noteId} />
          </label>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <Button type="submit" tone="primary" disabled={busy}>
              Salva
            </Button>
            <Button type="button" disabled={busy} onClick={() => setEditing(false)}>
              Annulla
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Anno di nascita</dt>
          <dd className="font-bold">{child.birthYear ? `${child.birthYear} (circa ${thisYear - child.birthYear} anni)` : 'Non indicato'}</dd>
          <dt className="text-muted">Livello di sviluppo</dt>
          <dd className="whitespace-pre-wrap">{child.developmentLevel || <span className="text-muted">Non indicato</span>}</dd>
        </dl>
      )}
    </section>
  )
}

function SectionCard({
  childId,
  section,
  entries,
  filtered,
  onEntries,
}: {
  childId: string
  section: { id: ProfileSection; label: string; hint: string }
  entries: ProfileEntry[]
  filtered: boolean
  onEntries: Props['onEntries']
}) {
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const active = entries.filter((e) => !e.archivedAt)
  const archived = entries.filter((e) => e.archivedAt)
  const replace = (entry: ProfileEntry) => onEntries((list) => list.map((e) => (e.id === entry.id ? entry : e)))

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <span className="flex flex-col">
          <h3 className="font-bold">
            {section.label} <span className="text-sm font-normal text-muted">({active.length})</span>
          </h3>
          <span className="text-xs text-muted">{section.hint}</span>
        </span>
        {!adding && (
          <Button small tone="soft" onClick={() => setAdding(true)} aria-label={`Aggiungi a ${section.label}`} className="shrink-0 whitespace-nowrap">
            + Aggiungi
          </Button>
        )}
      </header>

      {active.length === 0 && !adding && (
        <p className="text-sm text-muted">{filtered ? 'Nessuna voce con questa provenienza.' : 'Ancora nessuna informazione.'}</p>
      )}
      <ul className="flex flex-col gap-2">
        {active.map((e) => (
          <EntryItem key={e.id} entry={e} onChange={replace} onRemove={() => onEntries((list) => list.filter((x) => x.id !== e.id))} />
        ))}
      </ul>

      {adding && (
        <EntryForm
          submitLabel="Aggiungi"
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            const entry = await childApi.addEntry({ childId, section: section.id, ...values })
            onEntries((list) => [...list, entry])
            setAdding(false)
          }}
        />
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <button onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className="self-start text-sm font-bold text-muted hover:text-ink">
            Archiviate ({archived.length}) {showArchived ? '▾' : '▸'}
          </button>
          {showArchived && (
            <ul className="flex flex-col gap-2 opacity-75">
              {archived.map((e) => (
                <EntryItem key={e.id} entry={e} onChange={replace} onRemove={() => onEntries((list) => list.filter((x) => x.id !== e.id))} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

export function SourceChip({ source }: { source: ProfileSource }) {
  const info = sourceInfo(source)
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${source === 'ipotesi' ? 'border border-dashed' : ''}`}
      style={{ backgroundColor: info.soft, color: info.color, borderColor: info.color }}
    >
      <span
        className={`h-2 w-2 rounded-full ${source === 'ipotesi' ? 'border-[1.5px] border-current' : ''}`}
        style={{ backgroundColor: source === 'ipotesi' ? 'transparent' : info.color }}
      />
      {info.label}
    </span>
  )
}

function EntryItem({ entry, onChange, onRemove }: { entry: ProfileEntry; onChange: (e: ProfileEntry) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hypothesis = entry.source === 'ipotesi'

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <li>
        <EntryForm
          initial={entry}
          submitLabel="Salva"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            onChange(await childApi.updateEntry(entry.id, values))
            setEditing(false)
          }}
        />
      </li>
    )
  }

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl px-4 py-3 ${hypothesis ? 'border-2 border-dashed' : 'border border-line bg-cream/60'}`}
      style={hypothesis ? { borderColor: sourceInfo('ipotesi').color, backgroundColor: sourceInfo('ipotesi').soft } : undefined}
    >
      <p className={`whitespace-pre-wrap leading-relaxed ${hypothesis ? 'italic' : ''}`}>{entry.text}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <SourceChip source={entry.source} />
          <span className="text-xs text-muted">{longDate(entry.recordedOn)}</span>
        </span>
        <span className="flex flex-wrap gap-1">
          <Button small disabled={busy} onClick={() => setEditing(true)}>
            Modifica
          </Button>
          <Button
            small
            disabled={busy}
            onClick={() => void run(async () => onChange(await childApi.updateEntry(entry.id, { archived: !entry.archivedAt })))}
          >
            {entry.archivedAt ? 'Ripristina' : 'Archivia'}
          </Button>
          <Button
            small
            tone="danger"
            disabled={busy}
            onClick={() => {
              if (confirm('Eliminare questa voce del profilo? Se è solo superata, puoi archiviarla.'))
                void run(async () => {
                  await childApi.removeEntry(entry.id)
                  onRemove()
                })
            }}
          >
            Elimina
          </Button>
        </span>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </li>
  )
}

/** Nuova voce o modifica: testo, provenienza (scelta obbligatoria) e data */
function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ProfileEntry
  submitLabel: string
  onSubmit: (values: { text: string; source: ProfileSource; recordedOn: string }) => Promise<void>
  onCancel: () => void
}) {
  const [text, setText] = useState(initial?.text ?? '')
  const [source, setSource] = useState<ProfileSource | null>(initial?.source ?? null)
  const [date, setDate] = useState(initial?.recordedOn ?? todayDate())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const sourceName = useId()

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-cream p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim() || !source) return
        setBusy(true)
        setError(null)
        try {
          await onSubmit({ text: text.trim(), source, recordedOn: date })
        } catch (err) {
          setError((err as Error).message)
          setBusy(false)
        }
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Cosa hai saputo o osservato</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={4000}
          autoFocus
          placeholder="Descrivi comportamenti e situazioni concrete"
          aria-describedby={noteId}
          className={`${inputClass} resize-y leading-relaxed`}
        />
        <PrivacyNote id={noteId} />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-bold">Provenienza</legend>
        <div className="flex flex-wrap gap-2">
          {PROFILE_SOURCES.map((s) => (
            <label
              key={s.id}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 px-3 text-sm font-bold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                s.id === 'ipotesi' ? 'border-dashed' : ''
              }`}
              style={source === s.id ? { borderColor: s.color, backgroundColor: s.soft, color: s.color } : { borderColor: '#e4d9c8' }}
            >
              <input type="radio" name={sourceName} value={s.id} checked={source === s.id} onChange={() => setSource(s.id)} className="sr-only" />
              {s.label}
            </label>
          ))}
        </div>
        {!source && <span className="text-xs text-muted">Scegli sempre da dove viene l’informazione.</span>}
      </fieldset>
      <label className="flex flex-col gap-1.5 sm:max-w-xs">
        <span className="text-sm font-bold">Data</span>
        <input type="date" value={date} max={todayDate()} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
      </label>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <Button type="submit" tone="primary" disabled={busy || !text.trim() || !source}>
          {submitLabel}
        </Button>
        <Button type="button" disabled={busy} onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </form>
  )
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm font-bold text-[#a2472f]">
      {children}
    </p>
  )
}
