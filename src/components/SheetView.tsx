import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useMemo } from 'react'
import { templates } from '../lib/sheet'
import type { Cell, Sheet } from '../types'
import { SheetCell } from './SheetCell'

interface Props {
  sheet: Sheet
  /** Scala dell'anteprima: serve a correggere lo spostamento durante il trascinamento */
  scale: number
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
}

/** Pagina A4 (210 × 297 mm, margini 10 mm): è il DOM che verrà esportato in PDF. */
export function SheetView({ sheet, scale, onChange, onChooseScene }: Props) {
  const template = templates[sheet.template]

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const unscale = useMemo<Modifier>(
    () =>
      ({ transform }) => ({ ...transform, x: transform.x / scale, y: transform.y / scale }),
    [scale],
  )

  function updateCell(index: number, patch: Partial<Cell>) {
    onChange({ cells: sheet.cells.map((c, i) => (i === index ? { ...c, ...patch } : c)) })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = sheet.cells.findIndex((c) => c.id === active.id)
    const to = sheet.cells.findIndex((c) => c.id === over.id)
    onChange({ cells: arrayMove(sheet.cells, from, to) })
  }

  function setRememberLine(i: number, value: string) {
    const lines = [...sheet.remember.lines] as Sheet['remember']['lines']
    lines[i] = value
    onChange({ remember: { ...sheet.remember, lines } })
  }

  return (
    <div
      className="flex h-[297mm] w-[210mm] flex-col gap-[4mm] bg-white p-[10mm] font-sans text-ink"
      data-sheet
    >
      <header className="flex shrink-0 flex-col items-center gap-[1mm]">
        <input
          value={sheet.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Titolo della scheda"
          aria-label="Titolo"
          className="sheet-field text-center text-[9mm] font-bold leading-tight"
        />
        <input
          value={sheet.subtitle}
          onChange={(e) => onChange({ subtitle: e.target.value })}
          placeholder="Sottotitolo (facoltativo)"
          aria-label="Sottotitolo"
          className="sheet-field text-center text-[5mm] leading-tight text-muted"
        />
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[unscale]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sheet.cells.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div
            className="grid min-h-0 flex-1 gap-[4mm]"
            style={{
              gridTemplateColumns: `repeat(${template.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${template.rows}, minmax(0, 1fr))`,
            }}
          >
            {sheet.cells.map((cell, i) => (
              <SheetCell
                key={cell.id}
                cell={cell}
                index={i}
                character={sheet.character}
                numbered={template.numbered}
                onChoose={() => onChooseScene(i)}
                onClear={() => updateCell(i, { code: null, text: null })}
                onChange={(patch) => updateCell(i, patch)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {sheet.remember.enabled && (
        <section className="shrink-0 rounded-[4mm] bg-butter px-[6mm] py-[3mm]">
          <h3 className="mb-[1mm] text-[5.5mm] font-bold">★ Ricordo sempre</h3>
          <ol className="flex flex-col">
            {sheet.remember.lines.map((line, i) => (
              <li key={i} className="flex items-center gap-[2mm] text-[4.6mm] font-bold">
                <span className="text-peach">●</span>
                <input
                  value={line}
                  onChange={(e) => setRememberLine(i, e.target.value)}
                  placeholder={`Frase ${i + 1}`}
                  aria-label={`Ricordo sempre, frase ${i + 1}`}
                  className="sheet-field px-[1mm] py-[0.5mm]"
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
