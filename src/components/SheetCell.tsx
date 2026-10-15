import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, HTMLAttributes, Ref } from 'react'
import { getScene, sceneImage, sceneTitle, type ImageVariant } from '../lib/catalog'
import { stepColors } from '../lib/sheet'
import type { Cell, Character } from '../types'

interface Props {
  cell: Cell
  index: number
  character: Character
  numbered: boolean
}

interface EditProps extends Props {
  onChoose: () => void
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
export function SortableSheetCell({ onChoose, onClear, onChange, ...props }: EditProps) {
  const { cell, index, character } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cell.id,
  })
  const scene = cell.code ? getScene(cell.code) : undefined
  const defaultText = scene ? sceneTitle(scene, character) : ''

  return (
    <CellFrame
      {...props}
      frameRef={setNodeRef}
      frameStyle={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      frameProps={{ ...attributes, ...listeners, 'aria-label': `Riquadro ${index + 1}` }}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-90 shadow-xl' : ''}`}
      imageVariant="web"
      time={
        <input
          value={cell.time}
          onChange={(e) => onChange({ time: e.target.value })}
          placeholder="ore"
          maxLength={5}
          aria-label={`Orario riquadro ${index + 1}`}
          className={`${timeClass} ${cell.time ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
          {...stopDrag}
        />
      }
      overlay={
        <div className="absolute inset-x-0 bottom-[1mm] flex justify-center gap-[1.5mm] opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <CellButton onClick={onChoose}>Cambia</CellButton>
          <CellButton onClick={onClear}>Svuota</CellButton>
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
      text={<p className={`${textClass} line-clamp-2 h-[calc(2lh+3px)]`}>{text}</p>}
    />
  )
}

const timeClass =
  'sheet-field absolute right-[1.5mm] top-[1.5mm] z-[1] w-[16mm] rounded-full bg-white/90 px-[1.5mm] py-[0.5mm] text-center text-[3.6mm] font-bold'
const textClass =
  'sheet-field mt-[1mm] shrink-0 whitespace-pre-wrap px-[1mm] text-center text-[4.4mm] font-bold leading-[1.15]'

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
  numbered,
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

  return (
    <div
      ref={frameRef}
      style={{ ...frameStyle, borderColor: `${color}66` }}
      className={`group relative flex min-h-0 flex-col rounded-[4mm] border-[0.6mm] bg-white p-[2mm] ${className}`}
      {...frameProps}
    >
      {numbered && (
        <span
          className="absolute left-[1.5mm] top-[1.5mm] z-[1] flex h-[11mm] w-[11mm] items-center justify-center rounded-full text-[6.5mm] font-bold leading-none text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </span>
      )}

      {time}

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {scene ? (
          <>
            <img
              src={sceneImage(scene.code, character, imageVariant)}
              alt={sceneTitle(scene, character)}
              draggable={false}
              className="h-full w-full rounded-[3mm] object-contain"
            />
            {overlay}
          </>
        ) : (
          empty
        )}
      </div>

      {text}
    </div>
  )
}

function CellButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-white/95 px-[3mm] py-[1mm] text-[3.2mm] font-bold text-ink shadow hover:bg-sky-soft"
    >
      {children}
    </button>
  )
}
