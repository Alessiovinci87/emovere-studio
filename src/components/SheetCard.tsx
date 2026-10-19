import { sceneThumb } from '../lib/catalog'
import { formatDate, isOverdue } from '../lib/reminders'
import { reminderLabel, templates } from '../lib/sheet'
import type { Sheet, SheetStatus } from '../types'
import { StatusChip } from './Status'
import { Button } from './ui'

interface Props {
  sheet: Sheet
  onOpen: () => void
  onStatus: (status: SheetStatus) => void
  onDuplicate: () => void
  onMove: () => void
  onDelete: () => void
  /** Cartella del bambino: obiettivi collegati, con il pulsante per cambiarli */
  goals?: { count: number; onEdit: () => void }
}

export function SheetCard({ sheet, onOpen, onStatus, onDuplicate, onMove, onDelete, goals }: Props) {
  const filled = sheet.cells.filter((c) => c.code)
  // Quattro miniature a mosaico, altrimenti solo la prima a tutta grandezza
  const thumbs = filled.length >= 4 ? filled.slice(0, 4) : filled.slice(0, 1)
  const reminder = sheet.reminder && !sheet.reminder.done ? sheet.reminder : null

  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <button onClick={onOpen} className="group flex gap-3 text-left" aria-label={`Apri ${sheet.title || 'scheda'}`}>
        <div className={`grid h-16 w-16 shrink-0 gap-0.5 overflow-hidden rounded-xl bg-sand ${thumbs.length === 4 ? 'grid-cols-2' : ''}`}>
          {thumbs.map((c) => (
            <img key={c.id} src={sceneThumb(c.code!, sheet.character)} alt="" loading="lazy" className="h-full w-full object-cover" />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate font-bold group-hover:text-sky">{sheet.title || 'Senza titolo'}</h3>
          <p className="text-xs text-muted">
            {templates[sheet.template].label} · modificata il {new Date(sheet.updatedAt).toLocaleDateString('it-IT')}
          </p>
          {reminder && (
            <p className={`text-xs font-bold ${isOverdue(sheet) ? 'text-[#b5513a]' : 'text-ink'}`}>
              ⏰ {reminderLabel(reminder.kind)} · {formatDate(reminder.date)}
              {isOverdue(sheet) && ' (scaduto)'}
            </p>
          )}
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={sheet.status} onChange={onStatus} />
          {goals && (
            <Button small onClick={goals.onEdit} aria-label={`Obiettivi di ${sheet.title || 'questa scheda'}: ${goals.count}`}>
              Obiettivi ({goals.count})
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          <Button small onClick={onDuplicate}>
            Duplica
          </Button>
          <Button small onClick={onMove}>
            Sposta
          </Button>
          <Button small tone="danger" onClick={onDelete} aria-label={`Elimina ${sheet.title}`}>
            Elimina
          </Button>
        </div>
      </div>
    </article>
  )
}
