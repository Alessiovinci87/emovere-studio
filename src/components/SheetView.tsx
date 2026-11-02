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
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  rectSwappingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Children, Fragment, useMemo, type ReactNode } from 'react'
import type { SheetLook } from '../lib/look'
import { SCALE_COLORS, WEEK_DAYS, agendaIndex, stepColors, templates, usesDoneCircle, type Template } from '../lib/sheet'
import { CIRCLE } from '../lib/stars'
import { useTouchSelection } from '../lib/useTouchSelection'
import type { Cell, Sheet } from '../types'
import { PrintSheetCell, SortableSheetCell } from './SheetCell'
import { INK, PageFooter, SheetLookContext, useLook } from './SheetParts'

interface EditProps {
  sheet: Sheet
  look: SheetLook
  /** Scala dell'anteprima: serve a correggere lo spostamento durante il trascinamento */
  scale: number
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
}

/** Riquadri visibili: tutti, tranne nell'Agenda (giorni e momenti scelti) e nella Checklist (righe scelte). */
export function visibleIndexes(sheet: Sheet, template: Template = templates[sheet.template]): number[] {
  if (template.layout === 'checklist') return sheet.cells.slice(0, sheet.checklist.rows).map((_, i) => i)
  if (template.layout !== 'agenda') return sheet.cells.map((_, i) => i)
  const out: number[] = []
  for (let r = 0; r < sheet.agenda.rows; r++) for (let d = 0; d < sheet.agenda.days; d++) out.push(agendaIndex(r, d))
  return out
}

/** Pagina A4 modificabile, per l'editor. */
export function SheetView({ sheet, look, scale, onChange, onChooseScene, onChooseSymbol }: EditProps) {
  const template = templates[sheet.template]
  const selection = useTouchSelection()
  const agenda = template.layout === 'agenda'

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const unscale = useMemo<Modifier>(
    () =>
      ({ transform }) => ({
        ...transform,
        x: transform.x / scale,
        y: transform.y / scale,
      }),
    [scale],
  )

  function updateCell(index: number, patch: Partial<Cell>) {
    onChange({
      cells: sheet.cells.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = sheet.cells.findIndex((c) => c.id === active.id)
    const to = sheet.cells.findIndex((c) => c.id === over.id)
    if (agenda) {
      // Agenda: i riquadri si scambiano di posto (gli altri giorni non scorrono)
      const cells = [...sheet.cells]
      ;[cells[from], cells[to]] = [cells[to], cells[from]]
      onChange({ cells })
    } else {
      onChange({ cells: arrayMove(sheet.cells, from, to) })
    }
  }

  /** Agenda: copia celle nello stesso momento del giorno dopo (chiede conferma se sovrascrive). */
  function copyToNextDay(pairs: [number, number][]) {
    const overwrite = pairs.filter(([, to]) => sheet.cells[to].code).length
    if (overwrite > 0 && !confirm(`Il giorno dopo ha già ${overwrite === 1 ? 'una vignetta' : `${overwrite} vignette`}: sostituire?`))
      return
    const cells = [...sheet.cells]
    for (const [from, to] of pairs) {
      const src = sheet.cells[from]
      cells[to] = {
        ...cells[to],
        code: src.code,
        text: src.text,
        symbol: src.symbol,
      }
    }
    onChange({ cells })
  }

  function copyColumn(day: number) {
    const pairs: [number, number][] = []
    for (let r = 0; r < sheet.agenda.rows; r++) {
      if (sheet.cells[agendaIndex(r, day)].code) pairs.push([agendaIndex(r, day), agendaIndex(r, day + 1)])
    }
    if (pairs.length > 0) copyToNextDay(pairs)
  }

  function setRememberLine(i: number, value: string) {
    const lines = [...sheet.remember.lines] as Sheet['remember']['lines']
    lines[i] = value
    onChange({ remember: { ...sheet.remember, lines } })
  }

  function setAgendaLabel(i: number, value: string) {
    const labels = [...sheet.agenda.labels] as Sheet['agenda']['labels']
    labels[i] = value
    onChange({ agenda: { ...sheet.agenda, labels } })
  }

  function setScaleLabel(i: number, value: string) {
    const labels = [...sheet.scale.labels] as Sheet['scale']['labels']
    labels[i] = value
    onChange({ scale: { labels } })
  }

  const visible = visibleIndexes(sheet, template)

  return (
    <SheetPage
      sheet={sheet}
      look={look}
      header={
        <>
          <input
            value={sheet.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Titolo della scheda"
            aria-label="Titolo"
            className={titleClass(template)}
          />
          <input
            value={sheet.subtitle}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="Sottotitolo (facoltativo)"
            aria-label="Sottotitolo"
            className={subtitleClass(template)}
          />
        </>
      }
      grid={(layout) => (
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[unscale]} onDragEnd={handleDragEnd}>
          <SortableContext
            items={visible.map((i) => sheet.cells[i].id)}
            strategy={
              agenda
                ? rectSwappingStrategy
                : template.layout === 'checklist' || template.layout === 'scale'
                  ? verticalListSortingStrategy
                  : rectSortingStrategy
            }
          >
            {layout(
              visible.map((i) => {
                const cell = sheet.cells[i]
                const day = i % 7
                return (
                  <SortableSheetCell
                    key={cell.id}
                    cell={cell}
                    index={i}
                    character={sheet.character}
                    template={template}
                    doneCircle={usesDoneCircle(sheet)}
                    selected={selection.isSelected(cell.id)}
                    onSelect={selection.selectHandler(cell.id)}
                    onChoose={() => onChooseScene(i)}
                    onSymbol={() => onChooseSymbol(i)}
                    onClear={() => updateCell(i, { code: null, text: null, symbol: null })}
                    onCopyNext={agenda && day + 1 < sheet.agenda.days ? () => copyToNextDay([[i, i + 1]]) : undefined}
                    onChange={(patch) => updateCell(i, patch)}
                  />
                )
              }),
            )}
          </SortableContext>
        </DndContext>
      )}
      rowLabel={(i) => (
        <textarea
          value={sheet.agenda.labels[i]}
          onChange={(e) => setAgendaLabel(i, e.target.value)}
          rows={2}
          aria-label={`Nome della riga ${i + 1}`}
          className="sheet-field break-words text-center text-[3.4mm] font-bold leading-tight"
        />
      )}
      dayAction={(day) =>
        day + 1 < sheet.agenda.days ? (
          <button
            onClick={() => copyColumn(day)}
            title="Copia questo giorno nel giorno successivo"
            aria-label={`Copia ${WEEK_DAYS[day]} nel giorno successivo`}
            className="absolute -right-[2.5mm] top-1/2 z-[3] -translate-y-1/2 rounded-full bg-white px-[1.2mm] text-[3.4mm] font-bold normal-case text-accent opacity-0 shadow transition hover:opacity-100 focus:opacity-100 group-hover/day:opacity-100"
          >
            →
          </button>
        ) : null
      }
      rememberLine={(line, i) => (
        <input
          value={line}
          onChange={(e) => setRememberLine(i, e.target.value)}
          placeholder={`Frase ${i + 1}`}
          aria-label={`Ricordo sempre, frase ${i + 1}`}
          className={rememberClass}
        />
      )}
      levelLabel={(i) => (
        <textarea
          value={sheet.scale.labels[i]}
          onChange={(e) => setScaleLabel(i, e.target.value)}
          rows={2}
          aria-label={`Nome del livello ${5 - i}`}
          className={levelClass}
        />
      )}
    />
  )
}

/** Pagina A4 statica: è quella che finisce nel PDF. */
export function PrintSheetView({ sheet, look }: { sheet: Sheet; look: SheetLook }) {
  const template = templates[sheet.template]
  return (
    <SheetPage
      sheet={sheet}
      look={look}
      header={
        <>
          <h1 className={titleClass(template)}>{sheet.title}</h1>
          {sheet.subtitle && <p className={subtitleClass(template)}>{sheet.subtitle}</p>}
        </>
      }
      grid={(layout) =>
        layout(
          visibleIndexes(sheet, template).map((i) => (
            <PrintSheetCell
              key={sheet.cells[i].id}
              cell={sheet.cells[i]}
              index={i}
              character={sheet.character}
              template={template}
              doneCircle={usesDoneCircle(sheet)}
            />
          )),
        )
      }
      rowLabel={(i) => (
        <p className="sheet-field whitespace-pre-wrap break-words text-center text-[3.4mm] font-bold leading-tight">
          {sheet.agenda.labels[i]}
        </p>
      )}
      rememberLine={(line) => <span className={`${rememberClass} min-h-[1lh]`}>{line}</span>}
      levelLabel={(i) => <p className={`${levelClass} whitespace-pre-wrap`}>{sheet.scale.labels[i]}</p>}
    />
  )
}

const levelClass = 'sheet-field w-full resize-none break-words text-[4.6mm] font-bold leading-tight'

const titleClass = (t: Template) =>
  `sheet-field text-center font-bold leading-tight ${t.orientation === 'landscape' ? 'text-[8mm]' : 'text-[9mm]'}`
const subtitleClass = (t: Template) =>
  `sheet-field text-center leading-tight text-muted ${t.orientation === 'landscape' ? 'text-[4.5mm]' : 'text-[5mm]'}`
const rememberClass = 'sheet-field px-[1mm] py-[0.5mm]'

interface PageProps {
  sheet: Sheet
  look: SheetLook
  header: ReactNode
  /** Riceve la funzione che dispone i riquadri secondo il modello */
  grid: (layout: (children: ReactNode) => ReactNode) => ReactNode
  /** Agenda: nome del momento della giornata (riga i) */
  rowLabel: (index: number) => ReactNode
  /** Agenda, solo editor: comando nell'intestazione del giorno */
  dayAction?: (day: number) => ReactNode
  rememberLine: (line: string, index: number) => ReactNode
  /** Termometro: nome del livello (riga i, dal più alto) */
  levelLabel?: (index: number) => ReactNode
}

/** Impaginazione A4 (margini 10 mm), verticale o orizzontale, comune a schermo e PDF. */
function SheetPage({ sheet, look, header, grid, rowLabel, dayAction, rememberLine, levelLabel }: PageProps) {
  const template = templates[sheet.template]
  const landscape = template.orientation === 'landscape'
  const mono = look.coloring

  const layoutCells = (children: ReactNode) => {
    const items = Children.toArray(children)
    switch (template.layout) {
      case 'stack':
        // Prima / Poi: uno sotto l'altro con una freccia in mezzo
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-[2mm]">
            {items.map((child, i) => (
              <Fragment key={i}>
                {i > 0 && <Arrow direction="down" />}
                <div className="flex min-h-0 flex-1 flex-col *:flex-1">{child}</div>
              </Fragment>
            ))}
          </div>
        )
      case 'sequence':
        // Prima – Adesso – Dopo: affiancati con frecce
        return (
          <div className="flex min-h-0 flex-1 items-stretch gap-[2mm]">
            {items.map((child, i) => (
              <Fragment key={i}>
                {i > 0 && <Arrow direction="right" />}
                <div className="flex min-w-0 flex-1 flex-col *:flex-1">{child}</div>
              </Fragment>
            ))}
          </div>
        )
      case 'checklist':
        // Righe una sotto l'altra, tutte della stessa altezza
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-[2.5mm]">
            {items.map((child, i) => (
              <div key={i} className="flex min-h-0 flex-1 flex-col *:flex-1">
                {child}
              </div>
            ))}
          </div>
        )
      case 'tokens':
        // Tabella a gettoni: lavoro → guadagno in alto, gettoni da attaccare in basso
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-[4mm]">
            <div className="flex min-h-0 flex-1 items-stretch gap-[2mm]">
              {items.map((child, i) => (
                <Fragment key={i}>
                  {i > 0 && <Arrow direction="right" />}
                  <div className="flex min-w-0 flex-1 flex-col *:flex-1">{child}</div>
                </Fragment>
              ))}
            </div>
            <TokenRow count={sheet.tokens.count} />
          </div>
        )
      case 'wait':
        // Aspetto: mano, conto alla rovescia da 5 a 1, poi cosa viene dopo
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-[3mm]">
            <WaitBanner />
            <Arrow direction="down" />
            <div className="flex min-h-0 flex-1 flex-col *:flex-1">{items}</div>
          </div>
        )
      case 'scale':
        // Termometro: 5 livelli dal più alto al più basso, nome del livello a sinistra
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-[2.5mm]">
            {items.map((child, i) => (
              <div key={i} className="flex min-h-0 flex-1 items-stretch gap-[3mm]">
                <ScaleLevel index={i}>{levelLabel?.(i)}</ScaleLevel>
                <div className="flex min-w-0 flex-1 flex-col *:flex-1">{child}</div>
              </div>
            ))}
          </div>
        )
      case 'agenda':
        return (
          <div
            className="grid min-h-0 flex-1 gap-[1.5mm]"
            style={{
              gridTemplateColumns: `26mm repeat(${sheet.agenda.days}, minmax(0, 1fr))`,
              gridTemplateRows: `7mm repeat(${sheet.agenda.rows}, minmax(0, 1fr))`,
            }}
          >
            <span />
            {WEEK_DAYS.slice(0, sheet.agenda.days).map((day, d) => (
              <div
                key={day}
                className="group/day relative flex items-center justify-center rounded-[2mm] text-[4.2mm] font-bold"
                style={
                  mono
                    ? { border: `0.4mm solid ${INK}`, color: INK }
                    : {
                        backgroundColor: `${stepColors[d % stepColors.length]}33`,
                        color: '#3b3846',
                      }
                }
              >
                {day}
                {dayAction?.(d)}
              </div>
            ))}
            {Array.from({ length: sheet.agenda.rows }, (_, r) => (
              <Fragment key={r}>
                <div className="flex items-center justify-center">{rowLabel(r)}</div>
                {items.slice(r * sheet.agenda.days, (r + 1) * sheet.agenda.days)}
              </Fragment>
            ))}
          </div>
        )
      default:
        return (
          <div
            className="grid min-h-0 flex-1 gap-[4mm]"
            style={{
              gridTemplateColumns: `repeat(${template.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${template.rows}, minmax(0, 1fr))`,
            }}
          >
            {items}
          </div>
        )
    }
  }

  return (
    <SheetLookContext.Provider value={look}>
      <div
        className={`relative flex flex-col bg-white p-[10mm] font-sans text-ink ${landscape ? 'h-[210mm] w-[297mm] gap-[3mm]' : 'h-[297mm] w-[210mm] gap-[4mm]'} ${
          look.uppercase ? 'uppercase' : ''
        }`}
      >
        <header className="flex shrink-0 flex-col items-center gap-[1mm]">{header}</header>

        {grid(layoutCells)}

        {sheet.remember.enabled && !landscape && template.layout !== 'wait' && template.layout !== 'scale' && (
          <RememberBox lines={sheet.remember.lines} renderLine={rememberLine} />
        )}

        <PageFooter footer={look.footer} />
      </div>
    </SheetLookContext.Provider>
  )
}

function RememberBox({ lines, renderLine }: { lines: string[]; renderLine: (line: string, i: number) => ReactNode }) {
  const look = useLook()
  return (
    <section
      className="shrink-0 rounded-[4mm] px-[6mm] py-[3mm]"
      style={look.coloring ? { border: `0.5mm solid ${INK}` } : { backgroundColor: '#fff6d9' }}
    >
      <h3 className="mb-[1mm] text-[5.5mm] font-bold">★ Ricordo sempre</h3>
      <ol className="flex flex-col">
        {lines.map((line, i) => (
          <li key={i} className="flex items-center gap-[2mm] text-[4.6mm] font-bold">
            <span style={{ color: look.coloring ? INK : '#f4a78f' }}>{look.coloring ? '○' : '●'}</span>
            {renderLine(line, i)}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Gettoni: cerchi tratteggiati della misura delle stelline da ritagliare, dove attaccarle col velcro */
function TokenRow({ count }: { count: number }) {
  const look = useLook()
  const mono = look.coloring
  return (
    <section
      className="flex shrink-0 flex-col items-center gap-[2mm] rounded-[4mm] px-[4mm] py-[3mm]"
      style={mono ? { border: `0.5mm solid ${INK}` } : { backgroundColor: '#fff6d9' }}
    >
      <h3 className="text-[5mm] font-bold">I miei gettoni</h3>
      <div className="flex flex-wrap justify-center gap-[3mm]">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="flex items-center justify-center rounded-full border-[0.6mm] border-dashed bg-white text-[5mm] font-bold"
            style={{
              width: `${CIRCLE}mm`,
              height: `${CIRCLE}mm`,
              borderColor: mono ? INK : '#d9a23a',
              color: mono ? INK : '#e0c48a',
            }}
          >
            {i + 1}
          </span>
        ))}
      </div>
    </section>
  )
}

/** Aspetto: mano aperta e conto alla rovescia da 5 a 1 (si coprono o si barrano i numeri) */
function WaitBanner() {
  const look = useLook()
  const mono = look.coloring
  const ink = mono ? INK : '#3f74b8'
  return (
    <section
      className="flex shrink-0 flex-col items-center gap-[4mm] rounded-[5mm] px-[6mm] py-[6mm]"
      style={mono ? { border: `0.6mm solid ${INK}` } : { backgroundColor: '#e3eefa' }}
    >
      <svg viewBox="0 0 100 100" className="h-[38mm]" aria-hidden="true">
        <path
          d="M30 88 C18 78 14 62 14 52 L14 40 C14 35 22 35 22 40 L22 52 L26 52 L26 20 C26 14 34 14 34 20 L34 48 L38 48 L38 14 C38 8 46 8 46 14 L46 48 L50 48 L50 18 C50 12 58 12 58 18 L58 50 L62 50 L62 28 C62 22 70 22 70 28 L70 62 C70 76 62 88 50 90 Z"
          fill={mono ? 'white' : '#ffffff'}
          stroke={ink}
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex gap-[4mm]">
        {[5, 4, 3, 2, 1].map((n) => (
          <span
            key={n}
            className="flex h-[18mm] w-[18mm] items-center justify-center rounded-full border-[0.8mm] bg-white text-[10mm] font-bold"
            style={{ borderColor: ink, color: ink }}
          >
            {n}
          </span>
        ))}
      </div>
    </section>
  )
}

/** Termometro: livello colorato con il numero (5 in alto) e il suo nome */
function ScaleLevel({ index, children }: { index: number; children: ReactNode }) {
  const look = useLook()
  const mono = look.coloring
  const color = SCALE_COLORS[index % SCALE_COLORS.length]
  return (
    <div
      className="flex w-[52mm] shrink-0 items-center gap-[2.5mm] rounded-[4mm] px-[3mm]"
      style={mono ? { border: `0.6mm solid ${INK}` } : { backgroundColor: `${color}40` }}
    >
      <span
        className={`flex h-[12mm] w-[12mm] shrink-0 items-center justify-center rounded-full text-[7mm] font-bold leading-none ${mono ? 'border-[0.6mm] bg-white' : 'text-white'}`}
        style={mono ? { borderColor: INK, color: INK } : { backgroundColor: color }}
      >
        {5 - index}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Arrow({ direction }: { direction: 'down' | 'right' }) {
  const look = useLook()
  const stroke = look.coloring ? INK : '#c9bfae'
  return direction === 'down' ? (
    <svg viewBox="0 0 60 40" className="mx-auto h-[12mm] shrink-0" aria-hidden="true">
      <path d="M30 4 V30 M14 20 L30 34 L46 20" fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 40 60" className="my-auto w-[10mm] shrink-0" aria-hidden="true">
      <path d="M4 30 H30 M20 14 L34 30 L20 46" fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
