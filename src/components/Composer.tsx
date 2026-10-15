import { useEffect, useRef, useState } from 'react'
import type { ExportContent, ExportKind } from '../lib/exportPdf'
import { changeTemplate, retitleForName, templateList, templates } from '../lib/sheet'
import type { Folder, Sheet, TemplateId } from '../types'
import { CharacterToggle } from './CharacterToggle'
import { Modal } from './Modal'
import { ReminderEditor } from './ReminderEditor'
import { SheetView } from './SheetView'
import { StatusPicker } from './Status'
import { TokenControls } from './TokenControls'
import { Button, Field, NameInput, NotesField, inputClass } from './ui'

/** mm → pixel CSS (96 dpi) */
const PX_PER_MM = 96 / 25.4

interface Props {
  sheet: Sheet
  folder: Folder | undefined
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
  onChooseReward: () => void
  onSave: () => void
  onOpenFolder: (id: string) => void
  onNew: () => void
}

export function Composer({
  sheet,
  folder,
  onChange,
  onChooseScene,
  onChooseSymbol,
  onChooseReward,
  onSave,
  onOpenFolder,
  onNew,
}: Props) {
  const template = templates[sheet.template]
  const isTokens = template.kind === 'tokens'
  // A4 verticale o orizzontale (tabella a gettoni)
  const [pageW, pageH] = template.orientation === 'landscape' ? [297, 210] : [210, 297]
  const scale = useFitScale(pageW * PX_PER_MM)
  const filled = sheet.cells.filter((c) => c.code).length
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [askSave, setAskSave] = useState(false)
  /** Bozza per cui si è già risposto "No, grazie": non si ripropone a ogni PDF */
  const declinedFor = useRef<string | null>(null)

  async function handleExport(kind: ExportKind, content: ExportContent = 'full') {
    setExporting(kind)
    try {
      const { exportPdf } = await import('../lib/exportPdf')
      await exportPdf(sheet, kind, content)
      if (!folder && declinedFor.current !== sheet.id) setAskSave(true)
    } catch (err) {
      console.error(err)
      alert('Non è stato possibile creare il PDF. Riprova; se succede ancora, ricarica la pagina.')
    } finally {
      setExporting(null)
    }
  }

  function handleTemplate(id: TemplateId) {
    const count = templates[id].cols * templates[id].rows
    const lost = sheet.cells.slice(count).filter((c) => c.code).length
    const what = templates[id].kind === 'tokens' ? `${count} righe` : `${count} riquadri`
    if (lost > 0 && !confirm(`Il nuovo modello ha ${what}: ${lost} vignette in fondo verranno tolte. Continuare?`))
      return
    onChange(changeTemplate(sheet, id))
  }

  function handleChildName(name: string) {
    onChange({ childName: name, title: retitleForName(sheet.title, sheet.childName.trim(), name.trim()) })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[16rem_minmax(0,1fr)_17rem]">
      <aside className="flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm lg:col-start-1 lg:row-start-1">
        {folder ? (
          <div className="flex flex-col gap-1">
            <button onClick={() => onOpenFolder(folder.id)} className="self-start font-bold hover:text-sky">
              📁 {folder.name}
            </button>
            <p className="text-xs text-muted">Le modifiche si salvano da sole.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl bg-butter p-3">
            <p className="text-sm font-bold">Scheda non ancora salvata</p>
            <Button tone="primary" onClick={onSave}>
              Salva in una cartella
            </Button>
          </div>
        )}

        <Field label="Modello">
          <select
            value={sheet.template}
            onChange={(e) => handleTemplate(e.target.value as TemplateId)}
            className={`${inputClass} font-bold`}
          >
            {templateList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted">
            {isTokens
              ? `${sheet.cells.length} ${sheet.cells.length === 1 ? 'riga' : 'righe'} · A4 orizzontale`
              : `${filled} di ${sheet.cells.length} riquadri pieni`}
          </p>
        </Field>

        <Field label="Personaggio">
          <CharacterToggle value={sheet.character} onChange={(character) => onChange({ character })} />
        </Field>

        <div className="flex flex-col gap-2">
          <NameInput label="Nome del bambino (facoltativo)" value={sheet.childName} onChange={handleChildName} />
          {folder && !sheet.childName.trim() && (
            <button
              onClick={() => handleChildName(folder.name)}
              className="self-start rounded-full bg-sky-soft px-3 py-1 text-xs font-bold hover:bg-sky/25"
            >
              Usa “{folder.name}”
            </button>
          )}
        </div>

        {isTokens ? (
          <TokenControls
            sheet={sheet}
            onChange={onChange}
            exporting={exporting !== null}
            onExportStars={(kind) => handleExport(kind, 'stars')}
          />
        ) : (
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="font-bold">Riquadro “Ricordo sempre”</span>
            <input
              type="checkbox"
              checked={sheet.remember.enabled}
              onChange={(e) => onChange({ remember: { ...sheet.remember, enabled: e.target.checked } })}
              className="h-5 w-5 accent-sky"
            />
          </label>
        )}

        <p className="text-sm leading-relaxed text-muted">
          {isTokens
            ? 'Clicca su una vignetta vuota per sceglierla. Su una vignetta piena passa sopra (o toccala, su tablet) per cambiarla, svuotarla o aggiungere un simbolo. Titoli dei compiti e premio si modificano sul foglio.'
            : "Clicca su un riquadro vuoto per scegliere la vignetta. Su un riquadro pieno passa sopra (o toccalo, su tablet) per cambiarla, svuotarla o aggiungere un simbolo. Trascina i riquadri per cambiare l'ordine (su tablet: tieni premuto e trascina). Titolo, frasi e orari si modificano sul foglio."}
        </p>

        <Field label="Scarica">
          <div className="flex flex-col gap-2">
            <ExportButton
              label="PDF stampa"
              hint="A4 alta qualità, da plastificare"
              busy={exporting === 'stampa'}
              disabled={exporting !== null}
              onClick={() => handleExport('stampa')}
            />
            <ExportButton
              label="PDF WhatsApp"
              hint="File leggero da inviare"
              busy={exporting === 'whatsapp'}
              disabled={exporting !== null}
              onClick={() => handleExport('whatsapp')}
            />
          </div>
        </Field>

        <Button onClick={onNew}>Nuova scheda</Button>
      </aside>

      <div ref={scale.ref} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div
          className="mx-auto overflow-hidden rounded-xl shadow-lg"
          style={{ width: pageW * PX_PER_MM * scale.value, height: pageH * PX_PER_MM * scale.value }}
        >
          <div style={{ transform: `scale(${scale.value})`, transformOrigin: 'top left' }}>
            <SheetView
              sheet={sheet}
              scale={scale.value}
              onChange={onChange}
              onChooseScene={onChooseScene}
              onChooseSymbol={onChooseSymbol}
              onChooseReward={onChooseReward}
            />
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm lg:col-start-1 lg:row-start-2 xl:col-start-3 xl:row-start-1">
        <Field label="Stato">
          <StatusPicker status={sheet.status} onChange={(status) => onChange({ status })} />
        </Field>
        <Field label="Promemoria">
          <ReminderEditor sheet={sheet} folder={folder} onChange={(reminder) => onChange({ reminder })} />
        </Field>
        <NotesField value={sheet.notes} onChange={(notes) => onChange({ notes })} />
      </aside>

      {askSave && (
        <Modal title="Salvare la scheda?" onClose={() => setAskSave(false)} size="sm">
          <div className="flex flex-col gap-4">
            <p className="leading-relaxed">
              Il PDF è pronto. Questa scheda però non è ancora in una cartella: salvala per ritrovarla e modificarla
              in seguito.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => {
                  declinedFor.current = sheet.id
                  setAskSave(false)
                }}
              >
                No, grazie
              </Button>
              <Button
                tone="primary"
                onClick={() => {
                  setAskSave(false)
                  onSave()
                }}
              >
                Salva in una cartella
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ExportButton({
  label,
  hint,
  busy,
  disabled,
  onClick,
}: {
  label: string
  hint: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-start rounded-2xl bg-sky-soft px-4 py-2.5 text-left transition hover:bg-sky/25 disabled:cursor-wait disabled:opacity-60"
    >
      <span className="font-bold">{busy ? 'Preparo il PDF…' : label}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  )
}

/** Scala la pagina per farla stare nella larghezza disponibile (mai oltre il 100%). */
function useFitScale(pageWidthPx: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(pageWidthPx)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, value: Math.min(1, available / pageWidthPx) }
}
