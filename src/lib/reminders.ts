import type { Folder, Sheet } from '../types'
import { downloadBlob } from './download'
import { reminderLabel } from './sheet'

/** Data locale di oggi in formato AAAA-MM-GG (come gli <input type="date">). */
export function todayISO(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "2026-10-15" → "15 ott 2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface DueItem {
  sheet: Sheet
  folder: Folder | undefined
  overdue: boolean
}

/** Promemoria non completati di oggi e scaduti, dal più vecchio. */
export function dueReminders(sheets: Sheet[], folders: Folder[], today = todayISO()): DueItem[] {
  return sheets
    .filter((s) => s.reminder && !s.reminder.done && s.reminder.date && s.reminder.date <= today)
    .sort((a, b) => a.reminder!.date.localeCompare(b.reminder!.date))
    .map((sheet) => ({
      sheet,
      folder: folders.find((f) => f.id === sheet.folderId),
      overdue: sheet.reminder!.date < today,
    }))
}

export function isOverdue(sheet: Sheet, today = todayISO()): boolean {
  return !!sheet.reminder && !sheet.reminder.done && sheet.reminder.date < today
}

/** Testo del promemoria, es. "Stampare: La mattina di Sofia" */
export function reminderSummary(sheet: Sheet): string {
  return `${reminderLabel(sheet.reminder!.kind)}: ${sheet.title || 'Scheda'}`
}

/** Scarica un evento di calendario (.ics) per tutto il giorno, con avviso alle 9. */
export function downloadIcs(sheet: Sheet, folder: Folder | undefined) {
  const reminder = sheet.reminder!
  const day = reminder.date.replaceAll('-', '')
  const [y, m, d] = reminder.date.split('-').map(Number)
  const next = todayISO(new Date(y, m - 1, d + 1)).replaceAll('-', '')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const description = folder ? `Cartella: ${folder.name}` : 'Emovere Studio'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Emovere Studio//Promemoria//IT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${sheet.id}-${day}@emovere-studio`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${escapeIcs(reminderSummary(sheet))}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(reminderSummary(sheet))}`,
    'TRIGGER;RELATED=START:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' })
  downloadBlob(blob, `Promemoria_${reminder.date}.ics`)
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
}
