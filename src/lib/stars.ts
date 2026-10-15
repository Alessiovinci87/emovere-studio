// Stellina "fatto" attaccata col velcro sul cerchietto in alto a destra della vignetta.
// Misure in mm, le stesse per il cerchietto sulla scheda e per le stelline da ritagliare.

/** Diametro del cerchietto: adatto ai dischetti di velcro più comuni (19-22 mm) */
export const CIRCLE = 20
/** Quanto il cerchietto sporge oltre l'angolo della vignetta, per coprire meno illustrazione */
export const CIRCLE_OFFSET = 3

/** Pagina delle stelline da ritagliare: A4 verticale */
export const CUTOUT_PAGE = { w: 210, h: 297, margin: 10 }
export const CUTOUT_HEADER_H = 8
/** Spazio tra un dischetto e l'altro, per tagliare comodamente */
export const CUTOUT_GAP = 3

export const cutoutGrid = {
  cols: Math.floor((CUTOUT_PAGE.w - 2 * CUTOUT_PAGE.margin + CUTOUT_GAP) / (CIRCLE + CUTOUT_GAP)),
  rows: Math.floor((CUTOUT_PAGE.h - 2 * CUTOUT_PAGE.margin - CUTOUT_HEADER_H - 2 + CUTOUT_GAP) / (CIRCLE + CUTOUT_GAP)),
}
