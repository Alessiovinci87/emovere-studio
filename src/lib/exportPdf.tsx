import { getFontEmbedCSS, toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'
import type { ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { PrintSheetView } from '../components/SheetView'
import { CutoutPage } from '../components/TokenBoard'
import type { Sheet } from '../types'
import type { ImageVariant } from './catalog'
import { downloadBlob } from './download'
import { templates } from './sheet'

export type ExportKind = 'stampa' | 'whatsapp'

/** `full` = la scheda (più le stelline da ritagliare se richieste); `stars` = solo la pagina delle stelline */
export type ExportContent = 'full' | 'stars'

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
  element: ReactElement
  orientation: Orientation
}

/** Pagine del PDF: la scheda nel suo orientamento, poi (tabella a gettoni) le stelline in A4 verticale. */
function pagesFor(sheet: Sheet, preset: Preset, content: ExportContent): Page[] {
  const template = templates[sheet.template]
  const stars: Page = { element: <CutoutPage title={sheet.title} />, orientation: 'portrait' }
  if (content === 'stars') return [stars]
  const pages: Page[] = [
    { element: <PrintSheetView sheet={sheet} imageVariant={preset.images} />, orientation: template.orientation },
  ]
  if (template.kind === 'tokens' && sheet.cutouts) pages.push(stars)
  return pages
}

/** Esporta la scheda in PDF A4 e avvia il download. */
export async function exportPdf(sheet: Sheet, kind: ExportKind, content: ExportContent = 'full'): Promise<void> {
  const preset = presets[kind]
  const pages = pagesFor(sheet, preset, content)
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
async function renderPage(element: ReactElement, preset: Preset): Promise<HTMLCanvasElement> {
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
 * Solo stelline: "Le-stelline-di-Sofia_stelline.pdf" (WhatsApp: "…_stelline_whatsapp.pdf").
 */
export function fileName(sheet: Sheet, kind: ExportKind, content: ExportContent = 'full'): string {
  const title =
    sheet.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'Scheda'
  const suffix = kind === 'whatsapp' ? '_whatsapp' : ''
  return content === 'stars' ? `${title}_stelline${suffix}.pdf` : `${title}_${sheet.character}${suffix}.pdf`
}
