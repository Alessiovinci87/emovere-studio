import { downloadIcs, todayISO } from '../lib/reminders'
import { reminderKinds } from '../lib/sheet'
import type { Folder, Reminder, ReminderKind, Sheet } from '../types'
import { Button, inputClass } from './ui'

interface Props {
  sheet: Sheet
  folder: Folder | undefined
  onChange: (reminder: Reminder | null) => void
}

/** Promemoria della scheda: data e tipo, con export per il calendario. */
export function ReminderEditor({ sheet, folder, onChange }: Props) {
  const reminder = sheet.reminder
  if (!reminder) {
    return (
      <Button tone="soft" onClick={() => onChange({ date: todayISO(), kind: 'stampare', done: false })}>
        + Aggiungi promemoria
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <select
          value={reminder.kind}
          onChange={(e) => onChange({ ...reminder, kind: e.target.value as ReminderKind, done: false })}
          aria-label="Tipo di promemoria"
          className={inputClass}
        >
          {reminderKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={reminder.date}
          onChange={(e) => e.target.value && onChange({ ...reminder, date: e.target.value, done: false })}
          aria-label="Data del promemoria"
          className={inputClass}
        />
      </div>
      {reminder.done && <p className="text-xs font-bold text-[#6aa86c]">✓ Fatto</p>}
      <div className="flex flex-wrap gap-1.5">
        <Button small tone="soft" onClick={() => downloadIcs(sheet, folder)}>
          Aggiungi al calendario
        </Button>
        <Button small onClick={() => onChange(null)}>
          Togli
        </Button>
      </div>
    </div>
  )
}
