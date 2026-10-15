import { downloadIcs, formatDate, type DueItem } from '../lib/reminders'
import { reminderLabel } from '../lib/sheet'
import { Button } from './ui'

interface Props {
  items: DueItem[]
  /** Promemoria del backup, null se non serve */
  backup: { lastExport: string | null } | null
  onBackup: () => void
  onOpen: (sheetId: string) => void
  onDone: (sheetId: string) => void
}

/** "Da fare": promemoria di oggi e scaduti, più il promemoria del backup. */
export function TodoList({ items, backup, onBackup, onOpen, onDone }: Props) {
  if (items.length === 0 && !backup) {
    return <p className="rounded-3xl bg-white p-6 text-center text-muted shadow-sm">Niente in scadenza oggi. 🌿</p>
  }
  return (
    <ul className="flex flex-col gap-3">
      {backup && (
        <li className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-butter p-5 shadow-sm">
          <div className="flex flex-col gap-1">
            <span className="font-bold">💾 Fai un backup</span>
            <span className="text-sm text-muted">
              {backup.lastExport
                ? `Ultimo backup il ${new Date(backup.lastExport).toLocaleDateString('it-IT')}: sono passati più di 7 giorni.`
                : 'Non hai ancora mai fatto un backup.'}{' '}
              Le schede restano solo in questo browser.
            </span>
          </div>
          <Button tone="primary" onClick={onBackup}>
            Esporta tutto
          </Button>
        </li>
      )}
      {items.map(({ sheet, folder, overdue }) => (
        <li key={sheet.id} className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-bold">
              {reminderLabel(sheet.reminder!.kind)}: {sheet.title || 'Senza titolo'}
            </span>
            <span className={`text-sm font-bold ${overdue ? 'text-[#b5513a]' : 'text-[#5d9a5f]'}`}>
              {overdue ? `Scaduto il ${formatDate(sheet.reminder!.date)}` : 'Oggi'}
            </span>
          </div>
          <p className="text-sm text-muted">{folder ? `📁 ${folder.name}` : 'Scheda non salvata'}</p>
          <div className="flex flex-wrap gap-2">
            <Button tone="soft" onClick={() => onOpen(sheet.id)}>
              Apri
            </Button>
            <Button onClick={() => downloadIcs(sheet, folder)}>Aggiungi al calendario</Button>
            <Button onClick={() => onDone(sheet.id)}>✓ Fatto</Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
