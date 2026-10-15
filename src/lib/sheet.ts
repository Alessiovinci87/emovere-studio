import type { Cell, Sheet, TemplateId } from '../types'

export interface Template {
  id: TemplateId
  label: string
  cols: number
  rows: number
  numbered: boolean
}

export const templates: Record<TemplateId, Template> = {
  'routine-12': { id: 'routine-12', label: 'Routine · 12 riquadri', cols: 3, rows: 4, numbered: true },
}

/** Colori dei numeri dei passaggi: si ripetono in ordine. */
export const stepColors = ['#e8846b', '#f0b54a', '#7cb87e', '#5fa8d3', '#a58bd6', '#e98bb0']

export function newId(): string {
  return crypto.randomUUID()
}

export function emptyCell(): Cell {
  return { id: newId(), code: null, text: null, time: '' }
}

export function createSheet(template: TemplateId = 'routine-12'): Sheet {
  const t = templates[template]
  return {
    id: newId(),
    template,
    title: 'La mia routine',
    subtitle: '',
    character: 'bambina',
    cells: Array.from({ length: t.cols * t.rows }, emptyCell),
    remember: { enabled: false, lines: ['', '', ''] },
    updatedAt: Date.now(),
  }
}

const DRAFT_KEY = 'emovere.draft.v1'

export function loadDraft(): Sheet | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Sheet) : null
  } catch {
    return null
  }
}

export function saveDraft(sheet: Sheet): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(sheet))
  } catch {
    // localStorage pieno o non disponibile: la bozza resta solo in memoria
  }
}
