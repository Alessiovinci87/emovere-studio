import type { ReactNode } from 'react'
import { getScene, sceneTitle, type ImageVariant } from '../lib/catalog'
import { stepColors } from '../lib/sheet'
import {
  BOX,
  BOX_GAP,
  BODY_GAP,
  COL_GAP,
  CUTOUT_HEADER_H,
  CUTOUT_PAGE,
  DEFAULT_REWARD_TEXT,
  HEADER_H,
  PAGE,
  REWARD_W,
  ROWS_W,
  ROW_GAP,
  ROW_TITLE_GAP,
  ROW_TITLE_H,
  VIGNETTE_GAP,
  WEEK_LABELS,
  boxCount,
  cutoutGrid,
  rowConfig,
  rowLayout,
} from '../lib/tokens'
import { useTouchSelection } from '../lib/useTouchSelection'
import type { Cell, Sheet } from '../types'
import { CellTools, EmptyPick, SceneSquare } from './SheetCell'

const mm = (n: number) => `${n}mm`

const titleClass = 'sheet-field h-[9.5mm] text-center text-[7.5mm] font-bold leading-none'
const subtitleClass = 'sheet-field h-[5.5mm] text-center text-[4.3mm] leading-none text-muted'
const rowTitleClass = 'sheet-field px-[1mm] text-[4.5mm] font-bold leading-none'

// ——— Versione modificabile (composer) ———

interface EditProps {
  sheet: Sheet
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
  onChooseReward: () => void
}

export function TokenBoardEdit({ sheet, onChange, onChooseScene, onChooseSymbol, onChooseReward }: EditProps) {
  const selection = useTouchSelection()

  function updateCell(index: number, patch: Partial<Cell>) {
    onChange({ cells: sheet.cells.map((c, i) => (i === index ? { ...c, ...patch } : c)) })
  }

  return (
    <TokenPage
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
      rows={sheet.cells.map((cell, i) => {
        const scene = cell.code ? getScene(cell.code) : undefined
        const defaultText = scene ? sceneTitle(scene, sheet.character) : ''
        const selected = selection.isSelected(cell.id)
        const select = selection.selectHandler(cell.id)
        return (
          <TokenRowFrame
            key={cell.id}
            cell={cell}
            index={i}
            title={
              <input
                value={cell.text ?? defaultText}
                onChange={(e) => updateCell(i, { text: e.target.value === defaultText ? null : e.target.value })}
                placeholder="Compito (es. Mi lavo i denti)"
                aria-label={`Compito della riga ${i + 1}`}
                className={rowTitleClass}
                style={{ height: mm(ROW_TITLE_H) }}
              />
            }
            vignette={
              <div
                data-cell-id={cell.id}
                aria-label={`Vignetta della riga ${i + 1}`}
                onClick={(e) => {
                  if (select && cell.code && !(e.target as HTMLElement).closest('button')) select()
                }}
                className={`group relative h-full w-full [container-type:size] ${
                  selected ? 'rounded-[3mm] outline-[1mm] outline-offset-[0.5mm] outline-sky outline-solid' : ''
                }`}
              >
                {cell.code ? (
                  <>
                    <SceneSquare code={cell.code} character={sheet.character} variant="web" symbol={cell.symbol} />
                    <CellTools
                      selected={selected}
                      compact={rowLayout(rowConfig(cell)).lines === 1}
                      onChoose={() => onChooseScene(i)}
                      onSymbol={() => onChooseSymbol(i)}
                      onClear={() => updateCell(i, { code: null, text: null, symbol: null })}
                    />
                  </>
                ) : (
                  <EmptyPick onClick={() => onChooseScene(i)} label="Scegli" />
                )}
              </div>
            }
          />
        )
      })}
      reward={
        <RewardFrame
          text={
            <textarea
              value={sheet.reward.text ?? DEFAULT_REWARD_TEXT}
              onChange={(e) =>
                onChange({
                  reward: { ...sheet.reward, text: e.target.value === DEFAULT_REWARD_TEXT ? null : e.target.value },
                })
              }
              rows={4}
              aria-label="Testo del premio"
              className="sheet-field text-center text-[5mm] font-bold leading-[1.2]"
            />
          }
          vignette={
            <div
              data-cell-id="reward"
              onClick={(e) => {
                const select = selection.selectHandler('reward')
                if (select && sheet.reward.code && !(e.target as HTMLElement).closest('button')) select()
              }}
              className={`group relative h-full w-full [container-type:size] ${
                selection.isSelected('reward') ? 'rounded-[3mm] outline-[1mm] outline-offset-[0.5mm] outline-sky outline-solid' : ''
              }`}
            >
              {sheet.reward.code ? (
                <>
                  <SceneSquare code={sheet.reward.code} character={sheet.character} variant="web" />
                  <CellTools
                    selected={selection.isSelected('reward')}
                    onChoose={onChooseReward}
                    onClear={() => onChange({ reward: { ...sheet.reward, code: null } })}
                  />
                </>
              ) : (
                <EmptyPick onClick={onChooseReward} label="Vignetta del premio (facoltativa)" />
              )}
            </div>
          }
        />
      }
    />
  )
}

// ——— Versione statica (PDF) ———

export function TokenBoardPrint({ sheet, imageVariant }: { sheet: Sheet; imageVariant: ImageVariant }) {
  return (
    <TokenPage
      header={
        <>
          <h1 className={titleClass}>{sheet.title}</h1>
          {sheet.subtitle ? <p className={subtitleClass}>{sheet.subtitle}</p> : <span className="h-[5.5mm]" />}
        </>
      }
      rows={sheet.cells.map((cell, i) => {
        const scene = cell.code ? getScene(cell.code) : undefined
        return (
          <TokenRowFrame
            key={cell.id}
            cell={cell}
            index={i}
            title={
              <p className={`${rowTitleClass} truncate`} style={{ height: mm(ROW_TITLE_H), lineHeight: mm(ROW_TITLE_H - 1) }}>
                {cell.text ?? (scene ? sceneTitle(scene, sheet.character) : '')}
              </p>
            }
            vignette={
              <div className="relative h-full w-full [container-type:size]">
                {cell.code && (
                  <SceneSquare code={cell.code} character={sheet.character} variant={imageVariant} symbol={cell.symbol} />
                )}
              </div>
            }
          />
        )
      })}
      reward={
        <RewardFrame
          text={
            <p className="sheet-field whitespace-pre-wrap text-center text-[5mm] font-bold leading-[1.2]">
              {sheet.reward.text ?? DEFAULT_REWARD_TEXT}
            </p>
          }
          vignette={
            sheet.reward.code ? (
              <div className="relative h-full w-full [container-type:size]">
                <SceneSquare code={sheet.reward.code} character={sheet.character} variant={imageVariant} />
              </div>
            ) : null
          }
        />
      }
    />
  )
}

// ——— Impaginazione comune: A4 orizzontale ———

function TokenPage({ header, rows, reward }: { header: ReactNode; rows: ReactNode[]; reward: ReactNode }) {
  return (
    <div
      className="flex flex-col bg-white font-sans text-ink"
      style={{ width: mm(PAGE.w), height: mm(PAGE.h), padding: mm(PAGE.margin), gap: mm(BODY_GAP) }}
    >
      <header className="flex shrink-0 flex-col items-center gap-[1mm]" style={{ height: mm(HEADER_H) }}>
        {header}
      </header>
      <div className="flex min-h-0 flex-1" style={{ gap: mm(COL_GAP) }}>
        <div className="flex shrink-0 flex-col" style={{ width: mm(ROWS_W), gap: mm(ROW_GAP) }}>
          {rows}
        </div>
        <div className="flex shrink-0" style={{ width: mm(REWARD_W) }}>
          {reward}
        </div>
      </div>
    </div>
  )
}

function TokenRowFrame({ cell, index, title, vignette }: { cell: Cell; index: number; title: ReactNode; vignette: ReactNode }) {
  const row = rowConfig(cell)
  const layout = rowLayout(row)
  const color = stepColors[index % stepColors.length]
  return (
    <div className="flex shrink-0 flex-col" style={{ height: mm(layout.height) }}>
      <div className="flex items-center gap-[2mm]" style={{ height: mm(ROW_TITLE_H), marginBottom: mm(ROW_TITLE_GAP) }}>
        <span className="h-[3mm] w-[3mm] shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="min-w-0 flex-1">{title}</div>
      </div>
      <div className="flex" style={{ gap: mm(VIGNETTE_GAP) }}>
        <div className="shrink-0" style={{ width: mm(layout.vignette), height: mm(layout.vignette) }}>
          {vignette}
        </div>
        <div
          className="grid content-start"
          style={{ gridTemplateColumns: `repeat(${layout.cols}, ${mm(BOX)})`, gap: mm(BOX_GAP) }}
        >
          {Array.from({ length: boxCount(row) }, (_, i) => (
            <StarBox key={i} label={row.mode === 'week' ? WEEK_LABELS[i] : undefined} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RewardFrame({ text, vignette }: { text: ReactNode; vignette: ReactNode }) {
  return (
    <section className="flex h-full w-full flex-col items-center gap-[3mm] rounded-[4mm] border-[0.6mm] border-[#f0dca8] bg-butter p-[4mm]">
      <span className="rounded-full bg-[#f0b54a] px-[5mm] py-[1mm] text-[5.5mm] font-bold leading-tight text-white">
        ★ Premio
      </span>
      {text}
      <div className="min-h-0 w-full flex-1">{vignette}</div>
    </section>
  )
}

/** Casella per una stellina: quadrata, angoli arrotondati, contorno tenue di una stella al centro. */
function StarBox({ label }: { label?: string }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-[3mm] border-[0.5mm] border-[#d9cdb8] bg-white"
      style={{ width: mm(BOX), height: mm(BOX) }}
    >
      {label && (
        <span className="absolute left-0 right-0 top-[1.2mm] text-center text-[3.2mm] font-bold leading-none text-muted">
          {label}
        </span>
      )}
      <StarShape className="h-[58%] w-[58%]" fill="none" stroke="#e7dccb" strokeWidth={4} />
    </div>
  )
}

/** Stella a cinque punte (viewBox 100×100). */
export function StarShape({
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

// ——— Pagina delle stelline da ritagliare: A4 verticale ———

/** Griglia di stelle gialle piene, ognuna in un quadrato grande quanto una casella, con linee di taglio. */
export function CutoutPage({ title }: { title: string }) {
  const count = cutoutGrid.cols * cutoutGrid.rows
  return (
    <div
      className="flex flex-col items-center bg-white font-sans text-ink"
      style={{ width: mm(CUTOUT_PAGE.w), height: mm(CUTOUT_PAGE.h), padding: mm(CUTOUT_PAGE.margin), gap: '2mm' }}
    >
      <p className="flex items-center gap-[2mm] text-[4.5mm] font-bold" style={{ height: mm(CUTOUT_HEADER_H) }}>
        ✂ Stelline da ritagliare{title ? ` · ${title}` : ''}
      </p>
      <div
        className="grid border-l-[0.3mm] border-t-[0.3mm] border-dashed border-[#b8ad9c]"
        style={{ gridTemplateColumns: `repeat(${cutoutGrid.cols}, ${mm(BOX)})` }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-center border-b-[0.3mm] border-r-[0.3mm] border-dashed border-[#b8ad9c]"
            style={{ width: mm(BOX), height: mm(BOX) }}
          >
            <StarShape className="h-[86%] w-[86%]" fill="#f7c948" stroke="#e2a72e" strokeWidth={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
