import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ExportContent, ExportKind } from '../lib/exportPdf'
import { changeTemplate, retitleForName, templateList, templates } from '../lib/sheet'
import { CIRCLE, cutoutGrid } from '../lib/stars'
import type { Folder, Sheet, TemplateId } from '../types'
import { CharacterToggle } from './CharacterToggle'
import { BackIcon, CloseIcon, DownloadIcon, FitIcon, MinusIcon, PanelIcon, PlusIcon, SlidersIcon } from './Icons'
import { Modal } from './Modal'
import { ReminderEditor } from './ReminderEditor'
import { SheetView } from './SheetView'
import { StatusChip, StatusPicker } from './Status'
import { Button, Field, NameInput, NotesField, inputClass } from './ui'

/** mm → pixel CSS (96 dpi) */
const PX_PER_MM = 96 / 25.4
/** A4 verticale, in pixel CSS */
const PAGE_W = 210 * PX_PER_MM
const PAGE_H = 297 * PX_PER_MM

interface Props {
  sheet: Sheet
  folder: Folder | undefined
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
  onSave: () => void
  onOpenFolder: (id: string) => void
  onNew: () => void
  onClose: () => void
}

/** Editor della scheda a schermo intero: la navigazione dell'app si nasconde. */
export function Editor({ sheet, folder, onChange, onChooseScene, onChooseSymbol, onSave, onOpenFolder, onNew, onClose }: Props) {
  const [panelOpen, setPanelOpen] = useState(true)
  /** Telefono: pannello opzioni che sale dal basso */
  const [sheetOpen, setSheetOpen] = useState(false)
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

  const options = (
    <EditorOptions sheet={sheet} folder={folder} onChange={onChange} onSave={onSave} onOpenFolder={onOpenFolder} onNew={onNew} />
  )

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-cream">
      {/* Barra in alto */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line/70 bg-white px-2 sm:gap-3 sm:px-4">
        <button
          onClick={onClose}
          className="flex h-11 shrink-0 items-center gap-1 rounded-full px-2 font-bold text-accent transition hover:bg-accent-soft sm:pr-4"
        >
          <BackIcon />
          <span className="hidden sm:inline">{folder ? 'Fatto' : 'Indietro'}</span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold leading-tight">{sheet.title || 'Senza titolo'}</span>
          <span className="truncate text-xs text-muted">
            {folder ? `📁 ${folder.name} · salvata` : 'Bozza non salvata'} · {templates[sheet.template].label}
          </span>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <StatusChip status={sheet.status} onChange={(status) => onChange({ status })} />
          <CharacterToggle value={sheet.character} onChange={(character) => onChange({ character })} />
        </div>

        {!folder && (
          <Button tone="primary" onClick={onSave} className="hidden shrink-0 sm:block">
            Salva
          </Button>
        )}

        <ExportMenu sheet={sheet} busy={exporting} onExport={handleExport} />

        <button
          onClick={() => setPanelOpen((o) => !o)}
          aria-label={panelOpen ? 'Chiudi il pannello opzioni' : 'Apri il pannello opzioni'}
          aria-pressed={panelOpen}
          title="Opzioni"
          className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-full transition md:flex ${
            panelOpen ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-cream hover:text-ink'
          }`}
        >
          <PanelIcon />
        </button>
        <button
          onClick={() => setSheetOpen(true)}
          aria-label="Opzioni"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-cream hover:text-ink md:hidden"
        >
          <SlidersIcon />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Pannello opzioni a sinistra (tablet e desktop), richiudibile */}
        {panelOpen && (
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-line/70 bg-white p-5 md:block">{options}</aside>
        )}
        <SheetCanvas sheet={sheet} onChange={onChange} onChooseScene={onChooseScene} onChooseSymbol={onChooseSymbol} />
      </div>

      {/* Telefono: il pannello sale dal basso */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-ink/30" />
          <div
            role="dialog"
            aria-label="Opzioni della scheda"
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <span className="mx-auto h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between px-5 pb-3">
              <h2 className="text-lg font-bold">Opzioni</h2>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Chiudi"
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-cream"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <div className="mb-5 flex flex-col gap-4 border-b border-line/70 pb-5">
                <Field label="Stato">
                  <StatusPicker status={sheet.status} onChange={(status) => onChange({ status })} />
                </Field>
                <Field label="Personaggio">
                  <CharacterToggle value={sheet.character} onChange={(character) => onChange({ character })} />
                </Field>
              </div>
              {options}
            </div>
          </div>
        </div>
      )}

      {askSave && (
        <Modal title="Salvare la scheda?" onClose={() => setAskSave(false)} size="sm">
          <div className="flex flex-col gap-4">
            <p className="leading-relaxed">
              Il PDF è pronto. Questa scheda però non è ancora in una cartella: salvala per ritrovarla e modificarla in
              seguito.
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

/** Contenuto del pannello opzioni (uguale a lato e nel pannello dal basso). */
function EditorOptions({
  sheet,
  folder,
  onChange,
  onSave,
  onOpenFolder,
  onNew,
}: {
  sheet: Sheet
  folder: Folder | undefined
  onChange: (patch: Partial<Sheet>) => void
  onSave: () => void
  onOpenFolder: (id: string) => void
  onNew: () => void
}) {
  const filled = sheet.cells.filter((c) => c.code).length

  function handleTemplate(id: TemplateId) {
    const count = templates[id].cols * templates[id].rows
    const lost = sheet.cells.slice(count).filter((c) => c.code).length
    if (lost > 0 && !confirm(`Il nuovo modello ha ${count} riquadri: ${lost} vignette in fondo verranno tolte. Continuare?`))
      return
    onChange(changeTemplate(sheet, id))
  }

  function handleChildName(name: string) {
    onChange({ childName: name, title: retitleForName(sheet.title, sheet.childName.trim(), name.trim()) })
  }

  return (
    <div className="flex flex-col gap-6">
      {folder ? (
        <div className="flex flex-col gap-1">
          <button onClick={() => onOpenFolder(folder.id)} className="self-start font-bold hover:text-accent">
            📁 {folder.name}
          </button>
          <p className="text-xs text-muted">Le modifiche si salvano da sole.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl bg-butter p-4">
          <p className="text-sm font-bold">Scheda non ancora salvata</p>
          <Button tone="primary" onClick={onSave}>
            Salva in una cartella
          </Button>
        </div>
      )}

      <Field label="Modello">
        <select value={sheet.template} onChange={(e) => handleTemplate(e.target.value as TemplateId)} className={`${inputClass} font-bold`}>
          {templateList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted">
          {filled} di {sheet.cells.length} riquadri pieni
        </p>
      </Field>

      <div className="flex flex-col gap-2">
        <NameInput label="Nome del bambino (facoltativo)" value={sheet.childName} onChange={handleChildName} />
        {folder && !sheet.childName.trim() && (
          <button
            onClick={() => handleChildName(folder.name)}
            className="self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent hover:bg-accent/15"
          >
            Usa “{folder.name}”
          </button>
        )}
      </div>

      <Toggle
        label="Riquadro “Ricordo sempre”"
        checked={sheet.remember.enabled}
        onChange={(enabled) => onChange({ remember: { ...sheet.remember, enabled } })}
      />

      <div className="flex flex-col gap-3">
        <Toggle
          label="Cerchietto per la stellina"
          hint={`In alto a destra di ogni vignetta, ${CIRCLE / 10} cm: col velcro ci si attacca la stellina “fatto”.`}
          checked={sheet.doneCircle}
          onChange={(doneCircle) => onChange({ doneCircle })}
        />
        {sheet.doneCircle && (
          <div className="rounded-2xl bg-butter p-4">
            <Toggle
              label="Aggiungi stelline da ritagliare al PDF"
              hint={`Pagina in più con ${cutoutGrid.cols * cutoutGrid.rows} stelline rotonde. Solo le stelline: menu Esporta.`}
              checked={sheet.cutouts}
              onChange={(cutouts) => onChange({ cutouts })}
            />
          </div>
        )}
      </div>

      <Field label="Promemoria">
        <ReminderEditor sheet={sheet} folder={folder} onChange={(reminder) => onChange({ reminder })} />
      </Field>

      <NotesField value={sheet.notes} onChange={(notes) => onChange({ notes })} />

      <p className="text-sm leading-relaxed text-muted">
        Tocca un riquadro vuoto per scegliere la vignetta. Su un riquadro pieno passa sopra (o toccalo, su tablet) per
        cambiarla, svuotarla o aggiungere un simbolo. Trascina i riquadri per cambiare l'ordine (su tablet: tieni premuto e
        trascina). Titolo, frasi e orari si modificano sul foglio.
      </p>

      <Button onClick={onNew}>+ Nuova scheda</Button>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="flex flex-col">
        <span className="font-bold">{label}</span>
        {hint && <span className="text-xs leading-snug text-muted">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#3f74b8]" />
    </label>
  )
}

/** Menu "Esporta": PDF stampa, PDF WhatsApp e (con il cerchietto) le sole stelline. */
function ExportMenu({
  sheet,
  busy,
  onExport,
}: {
  sheet: Sheet
  busy: ExportKind | null
  onExport: (kind: ExportKind, content?: ExportContent) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = (label: string, hint: string, run: () => void) => (
    <li role="none">
      <button
        role="menuitem"
        onClick={() => {
          setOpen(false)
          run()
        }}
        className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-cream"
      >
        <span className="font-bold">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </button>
    </li>
  )

  return (
    <div ref={root} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-full bg-accent px-3 font-bold text-white transition hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70 sm:px-4"
      >
        <DownloadIcon className="h-5 w-5" />
        <span className="hidden sm:inline">{busy ? 'Preparo il PDF…' : 'Esporta'}</span>
      </button>
      {open && (
        <ul
          role="menu"
          aria-label="Esporta"
          className="absolute right-0 top-full z-50 mt-2 flex w-72 flex-col gap-0.5 rounded-2xl border border-line bg-white p-1.5 shadow-lg"
        >
          {item('PDF stampa', 'A4 alta qualità, da plastificare', () => onExport('stampa'))}
          {item('PDF WhatsApp', 'File leggero da inviare', () => onExport('whatsapp'))}
          {sheet.doneCircle && (
            <>
              <li role="separator" className="mx-3 my-1 border-t border-line/70" />
              {item('Stelline · stampa', 'Solo la pagina di stelline da ritagliare', () => onExport('stampa', 'stars'))}
              {item('Stelline · WhatsApp', 'Solo stelline, file leggero', () => onExport('whatsapp', 'stars'))}
            </>
          )}
        </ul>
      )}
    </div>
  )
}

/** Foglio al centro: si adatta allo spazio disponibile, con zoom manuale. */
function SheetCanvas({
  sheet,
  onChange,
  onChooseScene,
  onChooseSymbol,
}: {
  sheet: Sheet
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: PAGE_W, h: PAGE_H })
  /** null = adatta allo schermo */
  const [zoom, setZoom] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const pad = box.w < 640 ? 12 : 32
  const fit = Math.max(0.2, Math.min((box.w - 2 * pad) / PAGE_W, (box.h - 2 * pad) / PAGE_H))
  const scale = zoom ?? fit
  const setScale = (s: number) => setZoom(Math.min(2, Math.max(0.25, Math.round(s * 20) / 20)))

  return (
    <div className="relative min-w-0 flex-1">
      <div ref={ref} className="absolute inset-0 overflow-auto">
        <div className="flex min-h-full min-w-full" style={{ padding: pad }}>
          <div
            className="m-auto shrink-0 overflow-hidden rounded-lg bg-white shadow-[0_8px_30px_rgba(59,56,70,0.10)]"
            style={{ width: PAGE_W * scale, height: PAGE_H * scale }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <SheetView sheet={sheet} scale={scale} onChange={onChange} onChooseScene={onChooseScene} onChooseSymbol={onChooseSymbol} />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full bg-white p-1 shadow-md">
        <ZoomButton label="Riduci" onClick={() => setScale(scale - 0.1)}>
          <MinusIcon className="h-5 w-5" />
        </ZoomButton>
        <span className="w-12 text-center text-sm font-bold tabular-nums">{Math.round(scale * 100)}%</span>
        <ZoomButton label="Ingrandisci" onClick={() => setScale(scale + 0.1)}>
          <PlusIcon className="h-5 w-5" />
        </ZoomButton>
        <ZoomButton label="Adatta allo schermo" active={zoom === null} onClick={() => setZoom(null)}>
          <FitIcon className="h-5 w-5" />
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-cream hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
