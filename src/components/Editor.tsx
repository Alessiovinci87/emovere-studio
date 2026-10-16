import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CARD_LABEL, cardMetrics, sheetCards, type CardSize } from './Cards'
import type { ExportContent, ExportKind } from '../lib/exportPdf'
import { lookFor } from '../lib/look'
import type { AppSettings } from '../lib/settings'
import { CHECKLIST_ROWS, canReorder, changeTemplate, retitleForName, templateList, templates, usesDoneCircle } from '../lib/sheet'
import { CIRCLE, cutoutGrid } from '../lib/stars'
import type { SyncStatus } from '../lib/sync'
import type { CellShow, Folder, Sheet, TemplateId, TimeMode } from '../types'
import { CharacterToggle } from './CharacterToggle'
import { BackIcon, CloseIcon, DownloadIcon, FitIcon, MinusIcon, PanelIcon, PlusIcon, SlidersIcon } from './Icons'
import { Modal } from './Modal'
import { ReminderEditor } from './ReminderEditor'
import { SheetView } from './SheetView'
import { StatusChip, StatusPicker } from './Status'
import { Button, Field, NameInput, NotesField, inputClass } from './ui'

/** mm → pixel CSS (96 dpi) */
const PX_PER_MM = 96 / 25.4

/** Stato della versione da colorare per la scheda aperta */
export interface ColoringState {
  /** Vignette della scheda (personaggio attuale) senza versione da colorare */
  missing: number
  /** Generazione in corso: quante fatte su quante */
  progress: { done: number; total: number } | null
  onGenerate: () => void
}

interface Props {
  /** Stato del salvataggio sul server */
  sync: SyncStatus
  sheet: Sheet
  folder: Folder | undefined
  settings: AppSettings
  coloringKeys: ReadonlySet<string>
  coloring: ColoringState
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
  onSave: () => void
  onOpenFolder: (id: string) => void
  onNew: () => void
  onClose: () => void
}

/** Editor della scheda a schermo intero: la navigazione dell'app si nasconde. */
export function Editor({
  sync,
  sheet,
  folder,
  settings,
  coloringKeys,
  coloring,
  onChange,
  onChooseScene,
  onChooseSymbol,
  onSave,
  onOpenFolder,
  onNew,
  onClose,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(true)
  /** Telefono: pannello opzioni che sale dal basso */
  const [sheetOpen, setSheetOpen] = useState(false)
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [cardsOpen, setCardsOpen] = useState<CardsMode | null>(null)
  const [askSave, setAskSave] = useState(false)
  /** Bozza per cui si è già risposto "No, grazie": non si ripropone a ogni PDF */
  const declinedFor = useRef<string | null>(null)
  const look = lookFor(sheet, settings, coloringKeys, 'web')

  async function handleExport(kind: ExportKind, content: ExportContent = { type: 'full' }) {
    setExporting(kind)
    try {
      const { exportPdf } = await import('../lib/exportPdf')
      await exportPdf(sheet, kind, content, { settings, coloringKeys })
      if (!folder && declinedFor.current !== sheet.id) setAskSave(true)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error && err.message.includes('vignette') ? err.message : 'Non è stato possibile creare il PDF. Riprova; se succede ancora, ricarica la pagina.')
    } finally {
      setExporting(null)
    }
  }

  const options = (
    <EditorOptions
      sheet={sheet}
      folder={folder}
      settings={settings}
      onChange={onChange}
      onSave={onSave}
      onOpenFolder={onOpenFolder}
      onNew={onNew}
    />
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
          <span
            role="status"
            className={`truncate text-xs ${sync.state === 'waiting' || sync.state === 'error' || sync.conflicts.has(sheet.id) ? 'font-bold text-[#a2472f]' : 'text-muted'}`}
          >
            {folder ? `📁 ${folder.name}` : 'Senza bambino'} · {syncText(sync, sheet.id)} · {templates[sheet.template].label}
          </span>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <StatusChip status={sheet.status} onChange={(status) => onChange({ status })} />
          <CharacterToggle value={sheet.character} onChange={(character) => onChange({ character })} />
        </div>

        {!folder && (
          <Button tone="primary" onClick={onSave} className="hidden shrink-0 sm:block">
            Metti in una cartella
          </Button>
        )}

        <ExportMenu
          sheet={sheet}
          busy={exporting}
          onExport={handleExport}
          onCards={setCardsOpen}
          onColoring={(value) => onChange({ coloring: value })}
        />

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

      {sheet.coloring && (coloring.missing > 0 || coloring.progress) && <ColoringBanner sheet={sheet} coloring={coloring} />}

      <div className="flex min-h-0 flex-1">
        {/* Pannello opzioni a sinistra (tablet e desktop), richiudibile */}
        {panelOpen && (
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-line/70 bg-white p-5 md:block">{options}</aside>
        )}
        <SheetCanvas
          sheet={sheet}
          look={look}
          onChange={onChange}
          onChooseScene={onChooseScene}
          onChooseSymbol={onChooseSymbol}
        />
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

      {cardsOpen && (
        <CardsDialog
          mode={cardsOpen}
          sheet={sheet}
          busy={exporting}
          onExport={(kind, size, strip) => {
            setCardsOpen(null)
            void handleExport(kind, cardsOpen === 'reorder' ? { type: 'reorder', size } : { type: 'cards', size, strip })
          }}
          onClose={() => setCardsOpen(null)}
        />
      )}

      {askSave && (
        <Modal title="Salvare la scheda?" onClose={() => setAskSave(false)} size="sm">
          <div className="flex flex-col gap-4">
            <p className="leading-relaxed">
              Il PDF è pronto. Questa scheda è salvata senza bambino: se è per un bambino in particolare, mettila nella sua
              cartella.
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
                Metti in una cartella
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Stato del salvataggio della scheda aperta, per la barra in alto */
function syncText(sync: SyncStatus, sheetId: string): string {
  if (sync.conflicts.has(sheetId)) return 'Modificata altrove'
  switch (sync.state) {
    case 'saved':
      return 'Salvata'
    case 'saving':
      return 'Salvo…'
    case 'waiting':
      return 'Non salvato, riprovo…'
    case 'error':
      return `Non salvato: ${sync.message ?? ''}`
  }
}

/** Versione da colorare attiva ma incompleta: avviso con "Genera quelle mancanti". */
function ColoringBanner({ sheet, coloring }: { sheet: Sheet; coloring: ColoringState }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0dca8] bg-butter px-4 py-3" role="status">
      {coloring.progress ? (
        <p className="flex items-center gap-3 font-bold">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Creo le versioni da colorare: {coloring.progress.done} di {coloring.progress.total}… (circa 30-60 secondi l'una)
        </p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-bold">
              {coloring.missing === 1 ? 'Manca 1 versione da colorare' : `Mancano ${coloring.missing} versioni da colorare`}
            </span>{' '}
            ({sheet.character}): per ora quelle vignette restano a colori.
          </p>
          <Button tone="primary" onClick={coloring.onGenerate}>
            Genera quelle mancanti ({coloring.missing} {coloring.missing === 1 ? 'immagine' : 'immagini'})
          </Button>
        </>
      )}
    </div>
  )
}

/** Contenuto del pannello opzioni (uguale a lato e nel pannello dal basso). */
function EditorOptions({
  sheet,
  folder,
  settings,
  onChange,
  onSave,
  onOpenFolder,
  onNew,
}: {
  sheet: Sheet
  folder: Folder | undefined
  settings: AppSettings
  onChange: (patch: Partial<Sheet>) => void
  onSave: () => void
  onOpenFolder: (id: string) => void
  onNew: () => void
}) {
  const template = templates[sheet.template]
  const filled = sheet.cells.filter((c) => c.code).length
  const hasBranding = !!settings.logo || settings.centerName.trim() !== ''

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
          <p className="text-sm font-bold">Scheda senza bambino</p>
          <p className="text-xs leading-snug text-muted">Si salva da sola, senza riferimenti a un bambino. Si può usare con più bambini.</p>
          <Button tone="primary" onClick={onSave}>
            Metti in una cartella
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
          {template.layout === 'agenda'
            ? `${sheet.agenda.days === 7 ? 'Lun–Dom' : 'Lun–Ven'} · ${sheet.agenda.rows} ${sheet.agenda.rows === 1 ? 'momento' : 'momenti'} · A4 orizzontale`
            : `${filled} di ${sheet.cells.length} riquadri pieni${template.orientation === 'landscape' ? ' · A4 orizzontale' : ''}`}
        </p>
      </Field>

      {template.layout === 'agenda' && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
          <Toggle
            label="Solo Lun–Ven"
            checked={sheet.agenda.days === 5}
            onChange={(v) => onChange({ agenda: { ...sheet.agenda, days: v ? 5 : 7 } })}
          />
          <Field label="Momenti della giornata">
            <div className="flex items-center gap-2">
              <Button small disabled={sheet.agenda.rows <= 1} onClick={() => onChange({ agenda: { ...sheet.agenda, rows: sheet.agenda.rows - 1 } })} aria-label="Un momento in meno">
                −
              </Button>
              <span className="min-w-16 text-center font-bold">{sheet.agenda.rows}</span>
              <Button small disabled={sheet.agenda.rows >= 4} onClick={() => onChange({ agenda: { ...sheet.agenda, rows: sheet.agenda.rows + 1 } })} aria-label="Un momento in più">
                +
              </Button>
            </div>
            <p className="text-xs text-muted">I nomi delle righe si modificano sul foglio. Le vignette nascoste restano salvate.</p>
          </Field>
        </div>
      )}

      {template.layout === 'checklist' && (
        <Field label="Righe">
          <div className="flex items-center gap-2">
            <Button
              small
              disabled={sheet.checklist.rows <= CHECKLIST_ROWS.min}
              onClick={() => onChange({ checklist: { rows: sheet.checklist.rows - 1 } })}
              aria-label="Una riga in meno"
            >
              −
            </Button>
            <span className="min-w-16 text-center font-bold">{sheet.checklist.rows}</span>
            <Button
              small
              disabled={sheet.checklist.rows >= CHECKLIST_ROWS.max}
              onClick={() => onChange({ checklist: { rows: sheet.checklist.rows + 1 } })}
              aria-label="Una riga in più"
            >
              +
            </Button>
          </div>
          <p className="text-xs text-muted">Da {CHECKLIST_ROWS.min} a {CHECKLIST_ROWS.max}. Le righe nascoste restano salvate.</p>
        </Field>
      )}

      {template.layout !== 'agenda' && (
        <Field label="Mostra">
          <Segmented<CellShow>
            value={sheet.sequence.show}
            options={[
              ['both', 'Immagini e testo'],
              ['images', 'Solo immagini'],
              ['text', 'Solo testo'],
            ]}
            onChange={(show) => onChange({ sequence: { ...sheet.sequence, show } })}
          />
        </Field>
      )}

      {template.numbered && (
        <Toggle
          label="Numeri dei passaggi"
          hint={sheet.sequence.numbers ? undefined : 'Senza numeri l’ordine resta da sinistra a destra e dall’alto in basso.'}
          checked={sheet.sequence.numbers}
          onChange={(numbers) => onChange({ sequence: { ...sheet.sequence, numbers } })}
        />
      )}

      {folder && (
      <div className="flex flex-col gap-2">
        <NameInput label="Nome sulle schede (facoltativo)" value={sheet.childName} onChange={handleChildName} />
        <p className="text-xs text-muted">Vale per tutte le schede di {folder.name}. Si conserva cifrato.</p>
        {!sheet.childName.trim() && (
          <button
            onClick={() => handleChildName(folder.name)}
            className="self-start rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent hover:bg-accent/15"
          >
            Usa “{folder.name}”
          </button>
        )}
      </div>
      )}

      <Toggle
        label="Testo in stampatello maiuscolo"
        hint="Titolo, frasi e Ricordo sempre, a schermo e nel PDF. Il testo scritto non cambia."
        checked={sheet.uppercase}
        onChange={(uppercase) => onChange({ uppercase })}
      />

      {template.times && (
        <Field label="Orario come">
          <Segmented<TimeMode>
            value={sheet.timeMode}
            options={[
              ['analog', 'Analogico'],
              ['digital', 'Digitale'],
              ['both', 'Entrambi'],
            ]}
            onChange={(timeMode) => onChange({ timeMode })}
          />
          {!sheet.sequence.numbers && (
            <p className="text-xs text-muted">Senza numeri si vedono solo gli orari già scritti: per aggiungerne, riaccendi i numeri.</p>
          )}
        </Field>
      )}

      {template.orientation === 'portrait' && (
        <Toggle
          label="Riquadro “Ricordo sempre”"
          checked={sheet.remember.enabled}
          onChange={(enabled) => onChange({ remember: { ...sheet.remember, enabled } })}
        />
      )}

      {template.layout !== 'checklist' && sheet.sequence.show !== 'text' && (
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
      )}

      <Toggle
        label="Versione da colorare"
        hint="Vignette a contorno nero, numeri, cornici e simboli in bianco e nero: si risparmia inchiostro."
        checked={sheet.coloring}
        onChange={(coloring) => onChange({ coloring })}
      />

      {hasBranding && (
        <Toggle
          label="Mostra logo"
          hint={`Piè di pagina con ${settings.logo ? 'logo' : ''}${settings.logo && settings.centerName ? ' e ' : ''}${settings.centerName ? 'nome del centro' : ''}.`}
          checked={sheet.showLogo ?? !!settings.logo}
          onChange={(showLogo) => onChange({ showLogo })}
        />
      )}

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

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="flex rounded-full bg-sand p-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={`min-h-9 flex-1 rounded-full px-2 text-sm font-bold transition ${value === id ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** Menu "Esporta": PDF stampa, PDF WhatsApp, carte da ritagliare, stelline, versione da colorare. */
function ExportMenu({
  sheet,
  busy,
  onExport,
  onCards,
  onColoring,
}: {
  sheet: Sheet
  busy: ExportKind | null
  onExport: (kind: ExportKind, content?: ExportContent) => void
  onCards: (mode: CardsMode) => void
  onColoring: (value: boolean) => void
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
          <li role="none" className="px-3 py-2">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="font-bold">Versione da colorare</span>
              <input
                type="checkbox"
                role="menuitemcheckbox"
                aria-checked={sheet.coloring}
                checked={sheet.coloring}
                onChange={(e) => onColoring(e.target.checked)}
                className="h-5 w-5 accent-[#3f74b8]"
              />
            </label>
          </li>
          <li role="separator" className="mx-3 my-1 border-t border-line/70" />
          {item('PDF stampa', 'A4 alta qualità, da plastificare', () => onExport('stampa'))}
          {item('PDF WhatsApp', 'File leggero da inviare', () => onExport('whatsapp'))}
          {item('Carte da ritagliare…', 'Le vignette come carte singole', () => onCards('cards'))}
          {canReorder(templates[sheet.template]) &&
            item('Versione da riordinare…', 'Base vuota + vignette mescolate da ritagliare', () => onCards('reorder'))}
          {usesDoneCircle(sheet) && (
            <>
              <li role="separator" className="mx-3 my-1 border-t border-line/70" />
              {item('Stelline · stampa', 'Solo la pagina di stelline da ritagliare', () => onExport('stampa', { type: 'stars' }))}
              {item('Stelline · WhatsApp', 'Solo stelline, file leggero', () => onExport('whatsapp', { type: 'stars' }))}
            </>
          )}
        </ul>
      )}
    </div>
  )
}

/** Carte da ritagliare, oppure versione da riordinare (base vuota + carte mescolate) */
type CardsMode = 'cards' | 'reorder'

/** Carte da ritagliare: misura, striscia agenda, stampa o WhatsApp. */
function CardsDialog({
  mode,
  sheet,
  busy,
  onExport,
  onClose,
}: {
  mode: CardsMode
  sheet: Sheet
  busy: ExportKind | null
  onExport: (kind: ExportKind, size: CardSize, strip: boolean) => void
  onClose: () => void
}) {
  const [size, setSize] = useState<CardSize>('M')
  const [strip, setStrip] = useState(false)
  const count = sheetCards(sheet).length
  const m = cardMetrics(size)
  const pages = Math.max(1, Math.ceil(count / m.perPage))

  return (
    <Modal title={mode === 'reorder' ? 'Versione da riordinare' : 'Carte da ritagliare'} onClose={onClose} size="sm">
      <div className="flex flex-col gap-5">
        {count === 0 ? (
          <p className="text-muted">La scheda non ha ancora vignette.</p>
        ) : (
          <>
            {mode === 'reorder' ? (
              <p className="leading-relaxed text-muted">
                Pagina 1: la scheda con i riquadri vuoti{sheet.sequence.numbers && templates[sheet.template].numbered ? ' e numerati' : ''}, la
                base dove attaccare le carte. Poi le {count} carte <strong className="text-ink">in ordine mescolato</strong>, da
                ritagliare e rimettere in ordine. Scegli una misura che entri nei riquadri.
              </p>
            ) : (
              <p className="text-muted">
                {count} {count === 1 ? 'carta' : 'carte'}
                {sheet.sequence.show === 'images' ? ' con la vignetta' : sheet.sequence.show === 'text' ? ' con la frase' : ' con vignetta e frase'}, linee
                di taglio tratteggiate.
              </p>
            )}
            <div role="radiogroup" aria-label="Misura" className="flex flex-col gap-2">
              {(Object.keys(CARD_LABEL) as CardSize[]).map((s) => {
                const ms = cardMetrics(s)
                return (
                  <label
                    key={s}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${
                      size === s ? 'border-accent bg-accent-soft' : 'border-line bg-white'
                    }`}
                  >
                    <input type="radio" checked={size === s} onChange={() => setSize(s)} className="accent-[#3f74b8]" />
                    <span className="flex flex-col">
                      <span className="font-bold">{CARD_LABEL[s]}</span>
                      <span className="text-xs text-muted">{ms.perPage} per pagina</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {mode === 'cards' && (
            <Toggle
              label="Aggiungi striscia agenda"
              hint={`Pagina in più: ${count} caselle vuote della stessa misura e in fondo “FINITO”, per agende con velcro.`}
              checked={strip}
              onChange={setStrip}
            />
            )}
            <p className="text-sm text-muted">
              {mode === 'reorder' ? '1 pagina di base + ' : ''}
              {pages} {pages === 1 ? 'pagina' : 'pagine'} di carte{strip && mode === 'cards' ? ' + striscia agenda' : ''}
              {sheet.coloring ? ' · versione da colorare' : ''}.
            </p>
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Annulla</Button>
          <Button tone="soft" disabled={count === 0 || busy !== null} onClick={() => onExport('whatsapp', size, strip)}>
            PDF WhatsApp
          </Button>
          <Button tone="primary" disabled={count === 0 || busy !== null} onClick={() => onExport('stampa', size, strip)}>
            PDF stampa
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Foglio al centro: si adatta allo spazio disponibile, con zoom manuale. */
function SheetCanvas({
  sheet,
  look,
  onChange,
  onChooseScene,
  onChooseSymbol,
}: {
  sheet: Sheet
  look: ReturnType<typeof lookFor>
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onChooseSymbol: (index: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const landscape = templates[sheet.template].orientation === 'landscape'
  const pageW = (landscape ? 297 : 210) * PX_PER_MM
  const pageH = (landscape ? 210 : 297) * PX_PER_MM
  const [box, setBox] = useState({ w: pageW, h: pageH })
  /** null = adatta allo schermo */
  const [zoom, setZoom] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Cambiando orientamento si torna ad "adatta allo schermo"
  useEffect(() => setZoom(null), [landscape])

  const pad = box.w < 640 ? 12 : 32
  const fit = Math.max(0.2, Math.min((box.w - 2 * pad) / pageW, (box.h - 2 * pad) / pageH))
  const scale = zoom ?? fit
  const setScale = (s: number) => setZoom(Math.min(2, Math.max(0.25, Math.round(s * 20) / 20)))

  return (
    <div className="relative min-w-0 flex-1">
      <div ref={ref} className="absolute inset-0 overflow-auto">
        <div className="flex min-h-full min-w-full" style={{ padding: pad }}>
          <div
            className="m-auto shrink-0 overflow-hidden rounded-lg bg-white shadow-[0_8px_30px_rgba(59,56,70,0.10)]"
            style={{ width: pageW * scale, height: pageH * scale }}
          >
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <SheetView
                sheet={sheet}
                look={look}
                scale={scale}
                onChange={onChange}
                onChooseScene={onChooseScene}
                onChooseSymbol={onChooseSymbol}
              />
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
