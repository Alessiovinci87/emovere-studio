import type { SheetLook } from '../lib/look'
import { CIRCLE, CIRCLE_OFFSET, CUTOUT_GAP, CUTOUT_HEADER_H, CUTOUT_PAGE, cutoutGrid } from '../lib/stars'
import { INK, PageFooter } from './SheetParts'

const mm = (n: number) => `${n}mm`

/** Stella a cinque punte (viewBox 100×100). */
function StarShape({
  className,
  fill,
  stroke,
  strokeWidth,
}: {
  className?: string
  fill: string
  stroke: string
  strokeWidth: number
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path
        d="M50 6 L62.3 36.1 L94.7 38.5 L69.9 59.4 L77.6 91 L50 73.8 L22.4 91 L30.1 59.4 L5.3 38.5 L37.7 36.1 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Cerchietto per la stellina "fatto", sull'angolo in alto a destra della vignetta:
 * lì si incolla il velcro e il bambino attacca la stellina. Misura fissa in mm (2 cm).
 */
export function DoneCircle({ mono }: { mono?: boolean }) {
  return (
    <span
      className={`absolute z-[1] flex items-center justify-center rounded-full border-[0.5mm] border-dashed bg-white ${mono ? '' : 'shadow-sm'}`}
      style={{
        width: mm(CIRCLE),
        height: mm(CIRCLE),
        top: mm(-CIRCLE_OFFSET),
        right: mm(-CIRCLE_OFFSET),
        borderColor: mono ? INK : '#b8ad9c',
      }}
      aria-label="Spazio per la stellina"
    >
      <StarShape className="h-[55%] w-[55%]" fill="none" stroke={mono ? '#777' : '#e3d8c6'} strokeWidth={5} />
    </span>
  )
}

/** Pagina di stelline rotonde da ritagliare (A4 verticale), della misura del cerchietto. */
export function CutoutPage({ title, look }: { title: string; look?: Pick<SheetLook, 'coloring' | 'footer' | 'uppercase'> }) {
  const count = cutoutGrid.cols * cutoutGrid.rows
  const mono = look?.coloring
  return (
    <div
      className={`relative flex flex-col items-center bg-white font-sans text-ink ${look?.uppercase ? 'uppercase' : ''}`}
      style={{ width: mm(CUTOUT_PAGE.w), height: mm(CUTOUT_PAGE.h), padding: mm(CUTOUT_PAGE.margin), gap: '2mm' }}
    >
      <p className="flex items-center text-[4.5mm] font-bold" style={{ height: mm(CUTOUT_HEADER_H) }}>
        ✂ Stelline da ritagliare{title ? ` · ${title}` : ''}
      </p>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${cutoutGrid.cols}, ${mm(CIRCLE)})`, gap: mm(CUTOUT_GAP) }}
      >
        {Array.from({ length: count }, (_, i) => (
          // Il bordo tratteggiato è la linea di taglio: il dischetto è grande quanto il cerchietto
          <div
            key={i}
            className={`flex items-center justify-center rounded-full border-[0.3mm] border-dashed border-[#b8ad9c] ${mono ? 'bg-white' : 'bg-[#fff8e1]'}`}
            style={{ width: mm(CIRCLE), height: mm(CIRCLE) }}
          >
            <StarShape
              className="h-[80%] w-[80%]"
              fill={mono ? 'white' : '#f7c948'}
              stroke={mono ? INK : '#e2a72e'}
              strokeWidth={mono ? 4 : 3}
            />
          </div>
        ))}
      </div>
      <PageFooter footer={look?.footer ?? null} />
    </div>
  )
}
