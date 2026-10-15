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

export type TemplateId = 'routine-12'

export interface Cell {
  id: string
  /** Codice scena (es. "A01"), null se il riquadro è vuoto */
  code: string | null
  /** Frase personalizzata; null = titolo della scena per il personaggio scelto */
  text: string | null
  time: string
}

export interface Sheet {
  id: string
  template: TemplateId
  title: string
  subtitle: string
  character: Character
  cells: Cell[]
  remember: { enabled: boolean; lines: [string, string, string] }
  updatedAt: number
}
