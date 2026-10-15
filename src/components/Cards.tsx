import { Fragment, type ReactNode } from 'react'
import { getScene, sceneTitle } from '../lib/catalog'
import { lookImage, type SheetLook } from '../lib/look'
import { templates } from '../lib/sheet'
import type { Sheet } from '../types'
import { INK, PageFooter, SheetLookContext } from './SheetParts'
import { visibleIndexes } from './SheetView'

// Carte da ritagliare: le vignette della scheda come carte singole su A4 verticale,
// con linee di taglio tratteggiate. Facoltativa: la striscia agenda con caselle vuote e "FINITO".

export type CardSize = 'S' | 'M' | 'L'

/** Larghezza della carta in mm: piccola 5 cm, media 7 cm, grande 9 cm */
export const CARD_WIDTH: Record<CardSize, number> = { S: 50, M: 70, L: 90 }
export const CARD_LABEL: Record<CardSize, string> = { S: 'Piccola · 5 cm', M: 'Media · 7 cm', L: 'Grande · 9 cm' }

const PAGE = { w: 210, h: 297, margin: 10 }
const HEADER_H = 8
const GAP = 2
const mm = (n: number) => `${n}mm`

/** Misure di una carta: larghezza, altezza (vignetta quadrata + frase su due righe), corpo del testo. */
export function cardMetrics(size: CardSize) {
  const w = CARD_WIDTH[size]
  const font = Math.round(w * 0.07 * 10) / 10
  const inset = 1.5 // distanza tra linea di taglio e bordo della carta
  const pad = 2.5
  const image = w - 2 * (inset + pad)
  const h = Math.round((image + 2 * (inset + pad) + 2 * 1.15 * font + 1.5) * 10) / 10
  const cols = Math.floor((PAGE.w - 2 * PAGE.margin) / w)
  const rows = Math.floor((PAGE.h - 2 * PAGE.margin - HEADER_H - GAP) / h)
  return { w, h, font, inset, pad, image, cols, rows, perPage: cols * rows }
}

interface CardData {
  code: string
  text: string
}

/** Vignette della scheda in ordine, con la frase sotto (o il titolo della scena se la frase è vuota). */
export function sheetCards(sheet: Sheet): CardData[] {
  const template = templates[sheet.template]
  return visibleIndexes(sheet, template)
    .map((i) => sheet.cells[i])
    .filter((c) => c.code && getScene(c.code))
    .map((c) => {
      const scene = getScene(c.code!)!
      const text = c.text?.trim() ? c.text : sceneTitle(scene, sheet.character)
      return { code: c.code!, text }
    })
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Pagine delle carte (una o più) e, se richiesta, della striscia agenda. */
export function cardPages(sheet: Sheet, look: SheetLook, size: CardSize, strip: boolean): ReactNode[] {
  const cards = sheetCards(sheet)
  const m = cardMetrics(size)
  const pages: ReactNode[] = chunk(cards, m.perPage).map((group, p, all) => (
    <CardsPage key={`c${p}`} look={look} title={`✂ Carte da ritagliare · ${sheet.title}${all.length > 1 ? ` (${p + 1}/${all.length})` : ''}`}>
      <div
        className="grid self-center border-l-[0.3mm] border-t-[0.3mm] border-dashed border-[#9c9285]"
        style={{ gridTemplateColumns: `repeat(${Math.min(m.cols, group.length)}, ${mm(m.w)})` }}
      >
        {group.map((card, i) => (
          <div
            key={i}
            className="border-b-[0.3mm] border-r-[0.3mm] border-dashed border-[#9c9285]"
            style={{ width: mm(m.w), height: mm(m.h), padding: mm(m.inset) }}
          >
            <div
              className="flex h-full flex-col items-center rounded-[3mm] border-[0.4mm]"
              style={{ padding: mm(m.pad), borderColor: look.coloring ? INK : '#d9cdb8' }}
            >
              <img
                src={lookImage(look, card.code, sheet.character)}
                alt=""
                className="shrink-0 rounded-[2mm] object-cover"
                style={{ width: mm(m.image), height: mm(m.image) }}
              />
              <p
                className="line-clamp-2 flex flex-1 items-center text-center font-bold leading-[1.15]"
                style={{ fontSize: mm(m.font), marginTop: '1mm' }}
              >
                {card.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </CardsPage>
  ))
  if (strip) pages.push(...stripPages(sheet, look, cards.length, m))
  return pages
}

/**
 * Striscia agenda: caselle vuote grandi come le carte (una per carta), poi "FINITO" più grande.
 * Le caselle scendono in colonna; se non stanno, continuano nella colonna accanto o nella pagina dopo.
 */
function stripPages(sheet: Sheet, look: SheetLook, count: number, m: ReturnType<typeof cardMetrics>): ReactNode[] {
  const finishH = Math.round(m.h * 1.5)
  const usableH = PAGE.h - 2 * PAGE.margin - HEADER_H - GAP
  const cols = Math.floor((PAGE.w - 2 * PAGE.margin + 6) / (m.w + 6))
  type Item = { kind: 'box'; n: number } | { kind: 'finish' }
  const items: Item[] = [...Array.from({ length: count }, (_, n) => ({ kind: 'box' as const, n: n + 1 })), { kind: 'finish' }]

  // Riempie colonne dall'alto in basso
  const columns: Item[][] = []
  let current: Item[] = []
  let used = 0
  for (const item of items) {
    const h = item.kind === 'finish' ? finishH : m.h
    if (used + h > usableH && current.length > 0) {
      columns.push(current)
      current = []
      used = 0
    }
    current.push(item)
    used += h
  }
  columns.push(current)

  return chunk(columns, cols).map((pageCols, p, all) => (
    <CardsPage key={`s${p}`} look={look} title={`Striscia agenda · ${sheet.title}${all.length > 1 ? ` (${p + 1}/${all.length})` : ''}`}>
      <div className="flex items-start justify-center gap-[6mm]">
        {pageCols.map((col, c) => (
          <div key={c} className="flex flex-col border-[0.5mm]" style={{ borderColor: look.coloring ? INK : '#9c9285' }}>
            {col.map((item, i) => (
              <Fragment key={i}>
                {item.kind === 'box' ? (
                  <div
                    className="relative border-b-[0.3mm] border-dashed"
                    style={{ width: mm(m.w), height: mm(m.h), borderColor: '#b8ad9c' }}
                  >
                    <span className="absolute left-[2mm] top-[1.5mm] text-[3.5mm] font-bold text-[#b8ad9c]">{item.n}</span>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center gap-[2mm] font-bold"
                    style={{ width: mm(m.w), height: mm(finishH), color: look.coloring ? INK : '#3b3846' }}
                  >
                    <span style={{ fontSize: mm(Math.max(4, m.w * 0.06)), color: look.coloring ? INK : '#f0b54a' }}>★ ★ ★</span>
                    <span className="uppercase" style={{ fontSize: mm(m.w * 0.13) }}>
                      Finito
                    </span>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </CardsPage>
  ))
}

function CardsPage({ look, title, children }: { look: SheetLook; title: string; children: ReactNode }) {
  return (
    <SheetLookContext.Provider value={look}>
      <div
        className={`relative flex flex-col bg-white font-sans text-ink ${look.uppercase ? 'uppercase' : ''}`}
        style={{ width: mm(PAGE.w), height: mm(PAGE.h), padding: mm(PAGE.margin), gap: mm(GAP) }}
      >
        <p className="flex shrink-0 items-center justify-center text-[4.5mm] font-bold" style={{ height: mm(HEADER_H) }}>
          {title}
        </p>
        {children}
        <PageFooter footer={look.footer} />
      </div>
    </SheetLookContext.Provider>
  )
}
