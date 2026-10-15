import type { AgendaOptions, Cell, ReminderKind, Sheet, SheetStatus, TemplateId } from '../types'

export interface Template {
  id: TemplateId
  label: string
  /** A4 verticale o orizzontale */
  orientation: 'portrait' | 'landscape'
  /**
   * - grid: riquadri in griglia
   * - stack: uno sotto l'altro con freccia ↓ (Prima / Poi)
   * - sequence: affiancati con freccia → (Prima – Adesso – Dopo)
   * - agenda: giorni in colonna, momenti della giornata in riga
   */
  layout: 'grid' | 'stack' | 'sequence' | 'agenda'
  /** false = la frase sotto la vignetta parte vuota (es. Agenda); true = titolo della scena */
  defaultText: boolean
  /** Riquadro evidenziato con un bordo più spesso (ADESSO) */
  highlight?: number
  /** Gruppo mostrato nella scelta del modello */
  group: string
  cols: number
  rows: number
  /** Numeri dei passaggi e orari (solo routine) */
  numbered: boolean
  /** Etichette fisse dei riquadri, es. Prima / Poi */
  cellLabels?: string[]
  /** Una riga per la galleria "Crea" */
  description: string
  /** Corpo della frase sotto la vignetta, in mm */
  textMm: number
  defaultTitle: string
}

export const templates: Record<TemplateId, Template> = {
  'routine-4': {
    id: 'routine-4',
    orientation: 'portrait',
    layout: 'grid',
    defaultText: true,
    description: 'Quattro passaggi grandi, per le sequenze brevi.',
    label: 'Routine · 4 riquadri',
    group: 'Routine',
    cols: 2,
    rows: 2,
    numbered: true,
    textMm: 6.5,
    defaultTitle: 'La mia routine',
  },
  'routine-6': {
    id: 'routine-6',
    orientation: 'portrait',
    layout: 'grid',
    defaultText: true,
    description: 'Pochi passaggi grandi, numerati: ideale per iniziare.',
    label: 'Routine · 6 riquadri',
    group: 'Routine',
    // 2 colonne × 3 righe: su A4 verticale le vignette vengono molto più grandi che in 3 × 2
    cols: 2,
    rows: 3,
    numbered: true,
    textMm: 6,
    defaultTitle: 'La mia routine',
  },
  'routine-9': {
    id: 'routine-9',
    orientation: 'portrait',
    layout: 'grid',
    defaultText: true,
    description: 'Una routine media, numerata, con orari facoltativi.',
    label: 'Routine · 9 riquadri',
    group: 'Routine',
    cols: 3,
    rows: 3,
    numbered: true,
    textMm: 5,
    defaultTitle: 'La mia routine',
  },
  'routine-12': {
    id: 'routine-12',
    orientation: 'portrait',
    layout: 'grid',
    defaultText: true,
    description: 'La giornata o una routine lunga, passo dopo passo.',
    label: 'Routine · 12 riquadri',
    group: 'Routine',
    cols: 3,
    rows: 4,
    numbered: true,
    textMm: 4.4,
    defaultTitle: 'La mia routine',
  },
  'prima-poi': {
    id: 'prima-poi',
    orientation: 'portrait',
    layout: 'stack',
    defaultText: true,
    description: 'Due vignette grandi: prima questo, poi quello.',
    label: 'Prima / Poi',
    group: 'Prima / Poi',
    cols: 1,
    rows: 2,
    numbered: false,
    cellLabels: ['Prima', 'Poi'],
    textMm: 8,
    defaultTitle: 'Prima e poi',
  },
  'scelte-2': {
    id: 'scelte-2',
    orientation: 'portrait',
    layout: 'grid',
    defaultText: true,
    description: 'Due possibilità tra cui scegliere.',
    label: 'Scelte · 2',
    group: 'Scelte',
    cols: 1,
    rows: 2,
    numbered: false,
    textMm: 7.5,
    defaultTitle: 'Le mie scelte',
  },
  'scelte-3': {
    id: 'scelte-3',
    orientation: 'portrait',
    layout: 'grid',
    defaultText: true,
    description: 'Tre possibilità tra cui scegliere.',
    label: 'Scelte · 3',
    group: 'Scelte',
    cols: 1,
    rows: 3,
    numbered: false,
    textMm: 6.5,
    defaultTitle: 'Le mie scelte',
  },
  'scelte-4': {
    id: 'scelte-4',
    orientation: 'portrait',
    layout: 'grid',
    defaultText: true,
    description: 'Quattro possibilità in una griglia 2 × 2.',
    label: 'Scelte · 4',
    group: 'Scelte',
    cols: 2,
    rows: 2,
    numbered: false,
    textMm: 6,
    defaultTitle: 'Le mie scelte',
  },
  'prima-adesso-dopo': {
    id: 'prima-adesso-dopo',
    orientation: 'landscape',
    layout: 'sequence',
    defaultText: true,
    description: 'Tre vignette grandi affiancate: prima, adesso, dopo.',
    label: 'Prima – Adesso – Dopo',
    group: 'Prima / Poi',
    cols: 3,
    rows: 1,
    numbered: false,
    cellLabels: ['Prima', 'Adesso', 'Dopo'],
    highlight: 1,
    textMm: 7,
    defaultTitle: 'Prima, adesso, dopo',
  },
  agenda: {
    id: 'agenda',
    orientation: 'landscape',
    layout: 'agenda',
    defaultText: false,
    description: 'La settimana: giorni in colonna, mattina, pomeriggio e sera.',
    label: 'Agenda della settimana',
    group: 'Agenda',
    // Si conservano sempre 7 giorni × 4 momenti: cambiando giorni o righe non si perde nulla
    cols: 7,
    rows: 4,
    numbered: false,
    textMm: 3.4,
    defaultTitle: 'La mia settimana',
  },
}

export const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export function defaultAgenda(): AgendaOptions {
  return { days: 7, rows: 3, labels: ['Mattina', 'Pomeriggio', 'Sera', 'Notte'] }
}

/** Agenda: indice del riquadro per momento (riga) e giorno (colonna). */
export function agendaIndex(row: number, day: number): number {
  return row * 7 + day
}

export const templateList = Object.values(templates)

/** Colori dei numeri dei passaggi: si ripetono in ordine. */
export const stepColors = ['#e8846b', '#f0b54a', '#7cb87e', '#5fa8d3', '#a58bd6', '#e98bb0']

export const statuses: { id: SheetStatus; label: string; color: string; soft: string }[] = [
  { id: 'da-fare', label: 'Da fare', color: '#a39aab', soft: '#efebf2' },
  { id: 'in-lavorazione', label: 'In lavorazione', color: '#d9a23a', soft: '#fdf1d6' },
  { id: 'pronta', label: 'Pronta', color: '#6aa86c', soft: '#e3f2e3' },
  { id: 'consegnata', label: 'Stampata/Consegnata', color: '#5f93cc', soft: '#e3eefa' },
]

export function statusInfo(id: SheetStatus) {
  return statuses.find((s) => s.id === id)!
}

export const reminderKinds: { id: ReminderKind; label: string }[] = [
  { id: 'creare', label: 'Creare' },
  { id: 'stampare', label: 'Stampare' },
  { id: 'consegnare', label: 'Consegnare' },
  { id: 'rivedere', label: 'Rivedere' },
]

export function reminderLabel(kind: ReminderKind): string {
  return reminderKinds.find((k) => k.id === kind)!.label
}

export function newId(): string {
  return crypto.randomUUID()
}

export function emptyCell(): Cell {
  return { id: newId(), code: null, text: null, time: '', symbol: null }
}

export function createSheet(template: TemplateId = 'routine-12', childName = ''): Sheet {
  const t = templates[template]
  const now = Date.now()
  return {
    id: newId(),
    template,
    title: titleWithName(t.defaultTitle, childName),
    subtitle: '',
    character: 'bambina',
    childName,
    cells: Array.from({ length: t.cols * t.rows }, emptyCell),
    remember: { enabled: false, lines: ['', '', ''] },
    doneCircle: false,
    cutouts: false,
    uppercase: false,
    timeMode: 'both',
    showLogo: null,
    coloring: false,
    agenda: defaultAgenda(),
    folderId: null,
    status: 'da-fare',
    notes: '',
    reminder: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Completa una scheda salvata con una versione precedente (campi mancanti → valori iniziali). */
export function normalizeSheet(raw: Partial<Sheet>): Sheet {
  const known = !!raw.template && raw.template in templates
  const base = createSheet(known ? raw.template : 'routine-12')
  const sheet = { ...base, ...raw, template: base.template } as Sheet
  sheet.cells = (raw.cells ?? base.cells).map((c) => ({ ...emptyCell(), ...c }))
  sheet.agenda = { ...defaultAgenda(), ...raw.agenda }
  // Modello non più disponibile (es. la vecchia "Tabella a gettoni"): diventa Routine 12, vignette comprese
  if (!known) Object.assign(sheet, changeTemplate({ ...sheet, title: '' }, base.template), { title: sheet.title })
  return sheet
}

/** Cambia modello: tiene i riquadri esistenti nell'ordine, aggiunge o toglie quelli in fondo. */
export function changeTemplate(sheet: Sheet, template: TemplateId): Partial<Sheet> {
  const t = templates[template]
  const count = t.cols * t.rows
  const cells = sheet.cells.slice(0, count)
  while (cells.length < count) cells.push(emptyCell())
  const oldDefault = titleWithName(templates[sheet.template].defaultTitle, sheet.childName)
  return {
    template,
    cells,
    title: sheet.title === oldDefault ? titleWithName(t.defaultTitle, sheet.childName) : sheet.title,
  }
}

const POSSESSIVE = /^(la|il|lo|le|i|gli) (mia|mio|mie|miei) (.+)$/i

/** "La mia mattina" + Sofia → "La mattina di Sofia"; altri titoli → "… di Sofia". */
export function titleWithName(title: string, name: string): string {
  if (!name) return title
  const m = title.match(POSSESSIVE)
  return m ? `${m[1]} ${m[3]} di ${name}` : `${title} di ${name}`
}

/** Aggiorna il titolo quando cambia il nome del bambino. */
export function retitleForName(title: string, oldName: string, newName: string): string {
  const suffix = ` di ${oldName}`
  if (oldName && title.endsWith(suffix)) {
    const base = title.slice(0, -suffix.length)
    return newName ? `${base} di ${newName}` : base
  }
  if (!oldName) return titleWithName(title, newName)
  return title
}
