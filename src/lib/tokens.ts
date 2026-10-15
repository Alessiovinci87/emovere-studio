import type { Cell, TokenRow } from '../types'

// Tabella a gettoni su A4 orizzontale. Tutte le misure sono in mm e sono le stesse
// usate per disegnare la pagina: così il calcolo dello spazio coincide con quello che si stampa.

export const PAGE = { w: 297, h: 210, margin: 10 }
/** Titolo (9,5 mm) + sottotitolo (5,5 mm) + spazio */
export const HEADER_H = 16
export const BODY_GAP = 4
export const REWARD_W = 55
export const COL_GAP = 5
/** Casella per la stellina: mai sotto i 2,5 cm, per attaccarci una stellina vera */
export const BOX = 25
export const BOX_GAP = 2
export const ROW_TITLE_H = 6
export const ROW_TITLE_GAP = 1
export const ROW_GAP = 2.5
export const VIGNETTE_GAP = 3

export const BODY_H = PAGE.h - 2 * PAGE.margin - HEADER_H - BODY_GAP
export const ROWS_W = PAGE.w - 2 * PAGE.margin - REWARD_W - COL_GAP

export const MIN_ROWS = 1
export const MAX_ROWS = 6
export const MIN_COUNT = 3
export const MAX_COUNT = 10
export const WEEK_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
export const DEFAULT_REWARD_TEXT = 'Quando completo le stelline…'
export const DEFAULT_ROW: TokenRow = { mode: 'count', count: 5 }

export function rowConfig(cell: Cell): TokenRow {
  return cell.tokens ?? DEFAULT_ROW
}

export function boxCount(row: TokenRow): number {
  return row.mode === 'week' ? WEEK_LABELS.length : row.count
}

/** Quante caselle stanno in una fila accanto a una vignetta di lato `vignette`. */
function perLine(vignette: number): number {
  return Math.floor((ROWS_W - vignette - VIGNETTE_GAP + BOX_GAP) / (BOX + BOX_GAP))
}

export interface RowLayout {
  /** File di caselle (1 o 2) */
  lines: number
  /** Caselle per fila */
  cols: number
  /** Lato della vignetta: alta quanto le caselle */
  vignette: number
  height: number
}

/** Impaginazione di una riga: se le caselle non stanno in una fila, vanno su due. */
export function rowLayout(row: TokenRow): RowLayout {
  const n = boxCount(row)
  const lines = n <= perLine(BOX) ? 1 : 2
  const content = lines * BOX + (lines - 1) * BOX_GAP
  return {
    lines,
    cols: Math.ceil(n / lines),
    vignette: content,
    height: ROW_TITLE_H + ROW_TITLE_GAP + content,
  }
}

function fits(rows: TokenRow[]): boolean {
  if (rows.length < MIN_ROWS || rows.length > MAX_ROWS) return false
  const lines = rows.map(rowLayout)
  if (lines.some((l) => l.cols > perLine(l.vignette))) return false
  const total = lines.reduce((sum, l) => sum + l.height, 0) + ROW_GAP * (rows.length - 1)
  return total <= BODY_H + 0.01
}

/** Cosa si può aggiungere senza scendere sotto i 2,5 cm o uscire dalla pagina. */
export function capacity(cells: Cell[]) {
  const rows = cells.map(rowConfig)
  const withRow = (i: number, row: TokenRow) => rows.map((r, j) => (j === i ? row : r))
  return {
    canAddRow: fits([...rows, DEFAULT_ROW]),
    canIncrease: (i: number) => rows[i].mode === 'count' && rows[i].count < MAX_COUNT && fits(withRow(i, { ...rows[i], count: rows[i].count + 1 })),
    canWeek: (i: number) => fits(withRow(i, { ...rows[i], mode: 'week' })),
    canCount: (i: number) => fits(withRow(i, { ...rows[i], mode: 'count' })),
  }
}

// ——— Pagina delle stelline da ritagliare: A4 verticale, caselle della stessa misura ———

export const CUTOUT_PAGE = { w: 210, h: 297, margin: 10 }
export const CUTOUT_HEADER_H = 8

export const cutoutGrid = {
  cols: Math.floor((CUTOUT_PAGE.w - 2 * CUTOUT_PAGE.margin) / BOX),
  rows: Math.floor((CUTOUT_PAGE.h - 2 * CUTOUT_PAGE.margin - CUTOUT_HEADER_H - 2) / BOX),
}
