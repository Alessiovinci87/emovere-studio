import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react'
import { getScene, sceneTitle } from '../lib/catalog'
import { lookImage } from '../lib/look'
import { stepColors, type Template } from '../lib/sheet'
import type { Cell, CellSymbol, Character } from '../types'
import { INK, TimeClock, showDigitalLabel, timeClass, useLook } from './SheetParts'
import { DoneCircle } from './Stars'
import { SymbolIcon, cornerClass } from './SymbolIcon'

interface Props {
  cell: Cell
  index: number
  character: Character
  template: Template
  /** Cerchietto per la stellina "fatto" sull'angolo in alto a destra della vignetta */
  doneCircle: boolean
}

interface EditProps extends Props {
  /** Touch: riquadro selezionato con un tocco, mostra la barra dei comandi */
  selected: boolean
  /** Touch: un tocco sul riquadro pieno lo seleziona (assente su desktop, dove c'è l'hover) */
  onSelect?: () => void
  onChoose: () => void
  onSymbol: () => void
  onClear: () => void
  /** Agenda: copia la vignetta nello stesso momento del giorno dopo */
  onCopyNext?: () => void
  onChange: (patch: Partial<Cell>) => void
}

/** I campi di testo non devono far partire il trascinamento del riquadro. */
const stopDrag = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
}

/** Frase iniziale sotto la vignetta: titolo della scena, oppure vuota nei modelli che la vogliono libera. */
function defaultTextFor(cell: Cell, character: Character, template: Template): string {
  const scene = cell.code ? getScene(cell.code) : undefined
  return scene && template.defaultText ? sceneTitle(scene, character) : ''
}

/** Riquadro modificabile e trascinabile, per l'editor. */
export function SortableSheetCell({ selected, onSelect, onChoose, onSymbol, onClear, onCopyNext, onChange, ...props }: EditProps) {
  const { cell, index, character, template } = props
  const look = useLook()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cell.id })
  const filled = !!(cell.code && getScene(cell.code))
  const defaultText = defaultTextFor(cell, character, template)
  const compact = template.layout === 'agenda'
  const textOnly = look.show === 'text'
  const value = cell.text ?? defaultText
  const setText = (text: string) => onChange({ text: text === defaultText ? null : text })

  return (
    <CellFrame
      {...props}
      frameRef={setNodeRef}
      frameStyle={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      frameProps={{
        ...attributes,
        ...listeners,
        'aria-label': `Riquadro ${index + 1}`,
        'data-cell-id': cell.id,
        onClick: (e) => {
          // I tocchi su campi e pulsanti fanno il loro lavoro; il resto del riquadro lo seleziona
          if (onSelect && filled && !(e.target as HTMLElement).closest('input, textarea, button')) onSelect()
        },
      } as HTMLAttributes<HTMLDivElement>}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-90 shadow-xl' : ''} ${
        selected ? 'outline-[1mm] outline-offset-[0.5mm] outline-sky outline-solid' : ''
      }`}
      time={
        <>
          <TimeClock text={cell.time} mode={look.timeMode} />
          <input
            value={cell.time}
            onChange={(e) => onChange({ time: e.target.value })}
            placeholder="ore"
            maxLength={5}
            aria-label={`Orario riquadro ${index + 1}`}
            className={`${timeClass} ${cell.time || selected ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
            {...stopDrag}
          />
        </>
      }
      overlay={
        <CellTools
          selected={selected}
          compact={compact}
          onChoose={onChoose}
          onSymbol={textOnly ? undefined : onSymbol}
          onClear={onClear}
          onCopyNext={onCopyNext}
        />
      }
      empty={<EmptyPick onClick={onChoose} label={compact || template.layout === 'checklist' ? 'Scegli' : undefined} />}
      text={(variant) =>
        variant === 'big' ? (
          <div className="flex h-full items-center justify-center">
            <GrowingText
              value={value}
              onChange={setText}
              placeholder="Scrivi il passaggio"
              label={`Frase riquadro ${index + 1}`}
              className={bigTextClass}
              fontSize={bigTextSize}
            />
          </div>
        ) : variant === 'row' ? (
          <GrowingText
            value={value}
            onChange={setText}
            placeholder={filled ? '' : 'Scrivi il passaggio'}
            label={`Frase riquadro ${index + 1}`}
            className={rowTextClass}
            fontSize={rowTextSize(template)}
          />
        ) : (
          <textarea
            value={value}
            onChange={(e) => setText(e.target.value)}
            rows={compact ? 1 : 2}
            placeholder={compact ? (filled ? 'frase' : '') : filled ? '' : 'Frase'}
            aria-label={`Frase riquadro ${index + 1}`}
            className={compact ? compactTextClass : textClass}
            style={{ fontSize: `${template.textMm}mm` }}
            {...stopDrag}
          />
        )
      }
    />
  )
}

/** Riquadro statico, per l'export PDF: niente campi, pulsanti o segnaposto. */
export function PrintSheetCell(props: Props) {
  const { cell, character, template } = props
  const look = useLook()
  const text = cell.text ?? defaultTextFor(cell, character, template)
  const compact = template.layout === 'agenda'

  return (
    <CellFrame
      {...props}
      time={
        cell.time ? (
          <>
            <TimeClock text={cell.time} mode={look.timeMode} />
            {showDigitalLabel(cell.time, look.timeMode) && <span className={timeClass}>{cell.time}</span>}
          </>
        ) : null
      }
      text={(variant) =>
        variant === 'big' ? (
          <div className="flex h-full items-center justify-center">
            <p className={`${bigTextClass} line-clamp-4`} style={{ fontSize: bigTextSize }}>
              {text}
            </p>
          </div>
        ) : variant === 'row' ? (
          <p className={`${rowTextClass} line-clamp-2`} style={{ fontSize: rowTextSize(template) }}>
            {text}
          </p>
        ) : compact ? (
          <p className={`${compactTextClass} truncate`} style={{ fontSize: `${template.textMm}mm` }}>
            {text}
          </p>
        ) : (
          <p className={`${textClass} line-clamp-2 h-[calc(2lh+3px)]`} style={{ fontSize: `${template.textMm}mm` }}>
            {text}
          </p>
        )
      }
    />
  )
}

const textClass = 'sheet-field mt-[1mm] shrink-0 whitespace-pre-wrap px-[1mm] text-center font-bold leading-[1.15]'
const compactTextClass = 'sheet-field mt-[0.5mm] h-[calc(1lh+3px)] shrink-0 px-[0.5mm] text-center font-bold leading-[1.15]'
/** Solo testo: la frase prende il posto della vignetta, grande e al centro */
const bigTextClass = 'sheet-field w-full whitespace-pre-wrap text-center font-bold leading-[1.15]'
const bigTextSize = 'min(14mm, 15cqw, 24cqh)'
/** Checklist: frase accanto alla vignetta; il corpo si riduce quando le righe sono tante */
const rowTextClass = 'sheet-field w-full whitespace-pre-wrap font-bold leading-[1.15]'
const rowTextSize = (template: Template) => `min(${template.textMm}mm, 27cqh)`

/** Dove va la frase: sotto la vignetta, al suo posto (solo testo), accanto (checklist) */
type TextVariant = 'caption' | 'big' | 'row'

/**
 * Campo di testo alto quanto il suo contenuto (una copia invisibile del testo dà l'altezza):
 * così, centrato nel riquadro, sta dove starà nel PDF. Al massimo 4 righe, poi scorre.
 */
function GrowingText({
  value,
  onChange,
  placeholder,
  label,
  className,
  fontSize,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  className: string
  fontSize: string
}) {
  return (
    <div className="grid max-h-full w-full overflow-hidden" style={{ fontSize }}>
      <span aria-hidden="true" className={`${className} invisible line-clamp-4 [grid-area:1/1]`}>
        {(value || placeholder || ' ') + ' '}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        placeholder={placeholder}
        aria-label={label}
        className={`${className} h-full resize-none overflow-hidden [grid-area:1/1]`}
        {...stopDrag}
      />
    </div>
  )
}

interface FrameProps extends Props {
  time: ReactNode
  text: (variant: TextVariant) => ReactNode
  overlay?: ReactNode
  empty?: ReactNode
  className?: string
  frameRef?: Ref<HTMLDivElement>
  frameStyle?: CSSProperties
  frameProps?: HTMLAttributes<HTMLDivElement>
}

/** Struttura comune del riquadro: è la stessa a schermo e nel PDF. */
function CellFrame({
  cell,
  index,
  character,
  template,
  doneCircle,
  time,
  text,
  overlay,
  empty,
  className = '',
  frameRef,
  frameStyle,
  frameProps,
}: FrameProps) {
  const look = useLook()
  const mono = look.coloring
  const scene = cell.code ? getScene(cell.code) : undefined
  const color = stepColors[index % stepColors.length]
  const label = template.cellLabels?.[index]
  const compact = template.layout === 'agenda'
  const highlighted = template.highlight === index
  const borderWidth = highlighted ? '1.4mm' : compact ? '0.4mm' : '0.6mm'
  const showImage = look.show !== 'text'
  const showText = look.show !== 'images'
  const showNumber = template.numbered && look.numbers
  // Senza numeri la colonna a sinistra resta solo per l'orario, se c'è
  const numberColumn = showNumber || (template.times && cell.time.trim() !== '')

  const number = (
    <span
      className={`flex h-[11mm] w-[11mm] shrink-0 items-center justify-center rounded-full text-[6.5mm] font-bold leading-none ${
        mono ? 'border-[0.6mm] bg-white' : 'text-white shadow-sm'
      }`}
      style={mono ? { borderColor: INK, color: INK } : { backgroundColor: color }}
    >
      {index + 1}
    </span>
  )

  const picture = scene ? (
    <>
      <SceneSquare code={scene.code} character={character} symbol={cell.symbol} doneCircle={doneCircle} />
      {overlay}
    </>
  ) : look.slots ? (
    <div
      className="absolute inset-0 m-auto size-[min(100cqw,100cqh)] rounded-[7%] border-[0.5mm] border-dashed"
      style={{ borderColor: mono ? INK : '#b8ad9c' }}
    />
  ) : (
    empty
  )

  if (template.layout === 'checklist') {
    // Riga: numero, vignetta piccola, frase, casella da spuntare
    return (
      <div
        ref={frameRef}
        style={{ ...frameStyle, borderColor: mono ? INK : `${color}66`, borderWidth }}
        className={`group relative flex min-h-0 items-center gap-[3mm] rounded-[4mm] bg-white px-[3mm] py-[1.5mm] [container-type:size] ${className}`}
        {...frameProps}
      >
        {showNumber && number}
        {showImage && <div className="relative h-full w-[100cqh] shrink-0 [container-type:size]">{picture}</div>}
        <div className="min-w-0 flex-1">{(showText || !showImage) && text('row')}</div>
        <span
          aria-hidden="true"
          className="h-[min(12mm,70cqh)] w-[min(12mm,70cqh)] shrink-0 rounded-[2mm] border-[0.7mm] bg-white"
          style={{ borderColor: mono ? INK : color }}
        />
      </div>
    )
  }

  return (
    <div
      ref={frameRef}
      style={{ ...frameStyle, borderColor: mono ? INK : highlighted ? color : `${color}66`, borderWidth }}
      className={`group relative flex min-h-0 flex-col bg-white ${compact ? 'rounded-[2.5mm] p-[1mm]' : 'rounded-[4mm] p-[2mm]'} ${className}`}
      {...frameProps}
    >
      {label && (
        <span
          className="mb-[1.5mm] self-start rounded-full border-[0.5mm] px-[5mm] py-[1mm] text-[7mm] font-bold uppercase leading-tight"
          style={mono ? { borderColor: INK, color: INK, background: 'white' } : { borderColor: color, backgroundColor: color, color: 'white' }}
        >
          {label}
        </span>
      )}

      <div className="flex min-h-0 flex-1 gap-[1.5mm]">
        {numberColumn && (
          /* Colonna a sinistra: numero del passaggio e, sotto, l'orario */
          <div className="flex w-[13mm] shrink-0 flex-col items-center gap-[1.5mm]">
            {showNumber && number}
            {template.times && time}
          </div>
        )}

        {/* container-type: size → le unità cqw/cqh misurano lo spazio disponibile per la vignetta (o la frase) */}
        <div className="relative min-h-0 flex-1 [container-type:size]">
          {showImage ? (
            picture
          ) : (
            <>
              {text('big')}
              {scene && overlay}
            </>
          )}
        </div>
      </div>

      {showImage && showText && text('caption')}
    </div>
  )
}

/**
 * Vignetta quadrata dentro un contenitore con `container-type: size`: il box coincide con l'immagine,
 * così angoli arrotondati e simboli la seguono. Le vignette della libreria sono quadrate.
 */
export function SceneSquare({
  code,
  character,
  symbol,
  doneCircle,
}: {
  code: string
  character: Character
  symbol?: CellSymbol | null
  doneCircle?: boolean
}) {
  const look = useLook()
  const scene = getScene(code)
  // L'angolo in alto a destra è del cerchietto: un simbolo messo lì passa in alto a sinistra
  const corner = symbol && doneCircle && symbol.corner === 'tr' ? 'tl' : symbol?.corner
  return (
    <div className="absolute inset-0 m-auto size-[min(100cqw,100cqh)]">
      <img
        src={lookImage(look, code, character)}
        alt={scene ? sceneTitle(scene, character) : ''}
        draggable={false}
        className={`h-full w-full rounded-[7%] object-cover ${look.coloring ? 'border-[0.3mm] border-[#222]' : ''}`}
      />
      {symbol && corner && (
        <SymbolIcon kind={symbol.kind} mono={look.coloring} className={`absolute w-[30%] ${cornerClass[corner]}`} />
      )}
      {doneCircle && <DoneCircle mono={look.coloring} />}
    </div>
  )
}

/**
 * Comandi di una vignetta piena. Visibili (e cliccabili) solo con hover, focus o selezione touch:
 * mai pulsanti invisibili sotto il dito. Da selezionata (touch) sono più grandi, in colonna al centro.
 * `compact` (Agenda): pulsanti piccoli in colonna, per stare nei riquadri stretti.
 */
export function CellTools({
  selected,
  compact,
  onChoose,
  onSymbol,
  onClear,
  onCopyNext,
}: {
  selected: boolean
  compact?: boolean
  onChoose: () => void
  onSymbol?: () => void
  onClear: () => void
  onCopyNext?: () => void
}) {
  const big = selected && !compact
  const visible = selected
    ? 'opacity-100'
    : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'
  const layout = compact
    ? 'inset-0 flex-col items-center justify-center gap-[0.6mm]'
    : selected
      ? 'inset-0 flex-col items-center justify-center gap-[2mm]'
      : 'inset-x-0 bottom-[1mm] gap-[1.5mm]'
  return (
    <div className={`absolute z-[2] flex justify-center transition ${visible} ${layout}`}>
      <CellButton big={big} small={compact} onClick={onChoose}>
        Cambia
      </CellButton>
      {onSymbol && (
        <CellButton big={big} small={compact} onClick={onSymbol}>
          Simbolo
        </CellButton>
      )}
      <CellButton big={big} small={compact} onClick={onClear}>
        Svuota
      </CellButton>
      {onCopyNext && (
        <CellButton big={big} small={compact} onClick={onCopyNext}>
          → Domani
        </CellButton>
      )}
    </div>
  )
}

/** Riquadro vuoto: apre la libreria. */
export function EmptyPick({ onClick, label = 'Scegli vignetta' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex h-full w-full flex-col items-center justify-center gap-[1mm] rounded-[3mm] border-[0.5mm] border-dashed border-line text-[3.6mm] font-bold normal-case text-muted transition hover:border-sky hover:bg-sky-soft hover:text-ink"
    >
      <span className="text-[8mm] leading-none">+</span>
      {label}
    </button>
  )
}

function CellButton({
  big,
  small,
  onClick,
  children,
}: {
  big?: boolean
  small?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full bg-white/95 font-bold normal-case text-ink shadow hover:bg-sky-soft ${
        big ? 'min-w-[22mm] px-[4mm] py-[2mm] text-[4mm]' : small ? 'px-[1.8mm] py-[0.4mm] text-[2.6mm]' : 'px-[3mm] py-[1mm] text-[3.2mm]'
      }`}
    >
      {children}
    </button>
  )
}
