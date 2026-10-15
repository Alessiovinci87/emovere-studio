import { nextStatus, statusInfo, statuses } from '../lib/sheet'
import type { SheetStatus } from '../types'

/** Etichetta dello stato: un clic passa allo stato successivo. */
export function StatusChip({ status, onChange }: { status: SheetStatus; onChange: (s: SheetStatus) => void }) {
  const info = statusInfo(status)
  const next = statusInfo(nextStatus(status))
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onChange(next.id)
      }}
      title={`Clic: passa a “${next.label}”`}
      aria-label={`Stato: ${info.label}. Clic per passare a ${next.label}`}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition hover:brightness-95"
      style={{ backgroundColor: info.soft, color: '#3b3846' }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info.color }} />
      {info.label}
      <span aria-hidden="true" className="text-muted">
        →
      </span>
    </button>
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
