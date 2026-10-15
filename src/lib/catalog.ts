import catalogJson from '../data/catalog.json'
import type { Catalog, Character, Scene } from '../types'

export const catalog = catalogJson as Catalog

const byCode = new Map(catalog.scenes.map((s) => [s.code, s]))

export function getScene(code: string): Scene | undefined {
  return byCode.get(code)
}

export function sceneTitle(scene: Scene, character: Character): string {
  return character === 'bambina' ? scene.title_f : scene.title_m
}

/**
 * - `web`: WebP qualità 90 a dimensione piena (schermo, PDF WhatsApp)
 * - `original`: PNG originale (PDF stampa)
 */
export type ImageVariant = 'web' | 'original'

export function sceneImage(code: string, character: Character, variant: ImageVariant = 'web'): string {
  return variant === 'original'
    ? `/library/scenes/${character}/${code}_${character}.png`
    : `/library/webp/${character}/${code}_${character}.webp`
}

export function sceneThumb(code: string, character: Character): string {
  return `/library/thumbs/${character}/${code}_${character}.webp`
}

/** Minuscolo e senza accenti, per una ricerca tollerante. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const searchIndex = new Map(
  catalog.scenes.map((s) => [s.code, normalize([s.title_f, s.title_m, ...s.tags].join(' '))]),
)

export interface SceneFilters {
  query: string
  block: string | null
  setting: string | null
  character: Character
}

export function filterScenes(f: SceneFilters): Scene[] {
  const words = normalize(f.query).split(/\s+/).filter(Boolean)
  return catalog.scenes.filter((s) => {
    if (f.block && s.block !== f.block) return false
    if (f.setting && s.setting !== f.setting) return false
    if (!s.characters.includes(f.character)) return false
    const haystack = searchIndex.get(s.code) ?? ''
    return words.every((w) => haystack.includes(w))
  })
}

/** Blocchi che hanno almeno una scena, in ordine. */
export const usedBlocks = Object.keys(catalog.blocks).filter((b) =>
  catalog.scenes.some((s) => s.block === b),
)

export const settings = [...new Set(catalog.scenes.map((s) => s.setting))].sort()
