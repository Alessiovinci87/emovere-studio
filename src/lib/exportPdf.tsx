import { getFontEmbedCSS, toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { cardPages, type CardSize } from '../components/Cards'
import { PrintSheetView } from '../components/SheetView'
import { CutoutPage } from '../components/Stars'
import type { Sheet } from '../types'
import type { ImageVariant } from './catalog'
import { downloadBlob } from './download'
import { lookFor } from './look'
import type { AppSettings } from './settings'
import { templates } from './sheet'

export type ExportKind = 'stampa' | 'whatsapp'

/**
 * - `full`: la scheda (più le stelline da ritagliare se richieste)
 * - `stars`: solo la pagina delle stelline
 * - `cards`: carte da ritagliare (più l'eventuale striscia agenda)
 */
export type ExportContent = { type: 'full' } | { type: 'stars' } | { type: 'cards'; size: CardSize; strip: boolean }

/** Impostazioni e versioni da colorare disponibili: servono per disegnare le pagine fuori dall'app */
export interface ExportContext {
  settings: AppSettings
  coloringKeys: ReadonlySet<string>
}

interface Preset {
  dpi: number
  images: ImageVariant
  /** Qualità JPEG da provare in ordine; null = PNG senza perdita */
  qualities: (number | null)[]
  maxBytes?: number
}

const presets: Record<ExportKind, Preset> = {
  stampa: { dpi: 300, images: 'original', qualities: [null] },
  whatsapp: { dpi: 150, images: 'web', qualities: [0.85, 0.75, 0.6, 0.45], maxBytes: 2 * 1024 * 1024 },
}

const CSS_DPI = 96

type Orientation = 'portrait' | 'landscape'
interface Page {
  element: ReactNode
  orientation: Orientation
}

function pagesFor(sheet: Sheet, preset: Preset, content: ExportContent, ctx: ExportContext): Page[] {
  const look = lookFor(sheet, ctx.settings, ctx.coloringKeys, preset.images)
  const stars: Page = { element: <CutoutPage title={sheet.title} look={look} />, orientation: 'portrait' }
  switch (content.type) {
    case 'stars':
      return [stars]
    case 'cards':
      return cardPages(sheet, look, content.size, content.strip).map((element) => ({ element, orientation: 'portrait' }))
    default: {
      const pages: Page[] = [{ element: <PrintSheetView sheet={sheet} look={look} />, orientation: templates[sheet.template].orientation }]
      if (sheet.doneCircle && sheet.cutouts) pages.push(stars)
      return pages
    }
  }
}

/** Esporta in PDF A4 e avvia il download. */
export async function exportPdf(sheet: Sheet, kind: ExportKind, content: ExportContent, ctx: ExportContext): Promise<void> {
  const preset = presets[kind]
  const pages = pagesFor(sheet, preset, content, ctx)
  if (pages.length === 0) throw new Error('Non ci sono vignette da esportare.')
  const canvases: HTMLCanvasElement[] = []
  for (const page of pages) canvases.push(await renderPage(page.element, preset))

  let pdf: Blob | undefined
  for (const quality of preset.qualities) {
    pdf = buildPdf(sheet, pages, canvases, quality)
    if (!preset.maxBytes || pdf.size <= preset.maxBytes) break
  }
  downloadBlob(pdf!, fileName(sheet, kind, content))
}

/** Disegna una pagina fuori schermo e la converte in un canvas alla risoluzione richiesta. */
async function renderPage(element: ReactNode, preset: Preset): Promise<HTMLCanvasElement> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(element))
    const page = host.firstElementChild as HTMLElement
    await document.fonts.ready
    await Promise.all([...page.querySelectorAll('img')].map((img) => img.decode()))
    return await toCanvas(page, {
      pixelRatio: preset.dpi / CSS_DPI,
      backgroundColor: '#ffffff',
      fontEmbedCSS: await fontCSS(page),
    })
  } finally {
    root.unmount()
    host.remove()
  }
}

/** Il CSS dei font (Atkinson Hyperlegible) con i file incorporati: si calcola una volta sola. */
let fontCSSCache: Promise<string> | undefined
function fontCSS(node: HTMLElement): Promise<string> {
  fontCSSCache ??= getFontEmbedCSS(node)
  return fontCSSCache
}

function buildPdf(sheet: Sheet, pages: Page[], canvases: HTMLCanvasElement[], jpegQuality: number | null): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: pages[0].orientation, compress: true })
  doc.setProperties({ title: sheet.title || 'Scheda', creator: 'Emovere Studio' })
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage('a4', page.orientation)
    const [w, h] = page.orientation === 'landscape' ? [297, 210] : [210, 297]
    if (jpegQuality === null) {
      doc.addImage(canvases[i], 'PNG', 0, 0, w, h, undefined, 'FAST')
    } else {
      doc.addImage(canvases[i].toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, w, h)
    }
  })
  return doc.output('blob')
}

/**
 * "La mia mattina" + bambina → "La-mia-mattina_bambina.pdf" (WhatsApp: "…_whatsapp.pdf").
 * Solo stelline: "…_stelline.pdf". Carte: "…_carte.pdf".
 */
export function fileName(sheet: Sheet, kind: ExportKind, content: ExportContent): string {
  const title =
    sheet.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'Scheda'
  const suffix = kind === 'whatsapp' ? '_whatsapp' : ''
  if (content.type === 'stars') return `${title}_stelline${suffix}.pdf`
  if (content.type === 'cards') return `${title}_carte${suffix}.pdf`
  return `${title}_${sheet.character}${suffix}.pdf`
}
