import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getScene, sceneImage, sceneTitle } from '../lib/catalog'
import { stepColors } from '../lib/sheet'
import type { Cell, Character } from '../types'

interface Props {
  cell: Cell
  index: number
  character: Character
  numbered: boolean
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

export function SheetCell({ cell, index, character, numbered, onChoose, onClear, onChange }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cell.id,
  })
  const scene = cell.code ? getScene(cell.code) : undefined
  const defaultText = scene ? sceneTitle(scene, character) : ''
  const color = stepColors[index % stepColors.length]

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        borderColor: `${color}66`,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`group relative flex min-h-0 cursor-grab flex-col rounded-[4mm] border-[0.6mm] bg-white p-[2mm] active:cursor-grabbing ${
        isDragging ? 'opacity-90 shadow-xl' : ''
      }`}
      {...attributes}
      {...listeners}
      aria-label={`Riquadro ${index + 1}`}
    >
      {numbered && (
        <span
          className="absolute left-[1.5mm] top-[1.5mm] z-[1] flex h-[11mm] w-[11mm] items-center justify-center rounded-full text-[6.5mm] font-bold leading-none text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          {index + 1}
        </span>
      )}

      <input
        value={cell.time}
        onChange={(e) => onChange({ time: e.target.value })}
        placeholder="ore"
        maxLength={5}
        aria-label={`Orario riquadro ${index + 1}`}
        className={`sheet-field absolute right-[1.5mm] top-[1.5mm] z-[1] w-[16mm] rounded-full bg-white/90 px-[1.5mm] py-[0.5mm] text-center text-[3.6mm] font-bold ${
          cell.time ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
        {...stopDrag}
      />

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {scene ? (
          <>
            <img
              src={sceneImage(scene.code, character)}
              alt={defaultText}
              draggable={false}
              className="h-full w-full rounded-[3mm] object-contain"
            />
            <div
              data-noexport
              className="absolute inset-x-0 bottom-[1mm] flex justify-center gap-[1.5mm] opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
            >
              <CellButton onClick={onChoose}>Cambia</CellButton>
              <CellButton onClick={onClear}>Svuota</CellButton>
            </div>
          </>
        ) : (
          <button
            data-noexport
            onClick={onChoose}
            className="flex h-full w-full flex-col items-center justify-center gap-[1mm] rounded-[3mm] border-[0.5mm] border-dashed border-line text-[3.6mm] font-bold text-muted transition hover:border-sky hover:bg-sky-soft hover:text-ink"
          >
            <span className="text-[8mm] leading-none">+</span>
            Scegli vignetta
          </button>
        )}
      </div>

      <textarea
        value={cell.text ?? defaultText}
        onChange={(e) => onChange({ text: e.target.value === defaultText ? null : e.target.value })}
        rows={2}
        placeholder={scene ? '' : 'Frase'}
        aria-label={`Frase riquadro ${index + 1}`}
        className="sheet-field mt-[1mm] shrink-0 px-[1mm] text-center text-[4.4mm] font-bold leading-[1.15]"
        {...stopDrag}
      />
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
