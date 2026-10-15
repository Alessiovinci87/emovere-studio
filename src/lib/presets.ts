import presetsJson from '../data/presets.json'
import type { Character, Sheet, TemplateId, TimeMode } from '../types'
import { getScene } from './catalog'
import { createSheet, templates, titleWithName } from './sheet'

/** Scheda pronta (src/data/presets.json) */
export interface Preset {
  id: string
  titolo: string
  sottotitolo: string
  template: TemplateId
  /** Codici scena in ordine */
  scene: string[]
  opzioni: Partial<{ uppercase: boolean; doneCircle: boolean; timeMode: TimeMode; coloring: boolean }>
}

const all = presetsJson as Preset[]

/** Schede pronte utilizzabili: modello esistente e tutte le scene presenti nel catalogo. */
export function availablePresets(): Preset[] {
  return all.filter(
    (p) =>
      p.template in templates &&
      p.scene.length > 0 &&
      p.scene.length <= templates[p.template].cols * templates[p.template].rows &&
      p.scene.every((code) => getScene(code)),
  )
}

/** "Pronto/a per la scuola" → "Pronta per la scuola" (bambina) / "Pronto per la scuola" (bambino) */
export function genderize(text: string, character: Character): string {
  return text.replace(/(\p{L}+)o\/a\b/gu, (_, stem: string) => stem + (character === 'bambina' ? 'a' : 'o'))
}

/** Crea una scheda già compilata (modificabile) da una scheda pronta. */
export function sheetFromPreset(preset: Preset, character: Character, childName: string, uppercaseDefault: boolean): Sheet {
  const sheet = createSheet(preset.template, childName)
  const cells = sheet.cells.map((cell, i) => (preset.scene[i] ? { ...cell, code: preset.scene[i] } : cell))
  return {
    ...sheet,
    character,
    title: titleWithName(genderize(preset.titolo, character), childName),
    subtitle: genderize(preset.sottotitolo, character),
    cells,
    uppercase: uppercaseDefault,
    ...preset.opzioni,
  }
}
