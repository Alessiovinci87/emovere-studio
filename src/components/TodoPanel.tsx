import { downloadIcs, formatDate, type DueItem } from '../lib/reminders'
import { reminderLabel } from '../lib/sheet'
import { Modal } from './Modal'
import { Button } from './ui'

interface Props {
  items: DueItem[]
  onOpen: (sheetId: string) => void
  onDone: (sheetId: string) => void
  onClose: () => void
}

/** Promemoria di oggi e scaduti. */
export function TodoPanel({ items, onOpen, onDone, onClose }: Props) {
  return (
    <Modal title="Da fare" onClose={onClose} size="sm">
      {items.length === 0 ? (
        <p className="py-6 text-center text-muted">Niente in scadenza oggi. 🌿</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(({ sheet, folder, overdue }) => (
            <li key={sheet.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">
                  {reminderLabel(sheet.reminder!.kind)}: {sheet.title || 'Senza titolo'}
                </span>
                <span className={`text-xs font-bold ${overdue ? 'text-[#b5513a]' : 'text-[#6aa86c]'}`}>
                  {overdue ? `Scaduto il ${formatDate(sheet.reminder!.date)}` : 'Oggi'}
                </span>
              </div>
              <p className="text-xs text-muted">{folder ? `📁 ${folder.name}` : 'Scheda non salvata'}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button small tone="soft" onClick={() => onOpen(sheet.id)}>
                  Apri
                </Button>
                <Button small onClick={() => downloadIcs(sheet, folder)}>
                  Aggiungi al calendario
                </Button>
                <Button small onClick={() => onDone(sheet.id)}>
                  ✓ Fatto
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
