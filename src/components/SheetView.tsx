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
import { Children, Fragment, useMemo, type ReactNode } from 'react'
import type { ImageVariant } from '../lib/catalog'
import { templates } from '../lib/sheet'
import type { Cell, Sheet } from '../types'
import { PrintSheetCell, SortableSheetCell } from './SheetCell'

interface EditProps {
  sheet: Sheet
  /** Scala dell'anteprima: serve a correggere lo spostamento durante il trascinamento */
  scale: number
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
}

/** Pagina A4 modificabile, per il composer. */
export function SheetView({ sheet, scale, onChange, onChooseScene, onChooseSymbol }: EditProps) {
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
    <SheetPage
      sheet={sheet}
      header={
        <>
          <input
            value={sheet.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Titolo della scheda"
            aria-label="Titolo"
            className={titleClass}
          />
          <input
            value={sheet.subtitle}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="Sottotitolo (facoltativo)"
            aria-label="Sottotitolo"
            className={subtitleClass}
          />
        </>
      }
      grid={(cells) => (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[unscale]} onDragEnd={handleDragEnd}>
          <SortableContext items={sheet.cells.map((c) => c.id)} strategy={rectSortingStrategy}>
            {cells(
              sheet.cells.map((cell, i) => (
                <SortableSheetCell
                  key={cell.id}
                  cell={cell}
                  index={i}
                  character={sheet.character}
                  template={template}
                  onChoose={() => onChooseScene(i)}
                  onSymbol={() => onChooseSymbol(i)}
                  onClear={() => updateCell(i, { code: null, text: null, symbol: null })}
                  onChange={(patch) => updateCell(i, patch)}
                />
              )),
            )}
          </SortableContext>
        </DndContext>
      )}
      rememberLine={(line, i) => (
        <input
          value={line}
          onChange={(e) => setRememberLine(i, e.target.value)}
          placeholder={`Frase ${i + 1}`}
          aria-label={`Ricordo sempre, frase ${i + 1}`}
          className={rememberClass}
        />
      )}
    />
  )
}

/** Pagina A4 statica: è quella che finisce nel PDF. */
export function PrintSheetView({ sheet, imageVariant }: { sheet: Sheet; imageVariant: ImageVariant }) {
  const template = templates[sheet.template]
  return (
    <SheetPage
      sheet={sheet}
      header={
        <>
          <h1 className={titleClass}>{sheet.title}</h1>
          {sheet.subtitle && <p className={subtitleClass}>{sheet.subtitle}</p>}
        </>
      }
      grid={(cells) =>
        cells(
          sheet.cells.map((cell, i) => (
            <PrintSheetCell
              key={cell.id}
              cell={cell}
              index={i}
              character={sheet.character}
              template={template}
              imageVariant={imageVariant}
            />
          )),
        )
      }
      rememberLine={(line) => <span className={`${rememberClass} min-h-[1lh]`}>{line}</span>}
    />
  )
}

const titleClass = 'sheet-field text-center text-[9mm] font-bold leading-tight'
const subtitleClass = 'sheet-field text-center text-[5mm] leading-tight text-muted'
const rememberClass = 'sheet-field px-[1mm] py-[0.5mm]'

interface PageProps {
  sheet: Sheet
  header: ReactNode
  /** Riceve la funzione che dispone i riquadri nella griglia del modello */
  grid: (cells: (children: ReactNode) => ReactNode) => ReactNode
  rememberLine: (line: string, index: number) => ReactNode
}

/** Impaginazione A4 (210 × 297 mm, margini 10 mm), comune a schermo e PDF. */
function SheetPage({ sheet, header, grid, rememberLine }: PageProps) {
  const template = templates[sheet.template]
  const layoutCells = (children: ReactNode) =>
    template.arrows ? (
      // Prima / Poi: riquadri uno sotto l'altro con una freccia in mezzo
      <div className="flex min-h-0 flex-1 flex-col gap-[2mm]">
        {Children.toArray(children).map((child, i) => (
          <Fragment key={i}>
            {i > 0 && <Arrow />}
            <div className="flex min-h-0 flex-1 flex-col *:flex-1">{child}</div>
          </Fragment>
        ))}
      </div>
    ) : (
      <div
        className="grid min-h-0 flex-1 gap-[4mm]"
        style={{
          gridTemplateColumns: `repeat(${template.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${template.rows}, minmax(0, 1fr))`,
        }}
      >
        {children}
      </div>
    )

  return (
    <div className="flex h-[297mm] w-[210mm] flex-col gap-[4mm] bg-white p-[10mm] font-sans text-ink">
      <header className="flex shrink-0 flex-col items-center gap-[1mm]">{header}</header>

      {grid(layoutCells)}

      {sheet.remember.enabled && (
        <section className="shrink-0 rounded-[4mm] bg-butter px-[6mm] py-[3mm]">
          <h3 className="mb-[1mm] text-[5.5mm] font-bold">★ Ricordo sempre</h3>
          <ol className="flex flex-col">
            {sheet.remember.lines.map((line, i) => (
              <li key={i} className="flex items-center gap-[2mm] text-[4.6mm] font-bold">
                <span className="text-peach">●</span>
                {rememberLine(line, i)}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

function Arrow() {
  return (
    <svg viewBox="0 0 60 40" className="mx-auto h-[12mm] shrink-0" aria-hidden="true">
      <path d="M30 4 V30 M14 20 L30 34 L46 20" fill="none" stroke="#c9bfae" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
