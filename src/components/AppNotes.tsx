import { useEffect, useId, useState } from 'react'
import { NOTE_KINDS, NOTE_STATUSES, SCREENS, notesApi, notesMarkdown, screenLabel, type AppNote, type NoteKind, type NoteStatus } from '../lib/appNotes'
import { downloadBlob } from '../lib/download'
import { todayISO } from '../lib/reminders'
import { CloseIcon } from './Icons'
import { Button, PrivacyNote, inputClass } from './ui'

// Pulsante "Appunti" sempre visibile sul bordo destro e pannello con gli appunti della schermata.
// Su telefono il pannello sale dal basso.

interface PanelProps {
  screen: string
  context: string
  isOwner: boolean
  /** Impostazioni → Appunti sull'app (tutti gli appunti) */
  onOpenAll?: () => void
}

export function NotesButton(props: PanelProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Appunti su questa schermata"
        className="fixed right-0 top-1/2 z-[45] flex min-h-24 w-9 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-line bg-white py-3 text-xs font-bold text-accent shadow-md hover:bg-accent-soft print:hidden"
      >
        <span className="rotate-180 [writing-mode:vertical-rl]">✏️ Appunti</span>
      </button>
      {open && <NotesPanel {...props} onClose={() => setOpen(false)} />}
    </>
  )
}

function NotesPanel({ screen, context, isOwner, onOpenAll, onClose }: PanelProps & { onClose: () => void }) {
  const [notes, setNotes] = useState<AppNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<NoteKind>('problema')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const privacyId = useId()

  useEffect(() => {
    notesApi.list().then(setNotes, (e: Error) => setError(e.message))
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const note = await notesApi.create({ screen, context, kind, text })
      setNotes((list) => [note, ...(list ?? [])])
      setText('')
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const here = notes?.filter((n) => n.screen === screen) ?? []
  const where = context ? `${screenLabel(screen)} · ${context}` : screenLabel(screen)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-ink/30 sm:items-stretch" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Appunti"
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-cream shadow-xl sm:max-h-none sm:w-[420px] sm:rounded-none sm:rounded-l-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Appunti</h2>
            <p className="text-sm text-muted">{where}</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-full p-2 text-muted hover:bg-sand hover:text-ink">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-sm leading-relaxed text-muted">
              Cosa non va, cosa cambieresti, cosa non è chiaro? Si salva con il nome di questa schermata.
            </p>
            <KindPicker value={kind} onChange={setKind} />
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setSaved(false)
              }}
              rows={4}
              maxLength={3000}
              placeholder="Scrivi l’appunto…"
              aria-label="Appunto"
              aria-describedby={privacyId}
              className={`${inputClass} resize-y leading-relaxed`}
            />
            <PrivacyNote id={privacyId} />
            <div className="flex flex-wrap items-center gap-3">
              <Button tone="primary" disabled={saving || !text.trim()} onClick={() => void save()}>
                {saving ? 'Salvo…' : 'Salva appunto'}
              </Button>
              {saved && <span role="status" className="text-sm font-bold text-[#2f6b4f]">Salvato, grazie!</span>}
            </div>
            {error && <p role="alert" className="text-sm font-bold text-[#b5513a]">{error}</p>}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="font-bold">Su questa schermata</h3>
            {notes === null && !error && <p className="text-sm text-muted">Carico…</p>}
            {notes !== null && here.length === 0 && <p className="text-sm text-muted">Ancora nessun appunto.</p>}
            {here.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                isOwner={isOwner}
                onChange={(note) => setNotes((list) => list!.map((x) => (x.id === note.id ? note : x)))}
                onRemove={() => setNotes((list) => list!.filter((x) => x.id !== n.id))}
              />
            ))}
            {onOpenAll && (
              <Button tone="ghost" className="self-start" onClick={onOpenAll}>
                Tutti gli appunti (Impostazioni)
              </Button>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function KindPicker({ value, onChange }: { value: NoteKind; onChange: (kind: NoteKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo di appunto" className="flex flex-wrap gap-2">
      {NOTE_KINDS.map((k) => (
        <button
          key={k.id}
          role="radio"
          aria-checked={value === k.id}
          onClick={() => onChange(k.id)}
          className={`min-h-11 rounded-full px-4 text-sm font-bold ${value === k.id ? 'bg-accent text-white' : 'border border-line text-muted hover:bg-sand'}`}
        >
          {k.icon} {k.label}
        </button>
      ))}
    </div>
  )
}

/** Un appunto: chi l'ha scritto lo modifica o elimina; il titolare cambia lo stato e risponde (ed elimina). */
export function NoteCard({
  note,
  isOwner,
  showScreen,
  onChange,
  onRemove,
}: {
  note: AppNote
  isOwner: boolean
  showScreen?: boolean
  onChange: (note: AppNote) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [kind, setKind] = useState(note.kind)
  const [text, setText] = useState(note.text)
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState(note.reply ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const privacyId = useId()
  const kindInfo = NOTE_KINDS.find((k) => k.id === note.kind)!
  const status = NOTE_STATUSES.find((s) => s.id === note.status)!

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const update = (patch: Parameters<typeof notesApi.update>[1]) => run(async () => onChange(await notesApi.update(note.id, patch)))

  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">
          {kindInfo.icon} {kindInfo.label}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${status.className}`}>{status.label}</span>
        {showScreen && (
          <span className="text-muted">
            {screenLabel(note.screen)}
            {note.context && ` · ${note.context}`}
          </span>
        )}
      </div>
      <p className="text-xs text-muted">
        {note.mine ? 'Tu' : (note.author.name ?? 'Persona non più nel centro')} ·{' '}
        {new Date(note.createdAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
      </p>

      {editing ? (
        <div className="flex flex-col gap-2">
          <KindPicker value={kind} onChange={setKind} />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={3000}
            aria-label="Appunto"
            aria-describedby={privacyId}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <PrivacyNote id={privacyId} />
          <div className="flex gap-2">
            <Button
              small
              tone="primary"
              disabled={busy || !text.trim()}
              onClick={() => void update({ kind, text }).then((ok) => ok && setEditing(false))}
            >
              Salva
            </Button>
            <Button small onClick={() => setEditing(false)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap leading-relaxed">{note.text}</p>
      )}

      {note.reply && !replying && (
        <div className="rounded-xl bg-accent-soft px-3 py-2 text-sm">
          <span className="font-bold text-accent">Risposta: </span>
          <span className="whitespace-pre-wrap">{note.reply}</span>
        </div>
      )}

      {replying && (
        <div className="flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder="Cosa è stato fatto, o la risposta alla domanda"
            aria-label="Risposta"
            aria-describedby={`${privacyId}-r`}
            className={`${inputClass} resize-y leading-relaxed`}
          />
          <PrivacyNote id={`${privacyId}-r`} />
          <div className="flex gap-2">
            <Button small tone="primary" disabled={busy} onClick={() => void update({ reply: reply.trim() || null }).then((ok) => ok && setReplying(false))}>
              Salva risposta
            </Button>
            <Button small onClick={() => setReplying(false)}>
              Annulla
            </Button>
          </div>
        </div>
      )}

      {!editing && !replying && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isOwner && (
            <div role="group" aria-label="Stato" className="flex gap-1">
              {NOTE_STATUSES.map((s) => (
                <button
                  key={s.id}
                  disabled={busy}
                  aria-pressed={note.status === s.id}
                  onClick={() => note.status !== s.id && void update({ status: s.id })}
                  className={`min-h-9 rounded-full px-3 text-xs font-bold ${note.status === s.id ? s.className : 'text-muted hover:bg-sand'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {isOwner && (
            <Button small tone="soft" onClick={() => setReplying(true)}>
              {note.reply ? 'Cambia risposta' : 'Rispondi'}
            </Button>
          )}
          {note.mine && (
            <Button small onClick={() => setEditing(true)}>
              Modifica
            </Button>
          )}
          {(note.mine || isOwner) && (
            <Button
              small
              tone="danger"
              disabled={busy}
              onClick={() => confirm('Eliminare questo appunto?') && void run(async () => {
                await notesApi.remove(note.id)
                onRemove()
              })}
            >
              Elimina
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm font-bold text-[#b5513a]">{error}</p>}
    </article>
  )
}

/** Impostazioni → Appunti sull'app: tutti gli appunti del centro, filtri, file per chi sviluppa l'app (titolare). */
export function AppNotesSettings({ isOwner, centerName }: { isOwner: boolean; centerName: string }) {
  const [notes, setNotes] = useState<AppNote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [screen, setScreen] = useState('')
  const [status, setStatus] = useState<NoteStatus | ''>('')
  const [downloaded, setDownloaded] = useState<string[] | null>(null)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    notesApi.list().then(setNotes, (e: Error) => setError(e.message))
  }, [])

  const fresh = notes?.filter((n) => n.status === 'nuovo') ?? []
  const shown = notes?.filter((n) => (!screen || n.screen === screen) && (!status || n.status === status)) ?? []
  const screens = [...new Set(notes?.map((n) => n.screen) ?? [])].sort((a, b) => screenLabel(a).localeCompare(screenLabel(b), 'it'))
  const replace = (note: AppNote) => setNotes((list) => list!.map((x) => (x.id === note.id ? note : x)))

  function download() {
    const text = notesMarkdown(fresh, centerName)
    downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `emovere-appunti_${todayISO()}.md`)
    setDownloaded(fresh.map((n) => n.id))
  }

  async function markSeen() {
    setMarking(true)
    setError(null)
    try {
      for (const id of downloaded ?? []) {
        if (notes?.find((n) => n.id === id)?.status === 'nuovo') replace(await notesApi.update(id, { status: 'visto' }))
      }
      setDownloaded(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="leading-relaxed text-muted">
        Problemi, idee e domande scritti con il pulsante «Appunti» sul bordo destro di ogni schermata.
        {isOwner ? ' Tu ne cambi lo stato e rispondi.' : ' Lo stato e le risposte li cambia il titolare.'}
      </p>
      {isOwner && (
        <div className="flex flex-col gap-2 rounded-2xl bg-sand/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button tone="primary" disabled={fresh.length === 0} onClick={download}>
              Scarica appunti nuovi (.md){fresh.length > 0 && ` · ${fresh.length}`}
            </Button>
            {downloaded && downloaded.length > 0 && (
              <Button tone="soft" disabled={marking} onClick={() => void markSeen()}>
                {marking ? 'Segno…' : 'Segna come visti quelli scaricati'}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted">Il file è per chi sviluppa l’app: contiene la schermata, il tipo, chi l’ha scritto e il testo.</p>
        </div>
      )}
      {notes !== null && notes.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm font-bold">
            Schermata
            <select value={screen} onChange={(e) => setScreen(e.target.value)} className={inputClass}>
              <option value="">Tutte</option>
              {screens.map((s) => (
                <option key={s} value={s}>
                  {SCREENS[s] ?? s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Stato
            <select value={status} onChange={(e) => setStatus(e.target.value as NoteStatus | '')} className={inputClass}>
              <option value="">Tutti</option>
              {NOTE_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {notes === null && !error && <p className="text-sm text-muted">Carico…</p>}
      {notes !== null && notes.length === 0 && <p className="text-sm text-muted">Ancora nessun appunto.</p>}
      {notes !== null && notes.length > 0 && shown.length === 0 && <p className="text-sm text-muted">Nessun appunto con questi filtri.</p>}
      <div className="flex flex-col gap-3">
        {shown.map((n) => (
          <NoteCard key={n.id} note={n} isOwner={isOwner} showScreen onChange={replace} onRemove={() => setNotes((list) => list!.filter((x) => x.id !== n.id))} />
        ))}
      </div>
      {error && <p role="alert" className="text-sm font-bold text-[#b5513a]">{error}</p>}
    </div>
  )
}
