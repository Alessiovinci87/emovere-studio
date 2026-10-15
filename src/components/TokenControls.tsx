import type { ExportKind } from '../lib/exportPdf'
import { emptyCell } from '../lib/sheet'
import { BOX, DEFAULT_ROW, MAX_COUNT, MAX_ROWS, MIN_COUNT, capacity, cutoutGrid, rowConfig } from '../lib/tokens'
import type { Sheet, TokenRow } from '../types'
import { Button, Field } from './ui'

interface Props {
  sheet: Sheet
  onChange: (patch: Partial<Sheet>) => void
  exporting: boolean
  onExportStars: (kind: ExportKind) => void
}

/** Righe e caselle della tabella a gettoni, con i limiti di spazio dell'A4. */
export function TokenControls({ sheet, onChange, exporting, onExportStars }: Props) {
  const cap = capacity(sheet.cells)
  const rows = sheet.cells.map(rowConfig)
  const pageFull = sheet.cells.length < MAX_ROWS && !cap.canAddRow

  function setRow(index: number, row: TokenRow) {
    onChange({ cells: sheet.cells.map((c, i) => (i === index ? { ...c, tokens: row } : c)) })
  }

  function removeRow(index: number) {
    if (sheet.cells[index].code && !confirm(`Togliere la riga ${index + 1} con la sua vignetta?`)) return
    onChange({ cells: sheet.cells.filter((_, i) => i !== index) })
  }

  return (
    <>
      <Field label="Righe della tabella">
        <ol className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={sheet.cells[i].id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">Riga {i + 1}</span>
                <Button
                  small
                  tone="danger"
                  disabled={rows.length <= 1}
                  onClick={() => removeRow(i)}
                  aria-label={`Togli la riga ${i + 1}`}
                >
                  Togli
                </Button>
              </div>
              <div role="radiogroup" aria-label={`Caselle della riga ${i + 1}`} className="flex rounded-full bg-sand p-0.5">
                <ModeButton checked={row.mode === 'count'} disabled={!cap.canCount(i)} onClick={() => setRow(i, { ...row, mode: 'count' })}>
                  Conteggio
                </ModeButton>
                <ModeButton checked={row.mode === 'week'} disabled={!cap.canWeek(i)} onClick={() => setRow(i, { ...row, mode: 'week' })}>
                  Settimana
                </ModeButton>
              </div>
              {row.mode === 'count' ? (
                <div className="flex items-center gap-2">
                  <Button
                    small
                    disabled={row.count <= MIN_COUNT}
                    onClick={() => setRow(i, { ...row, count: row.count - 1 })}
                    aria-label={`Una casella in meno nella riga ${i + 1}`}
                  >
                    −
                  </Button>
                  <span className="min-w-20 text-center text-sm font-bold">{row.count} caselle</span>
                  <Button
                    small
                    disabled={!cap.canIncrease(i)}
                    onClick={() => setRow(i, { ...row, count: row.count + 1 })}
                    aria-label={`Una casella in più nella riga ${i + 1}`}
                  >
                    +
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted">7 caselle, da lunedì a domenica</p>
              )}
            </li>
          ))}
        </ol>
        <Button
          tone="soft"
          disabled={!cap.canAddRow}
          onClick={() => onChange({ cells: [...sheet.cells, { ...emptyCell(), tokens: DEFAULT_ROW }] })}
        >
          + Aggiungi riga
        </Button>
        <p className="text-xs leading-snug text-muted">
          {pageFull
            ? `La pagina è piena: le caselle restano di ${BOX / 10} cm per attaccarci una stellina vera. Per aggiungere una riga togli caselle (oltre ${7} vanno su due file) o un'altra riga.`
            : `Caselle di ${BOX / 10} cm. Da ${MIN_COUNT} a ${MAX_COUNT} per riga, fino a ${MAX_ROWS} righe se c'è spazio.`}
        </p>
      </Field>

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="font-bold">Aggiungi stelline da ritagliare</span>
        <input
          type="checkbox"
          checked={sheet.cutouts}
          onChange={(e) => onChange({ cutouts: e.target.checked })}
          className="h-5 w-5 accent-sky"
        />
      </label>

      <Field label="Stampa solo stelline">
        <p className="text-xs text-muted">
          A4 verticale, {cutoutGrid.cols * cutoutGrid.rows} stelline da {BOX / 10} cm.
        </p>
        <div className="flex gap-2">
          <Button small tone="soft" disabled={exporting} onClick={() => onExportStars('stampa')}>
            Stelline · stampa
          </Button>
          <Button small tone="soft" disabled={exporting} onClick={() => onExportStars('whatsapp')}>
            Stelline · WhatsApp
          </Button>
        </div>
      </Field>
    </>
  )
}

function ModeButton({
  checked,
  disabled,
  onClick,
  children,
}: {
  checked: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      disabled={disabled && !checked}
      onClick={onClick}
      title={disabled && !checked ? 'Non c’è spazio nella pagina' : undefined}
      className={`flex-1 rounded-full px-3 py-1 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
