import type { Corner, SymbolKind } from '../types'

export const symbolOptions: { kind: SymbolKind; label: string }[] = [
  { kind: 'check', label: 'V verde (sì, va bene)' },
  { kind: 'cross', label: 'X rossa (no)' },
  { kind: 'forbidden', label: 'Divieto' },
]

export const cornerOptions: { corner: Corner; label: string }[] = [
  { corner: 'tl', label: 'In alto a sinistra' },
  { corner: 'tr', label: 'In alto a destra' },
  { corner: 'bl', label: 'In basso a sinistra' },
  { corner: 'br', label: 'In basso a destra' },
]

const GREEN = '#3f9a4a'
const RED = '#d6453d'

/** Simbolo disegnato in SVG: bordo bianco per staccarsi da qualunque illustrazione. */
export function SymbolIcon({ kind, className }: { kind: SymbolKind; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {kind === 'check' && (
        <>
          <circle cx="50" cy="50" r="46" fill="white" />
          <circle cx="50" cy="50" r="40" fill={GREEN} />
          <path d="M28 52 L44 67 L73 35" fill="none" stroke="white" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === 'cross' && (
        <>
          <circle cx="50" cy="50" r="46" fill="white" />
          <circle cx="50" cy="50" r="40" fill={RED} />
          <path d="M34 34 L66 66 M66 34 L34 66" fill="none" stroke="white" strokeWidth="11" strokeLinecap="round" />
        </>
      )}
      {kind === 'forbidden' && (
        <>
          <circle cx="50" cy="50" r="44" fill="white" fillOpacity="0.55" stroke="white" strokeWidth="8" />
          <circle cx="50" cy="50" r="38" fill="none" stroke={RED} strokeWidth="11" />
          <path d="M23 23 L77 77" stroke={RED} strokeWidth="11" strokeLinecap="butt" />
        </>
      )}
    </svg>
  )
}

export const cornerClass: Record<Corner, string> = {
  tl: 'left-[-4%] top-[-4%]',
  tr: 'right-[-4%] top-[-4%]',
  bl: 'bottom-[-4%] left-[-4%]',
  br: 'bottom-[-4%] right-[-4%]',
}
