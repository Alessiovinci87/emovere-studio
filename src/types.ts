export type Character = 'bambina' | 'bambino'

export interface Scene {
  code: string
  block: string
  title_f: string
  title_m: string
  setting: string
  outfit: string
  actions: string[]
  objects: string[]
  tags: string[]
  characters: Character[]
  adults: string[]
}

export interface Catalog {
  version: number
  blocks: Record<string, string>
  scenes: Scene[]
}

export type TemplateId =
  | 'routine-6'
  | 'routine-9'
  | 'routine-12'
  | 'prima-poi'
  | 'scelte-2'
  | 'scelte-3'
  | 'scelte-4'

export type SymbolKind = 'check' | 'cross' | 'forbidden'
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

export interface CellSymbol {
  kind: SymbolKind
  corner: Corner
}

export interface Cell {
  id: string
  /** Codice scena (es. "A01"), null se il riquadro è vuoto */
  code: string | null
  /** Frase personalizzata; null = titolo della scena per il personaggio scelto */
  text: string | null
  time: string
  symbol: CellSymbol | null
}

export type SheetStatus = 'da-fare' | 'in-lavorazione' | 'pronta' | 'consegnata'

export type ReminderKind = 'creare' | 'stampare' | 'consegnare' | 'rivedere'

export interface Reminder {
  /** Data locale in formato AAAA-MM-GG */
  date: string
  kind: ReminderKind
  done: boolean
}

export interface Sheet {
  id: string
  template: TemplateId
  title: string
  subtitle: string
  character: Character
  /** Nome o iniziali del bambino (facoltativo), inserito nel titolo */
  childName: string
  cells: Cell[]
  remember: { enabled: boolean; lines: [string, string, string] }
  /** Cerchietto in alto a destra di ogni vignetta, dove attaccare col velcro la stellina "fatto" */
  doneCircle: boolean
  /** Con il cerchietto: aggiunge al PDF la pagina di stelline rotonde da ritagliare */
  cutouts: boolean
  /** null = scheda non ancora salvata (bozza) */
  folderId: string | null
  status: SheetStatus
  notes: string
  reminder: Reminder | null
  createdAt: number
  updatedAt: number
}

/** Cartella di un bambino */
export interface Folder {
  id: string
  /** Solo nome o iniziali */
  name: string
  notes: string
  createdAt: number
  updatedAt: number
}

export interface StoreData {
  folders: Folder[]
  sheets: Sheet[]
}
