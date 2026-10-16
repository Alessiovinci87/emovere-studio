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
  /** Vignetta generata con AI nell'app (codice X001, X002…) */
  ai?: boolean
  /** Solo vignette AI: indirizzi delle immagini (servite da /api/image) */
  images?: Record<Character, string>
}

export interface Catalog {
  version: number
  blocks: Record<string, string>
  scenes: Scene[]
}

export type TemplateId =
  | 'routine-4'
  | 'routine-6'
  | 'routine-9'
  | 'routine-12'
  | 'prima-poi'
  | 'scelte-2'
  | 'scelte-3'
  | 'scelte-4'
  | 'prima-adesso-dopo'
  | 'ora-poi'
  | 'checklist'
  | 'agenda'

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

export type TimeMode = 'analog' | 'digital' | 'both'

/** Cosa mostra ogni riquadro: vignetta e frase, solo vignetta, solo frase */
export type CellShow = 'both' | 'images' | 'text'

export interface SequenceOptions {
  /** Numeri dei passaggi (modelli numerati e checklist) */
  numbers: boolean
  show: CellShow
}

export interface ChecklistOptions {
  /** Righe visibili, da 3 a 10 (si conservano sempre 10 riquadri) */
  rows: number
}

export interface AgendaOptions {
  /** 7 = Lun–Dom, 5 = solo Lun–Ven */
  days: 5 | 7
  /** Momenti della giornata (righe), da 1 a 4 */
  rows: number
  /** Nomi delle righe (sempre 4, si usano le prime `rows`) */
  labels: [string, string, string, string]
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
  /** Testo in stampatello maiuscolo (solo visualizzazione: il testo salvato resta com'è) */
  uppercase: boolean
  /** Come si mostra l'orario dei riquadri */
  timeMode: TimeMode
  /** Piè di pagina con logo e nome del centro; null = automatico (sì se c'è un logo) */
  showLogo: boolean | null
  /** Versione da colorare: vignette a contorno, numeri e cornici in bianco e nero */
  coloring: boolean
  /** Numeri e modalità immagini/testo */
  sequence: SequenceOptions
  /** Solo Checklist */
  checklist: ChecklistOptions
  /** Solo Agenda della settimana */
  agenda: AgendaOptions
  /** null = scheda non ancora salvata (bozza) */
  folderId: string | null
  status: SheetStatus
  notes: string
  reminder: Reminder | null
  createdAt: number
  updatedAt: number
  /** Ultima apertura nell'editor (sezione Oggi → "Aperte di recente") */
  openedAt?: number
}

/** Cartella di un bambino */
export interface Folder {
  id: string
  /** Solo nome o iniziali (sul server: lo pseudonimo del bambino) */
  name: string
  notes: string
  /** Sul server: nome stampato sulle schede (cifrato), vuoto = nessun nome. Assente nei dati del browser. */
  materialName?: string
  /** Sul server: codice interno del bambino (B-0001) */
  code?: string
  createdAt: number
  updatedAt: number
}

export interface StoreData {
  folders: Folder[]
  sheets: Sheet[]
}
