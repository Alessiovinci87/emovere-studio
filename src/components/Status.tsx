import { useEffect, useRef, useState } from 'react'
import { statusInfo, statuses } from '../lib/sheet'
import type { SheetStatus } from '../types'

/** Etichetta dello stato: un clic apre il menu con i quattro stati. */
export function StatusChip({ status, onChange }: { status: SheetStatus; onChange: (s: SheetStatus) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const info = statusInfo(status)

  // Chiude il menu con un clic/tocco fuori o con Esc
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Stato: ${info.label}. Cambia stato`}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition hover:brightness-95"
        style={{ backgroundColor: info.soft }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info.color }} />
        {info.label}
        <span aria-hidden="true" className="text-muted">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="menu"
          aria-label="Cambia stato"
          className="absolute left-0 top-full z-20 mt-1 flex min-w-48 flex-col gap-0.5 rounded-2xl border border-line bg-white p-1.5 shadow-lg"
        >
          {statuses.map((s) => (
            <li key={s.id} role="none">
              <button
                role="menuitemradio"
                aria-checked={s.id === status}
                onClick={() => {
                  setOpen(false)
                  if (s.id !== status) onChange(s.id)
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-cream"
                style={s.id === status ? { backgroundColor: s.soft } : undefined}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
                {s.id === status && <span className="ml-auto text-muted">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Tutti gli stati in fila: un clic sceglie direttamente quello voluto. */
export function StatusPicker({ status, onChange }: { status: SheetStatus; onChange: (s: SheetStatus) => void }) {
  return (
    <div role="radiogroup" aria-label="Stato della scheda" className="flex flex-wrap gap-1.5">
      {statuses.map((s) => (
        <button
          key={s.id}
          role="radio"
          aria-checked={status === s.id}
          onClick={() => onChange(s.id)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
            status === s.id ? 'border-transparent text-ink' : 'border-line bg-white text-muted hover:text-ink'
          }`}
          style={status === s.id ? { backgroundColor: s.soft } : undefined}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </button>
      ))}
    </div>
  )
}

/** Contatori per stato (solo quelli non a zero). */
export function StatusCounts({ counts }: { counts: Record<SheetStatus, number> }) {
  const visible = statuses.filter((s) => counts[s.id] > 0)
  if (visible.length === 0) return <p className="text-sm text-muted">Nessuna scheda</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {visible.map((s) => (
        <li
          key={s.id}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{ backgroundColor: s.soft }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {counts[s.id]} {s.label.toLowerCase()}
        </li>
      ))}
    </ul>
  )
}
