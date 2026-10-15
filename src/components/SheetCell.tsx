import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, HTMLAttributes, Ref } from 'react'
import { getScene, sceneImage, sceneTitle, type ImageVariant } from '../lib/catalog'
import { stepColors, type Template } from '../lib/sheet'
import type { Cell, Character } from '../types'
import { SymbolIcon, cornerClass } from './SymbolIcon'

interface Props {
  cell: Cell
  index: number
  character: Character
  template: Template
}

interface EditProps extends Props {
  /** Touch: riquadro selezionato con un tocco, mostra la barra dei comandi */
  selected: boolean
  /** Touch: un tocco sul riquadro pieno lo seleziona (assente su desktop, dove c'è l'hover) */
  onSelect?: () => void
  onChoose: () => void
  onSymbol: () => void
  onClear: () => void
  onChange: (patch: Partial<Cell>) => void
}

/** I campi di testo non devono far partire il trascinamento del riquadro. */
const stopDrag = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
}

/** Riquadro modificabile e trascinabile, per il composer. */
export function SortableSheetCell({ selected, onSelect, onChoose, onSymbol, onClear, onChange, ...props }: EditProps) {
  const { cell, index, character } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cell.id,
  })
  const scene = cell.code ? getScene(cell.code) : undefined
  const defaultText = scene ? sceneTitle(scene, character) : ''
  // Comandi visibili (e cliccabili) solo con hover, focus o selezione: mai pulsanti invisibili sotto il dito
  const toolsVisible = selected
    ? 'opacity-100'
    : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'

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
          if (onSelect && scene && !(e.target as HTMLElement).closest('input, textarea, button')) onSelect()
        },
      } as HTMLAttributes<HTMLDivElement>}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-90 shadow-xl' : ''} ${
        selected ? 'outline-[1mm] outline-offset-[0.5mm] outline-sky outline-solid' : ''
      }`}
      imageVariant="web"
      time={
        <input
          value={cell.time}
          onChange={(e) => onChange({ time: e.target.value })}
          placeholder="ore"
          maxLength={5}
          aria-label={`Orario riquadro ${index + 1}`}
          className={`${timeClass} ${cell.time || selected ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
          {...stopDrag}
        />
      }
      overlay={
        <div
          className={`absolute z-[2] flex justify-center transition ${toolsVisible} ${
            // Touch: pulsanti più grandi, in colonna al centro della vignetta
            selected ? 'inset-0 flex-col items-center gap-[2mm]' : 'inset-x-0 bottom-[1mm] gap-[1.5mm]'
          }`}
        >
          <CellButton big={selected} onClick={onChoose}>Cambia</CellButton>
          <CellButton big={selected} onClick={onSymbol}>Simbolo</CellButton>
          <CellButton big={selected} onClick={onClear}>Svuota</CellButton>
        </div>
      }
      empty={
        <button
          onClick={onChoose}
          className="flex h-full w-full flex-col items-center justify-center gap-[1mm] rounded-[3mm] border-[0.5mm] border-dashed border-line text-[3.6mm] font-bold text-muted transition hover:border-sky hover:bg-sky-soft hover:text-ink"
        >
          <span className="text-[8mm] leading-none">+</span>
          Scegli vignetta
        </button>
      }
      text={
        <textarea
          value={cell.text ?? defaultText}
          onChange={(e) => onChange({ text: e.target.value === defaultText ? null : e.target.value })}
          rows={2}
          placeholder={scene ? '' : 'Frase'}
          aria-label={`Frase riquadro ${index + 1}`}
          className={textClass}
          style={{ fontSize: `${props.template.textMm}mm` }}
          {...stopDrag}
        />
      }
    />
  )
}

/** Riquadro statico, per l'export PDF: niente campi, pulsanti o segnaposto. */
export function PrintSheetCell({ imageVariant, ...props }: Props & { imageVariant: ImageVariant }) {
  const { cell, character } = props
  const scene = cell.code ? getScene(cell.code) : undefined
  const text = cell.text ?? (scene ? sceneTitle(scene, character) : '')

  return (
    <CellFrame
      {...props}
      imageVariant={imageVariant}
      time={cell.time ? <span className={timeClass}>{cell.time}</span> : null}
      text={
        <p className={`${textClass} line-clamp-2 h-[calc(2lh+3px)]`} style={{ fontSize: `${props.template.textMm}mm` }}>
          {text}
        </p>
      }
    />
  )
}

const timeClass =
  'sheet-field w-[13mm] rounded-full border-solid border-line px-[1mm] py-[0.3mm] text-center text-[3.4mm] font-bold leading-tight'
const textClass = 'sheet-field mt-[1mm] shrink-0 whitespace-pre-wrap px-[1mm] text-center font-bold leading-[1.15]'

interface FrameProps extends Props {
  imageVariant: ImageVariant
  time: React.ReactNode
  text: React.ReactNode
  overlay?: React.ReactNode
  empty?: React.ReactNode
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
  imageVariant,
  time,
  text,
  overlay,
  empty,
  className = '',
  frameRef,
  frameStyle,
  frameProps,
}: FrameProps) {
  const scene = cell.code ? getScene(cell.code) : undefined
  const color = stepColors[index % stepColors.length]
  const label = template.cellLabels?.[index]

  return (
    <div
      ref={frameRef}
      style={{ ...frameStyle, borderColor: `${color}66` }}
      className={`group relative flex min-h-0 flex-col rounded-[4mm] border-[0.6mm] bg-white p-[2mm] ${className}`}
      {...frameProps}
    >
      {label && (
        <span
          className="mb-[1.5mm] self-start rounded-full px-[5mm] py-[1mm] text-[7mm] font-bold leading-tight text-white"
          style={{ backgroundColor: color }}
        >
          {label}
        </span>
      )}

      <div className="flex min-h-0 flex-1 gap-[1.5mm]">
        {template.numbered && (
          /* Colonna a sinistra: numero del passaggio e, sotto, l'orario */
          <div className="flex w-[13mm] shrink-0 flex-col items-center gap-[1.5mm]">
            <span
              className="flex h-[11mm] w-[11mm] items-center justify-center rounded-full text-[6.5mm] font-bold leading-none text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              {index + 1}
            </span>
            {time}
          </div>
        )}

        {/* container-type: size → le unità cqw/cqh misurano lo spazio disponibile per la vignetta */}
        <div className="relative min-h-0 flex-1 [container-type:size]">
          {scene ? (
            <>
              {/* Le vignette sono quadrate: il box coincide con l'immagine, così angoli e simboli la seguono */}
              <div className="absolute inset-0 m-auto size-[min(100cqw,100cqh)]">
                <img
                  src={sceneImage(scene.code, character, imageVariant)}
                  alt={sceneTitle(scene, character)}
                  draggable={false}
                  className="h-full w-full rounded-[7%] object-cover"
                />
                {cell.symbol && (
                  <SymbolIcon kind={cell.symbol.kind} className={`absolute w-[30%] ${cornerClass[cell.symbol.corner]}`} />
                )}
              </div>
              {overlay}
            </>
          ) : (
            empty
          )}
        </div>
      </div>

      {text}
    </div>
  )
}

function CellButton({ big, onClick, children }: { big?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full bg-white/95 font-bold text-ink shadow hover:bg-sky-soft ${
        big ? 'min-w-[22mm] px-[4mm] py-[2mm] text-[4mm]' : 'px-[3mm] py-[1mm] text-[3.2mm]'
      }`}
    >
      {children}
    </button>
  )
}
