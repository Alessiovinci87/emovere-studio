import { sceneImage, type ImageVariant } from './catalog'
import type { AppSettings } from './settings'
import type { CellShow, Character, Sheet, TimeMode } from '../types'

/**
 * Aspetto della pagina, uguale a schermo e nel PDF: stampatello, orologio, piè di pagina,
 * versione da colorare, numeri dei passaggi, immagini e/o testo. Si passa esplicitamente anche all'export (che disegna fuori dall'app).
 */
export interface SheetLook {
  uppercase: boolean
  timeMode: TimeMode
  /** Numeri dei passaggi (nei modelli che li prevedono) */
  numbers: boolean
  /** Vignetta e frase, solo vignetta, solo frase */
  show: CellShow
  /** Versione da colorare: vignette a contorno, numeri, cornici e simboli in bianco e nero */
  coloring: boolean
  /** Piè di pagina con logo e nome del centro; null = niente piè di pagina */
  footer: { logo: string | null; name: string } | null
  imageVariant: ImageVariant
  /** Vignette con la versione da colorare già pronta, chiavi "A01_bambina" */
  coloringKeys: ReadonlySet<string>
  /** Base della versione da riordinare: quadrato tratteggiato nei riquadri vuoti, dove attaccare la carta */
  slots?: boolean
}

export function coloringKey(code: string, character: Character): string {
  return `${code}_${character}`
}

export function coloringPath(code: string, character: Character): string {
  return `coloring/${code}_${character}_colorare.png`
}

/** Immagine della vignetta secondo l'aspetto: a contorno se richiesta e disponibile. */
export function lookImage(look: SheetLook, code: string, character: Character): string {
  if (look.coloring && look.coloringKeys.has(coloringKey(code, character))) {
    return `/api/image?p=${encodeURIComponent(coloringPath(code, character))}`
  }
  return sceneImage(code, character, look.imageVariant)
}

/** Il piè di pagina si mostra se c'è un logo o un nome e la scheda non lo ha spento. */
export function footerFor(sheet: Sheet, settings: AppSettings): SheetLook['footer'] {
  const has = !!settings.logo || settings.centerName.trim() !== ''
  const show = sheet.showLogo ?? !!settings.logo
  return has && show ? { logo: settings.logo, name: settings.centerName.trim() } : null
}

export function lookFor(
  sheet: Sheet,
  settings: AppSettings,
  coloringKeys: ReadonlySet<string>,
  imageVariant: ImageVariant,
): SheetLook {
  return {
    uppercase: sheet.uppercase,
    timeMode: sheet.timeMode,
    numbers: sheet.sequence.numbers,
    show: sheet.sequence.show,
    coloring: sheet.coloring,
    footer: footerFor(sheet, settings),
    imageVariant,
    coloringKeys,
  }
}

/** "7:45", "7.45", "07:45", "7" → { h, m }; null se non è un orario riconoscibile. */
export function parseTime(text: string): { h: number; m: number } | null {
  const match = text.trim().match(/^(\d{1,2})(?:\s*[:.,h]\s*(\d{2}))?$/i)
  if (!match) return null
  const h = Number(match[1])
  const m = match[2] ? Number(match[2]) : 0
  return h <= 23 && m <= 59 ? { h, m } : null
}
