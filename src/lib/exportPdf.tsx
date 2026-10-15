import { getFontEmbedCSS, toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { PrintSheetView } from '../components/SheetView'
import type { Sheet } from '../types'
import type { ImageVariant } from './catalog'
import { downloadBlob } from './download'

export type ExportKind = 'stampa' | 'whatsapp'

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

/** Esporta la scheda in PDF A4 e avvia il download. */
export async function exportPdf(sheet: Sheet, kind: ExportKind): Promise<void> {
  const preset = presets[kind]
  const canvas = await renderSheet(sheet, preset)

  let pdf: Blob | undefined
  for (const quality of preset.qualities) {
    pdf = buildPdf(sheet, canvas, quality)
    if (!preset.maxBytes || pdf.size <= preset.maxBytes) break
  }
  downloadBlob(pdf!, fileName(sheet, kind))
}

/** Disegna la scheda fuori schermo e la converte in un canvas alla risoluzione richiesta. */
async function renderSheet(sheet: Sheet, preset: Preset): Promise<HTMLCanvasElement> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<PrintSheetView sheet={sheet} imageVariant={preset.images} />))
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

function buildPdf(sheet: Sheet, canvas: HTMLCanvasElement, jpegQuality: number | null): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  doc.setProperties({ title: sheet.title || 'Scheda', creator: 'Emovere Studio' })
  if (jpegQuality === null) {
    doc.addImage(canvas, 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  } else {
    doc.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, 210, 297)
  }
  return doc.output('blob')
}

/**
 * "La mia mattina" + bambina → "La-mia-mattina_bambina.pdf"
 * (per WhatsApp: "La-mia-mattina_bambina_whatsapp.pdf")
 */
export function fileName(sheet: Sheet, kind: ExportKind): string {
  const title =
    sheet.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'Scheda'
  return `${title}_${sheet.character}${kind === 'whatsapp' ? '_whatsapp' : ''}.pdf`
}
