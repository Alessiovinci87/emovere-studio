import catalogJson from '../data/catalog.json'
import type { Catalog, Character, Scene } from '../types'

/** Catalogo disegnato (fonte di verità) */
export const catalog = catalogJson as Catalog

/** Blocco delle vignette generate con AI nell'app */
export const AI_BLOCK = 'X'
const blockLabels: Record<string, string> = { ...catalog.blocks, [AI_BLOCK]: 'Create con AI' }

// Catalogo completo = catalog.json + vignette AI (caricate da /api/library all'avvio)
let scenes: Scene[] = catalog.scenes
let byCode = new Map<string, Scene>()
let searchIndex = new Map<string, string>()
reindex()

function reindex() {
  byCode = new Map(scenes.map((s) => [s.code, s]))
  searchIndex = new Map(scenes.map((s) => [s.code, normalize([s.title_f, s.title_m, ...s.tags].join(' '))]))
}

/** Unisce al catalogo le vignette generate con AI (sostituisce quelle caricate in precedenza). */
export function setAiScenes(aiScenes: Scene[]) {
  scenes = [...catalog.scenes, ...aiScenes.map((s) => ({ ...s, ai: true }))]
  reindex()
}

export function getScene(code: string): Scene | undefined {
  return byCode.get(code)
}

export function blockLabel(block: string): string {
  return blockLabels[block] ?? block
}

export function sceneTitle(scene: Scene, character: Character): string {
  return character === 'bambina' ? scene.title_f : scene.title_m
}

/**
 * - `web`: WebP qualità 90 a dimensione piena (schermo, PDF WhatsApp)
 * - `original`: PNG originale (PDF stampa)
 * Le vignette AI hanno un'unica immagine WebP 1024 px, servita da /api/image.
 */
export type ImageVariant = 'web' | 'original'

export function sceneImage(code: string, character: Character, variant: ImageVariant = 'web'): string {
  const ai = byCode.get(code)?.images?.[character]
  if (ai) return ai
  return variant === 'original'
    ? `/library/scenes/${character}/${code}_${character}.png`
    : `/library/webp/${character}/${code}_${character}.webp`
}

export function sceneThumb(code: string, character: Character): string {
  return byCode.get(code)?.images?.[character] ?? `/library/thumbs/${character}/${code}_${character}.webp`
}

/** Minuscolo e senza accenti, per una ricerca tollerante. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface SceneFilters {
  query: string
  block: string | null
  setting: string | null
  character: Character
}

export function filterScenes(f: SceneFilters): Scene[] {
  const words = normalize(f.query).split(/\s+/).filter(Boolean)
  return scenes.filter((s) => {
    if (f.block && s.block !== f.block) return false
    if (f.setting && s.setting !== f.setting) return false
    if (!s.characters.includes(f.character)) return false
    const haystack = searchIndex.get(s.code) ?? ''
    return words.every((w) => haystack.includes(w))
  })
}

/** Blocchi che hanno almeno una scena, in ordine (le vignette AI in fondo). */
export function usedBlocks(): string[] {
  return [...Object.keys(catalog.blocks), AI_BLOCK].filter((b) => scenes.some((s) => s.block === b))
}

export function usedSettings(): string[] {
  return [...new Set(scenes.map((s) => s.setting))].sort()
}
