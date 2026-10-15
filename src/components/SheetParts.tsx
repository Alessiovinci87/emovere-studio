import { createContext, useContext } from 'react'
import { parseTime, type SheetLook } from '../lib/look'
import type { TimeMode } from '../types'

const defaultLook: SheetLook = {
  uppercase: false,
  timeMode: 'both',
  coloring: false,
  footer: null,
  imageVariant: 'web',
  coloringKeys: new Set(),
}

/** Aspetto della pagina per tutti i componenti al suo interno */
export const SheetLookContext = createContext<SheetLook>(defaultLook)

export function useLook(): SheetLook {
  return useContext(SheetLookContext)
}

/** Nero per la versione da colorare */
export const INK = '#222222'

/**
 * Piè di pagina sottile nel margine inferiore (non toglie spazio alle vignette):
 * logo piccolo e nome del centro, a sinistra. La pagina deve essere `relative`.
 */
export function PageFooter({ footer }: { footer: SheetLook['footer'] }) {
  if (!footer) return null
  return (
    <div className="absolute bottom-[2.5mm] left-[10mm] flex h-[5mm] items-center gap-[2mm] normal-case">
      {footer.logo && <img src={footer.logo} alt="" className="h-full w-auto max-w-[30mm] object-contain" />}
      {footer.name && <span className="text-[3mm] font-bold text-muted">{footer.name}</span>}
    </div>
  )
}

/**
 * Orologio analogico: quadrante pulito, numeri 12-3-6-9, lancetta corta per le ore e lunga per i minuti.
 * La lancetta delle ore avanza con i minuti: 7:45 → tra il 7 e l'8.
 */
export function AnalogClock({ h, m, className }: { h: number; m: number; className?: string }) {
  const hourAngle = ((h % 12) + m / 60) * 30
  const minuteAngle = m * 6
  const hand = (angle: number, length: number) => {
    const rad = (angle * Math.PI) / 180
    return { x2: 50 + length * Math.sin(rad), y2: 50 - length * Math.cos(rad) }
  }
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={`Ore ${h}:${String(m).padStart(2, '0')}`}>
      <circle cx="50" cy="50" r="46" fill="white" stroke={INK} strokeWidth="4" />
      {[
        ['12', 50, 22],
        ['3', 81, 51],
        ['6', 50, 82],
        ['9', 19, 51],
      ].map(([label, x, y]) => (
        <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="17" fontWeight="700" fill={INK}>
          {label}
        </text>
      ))}
      <line x1="50" y1="50" {...hand(hourAngle, 22)} stroke={INK} strokeWidth="7" strokeLinecap="round" />
      <line x1="50" y1="50" {...hand(minuteAngle, 34)} stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="50" r="4.5" fill={INK} />
    </svg>
  )
}

export const timeClass =
  'sheet-field w-[13mm] rounded-full border-solid border-line px-[1mm] py-[0.3mm] text-center text-[3.4mm] font-bold leading-tight'

/** Orologio (se il testo è un orario valido e la modalità lo prevede). */
export function TimeClock({ text, mode }: { text: string; mode: TimeMode }) {
  const time = mode === 'digital' ? null : parseTime(text)
  return time ? <AnalogClock h={time.h} m={time.m} className="h-[12mm] w-[12mm] shrink-0" /> : null
}

/** Etichetta digitale nel PDF: in modalità solo analogico si nasconde se l'orologio c'è. */
export function showDigitalLabel(text: string, mode: TimeMode): boolean {
  if (!text) return false
  return mode !== 'analog' || parseTime(text) === null
}
