import { useState } from 'react'
import type { CellSymbol, Folder } from '../types'
import { Modal } from './Modal'
import { SymbolIcon, cornerOptions, symbolOptions } from './SymbolIcon'
import { Button, NameInput } from './ui'

/**
 * Scelta di una cartella (salva, duplica, sposta), con la possibilità di crearne una nuova.
 * Restituisce l'id di una cartella esistente oppure il nome di quella da creare.
 */
export function FolderPicker({
  title,
  confirmLabel,
  folders,
  initialFolderId,
  allowDraft,
  extra,
  onConfirm,
  onClose,
}: {
  title: string
  confirmLabel: string
  folders: Folder[]
  initialFolderId?: string | null
  /** Aggiunge la scelta "Bozza": la scheda non va in nessuna cartella per ora */
  allowDraft?: boolean
  /** Contenuto in più sopra la scelta della cartella (es. personaggio) */
  extra?: React.ReactNode
  onConfirm: (choice: { folderId: string } | { newName: string } | { draft: true }) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string>(initialFolderId ?? folders[0]?.id ?? (allowDraft ? 'draft' : 'new'))
  const [newName, setNewName] = useState('')
  const canConfirm = selected !== 'new' || newName.trim() !== ''

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!canConfirm) return
          onConfirm(
            selected === 'new' ? { newName: newName.trim() } : selected === 'draft' ? { draft: true } : { folderId: selected },
          )
        }}
      >
        {extra}
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Cartella</legend>
          {folders.map((f) => (
            <OptionRow key={f.id} checked={selected === f.id} onSelect={() => setSelected(f.id)} label={f.name} />
          ))}
          <OptionRow checked={selected === 'new'} onSelect={() => setSelected('new')} label="+ Nuova cartella" />
          {allowDraft && (
            <OptionRow checked={selected === 'draft'} onSelect={() => setSelected('draft')} label="Bozza (decido dopo)" />
          )}
        </fieldset>
        {selected === 'new' && (
          <NameInput label="Nome della nuova cartella" value={newName} onChange={setNewName} autoFocus />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" tone="primary" disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function OptionRow({ checked, onSelect, label }: { checked: boolean; onSelect: () => void; label: string }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 font-bold transition ${
        checked ? 'border-sky bg-sky-soft' : 'border-line bg-white hover:border-sky'
      }`}
    >
      <input type="radio" checked={checked} onChange={onSelect} className="accent-sky" />
      {label}
    </label>
  )
}

/** Simbolo sopra la vignetta: tipo e angolo. Le modifiche si vedono subito sulla scheda. */
export function SymbolPicker({
  index,
  value,
  doneCircle,
  onChange,
  onClose,
}: {
  index: number
  value: CellSymbol | null
  /** Con il cerchietto per la stellina l'angolo in alto a destra è occupato */
  doneCircle: boolean
  onChange: (symbol: CellSymbol | null) => void
  onClose: () => void
}) {
  const fallback = doneCircle ? 'tl' : 'tr'
  const corner = value && !(doneCircle && value.corner === 'tr') ? value.corner : fallback
  return (
    <Modal title={`Simbolo per il riquadro ${index + 1}`} onClose={onClose} size="sm">
      <div className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Simbolo" className="grid grid-cols-4 gap-2">
          <SymbolChoice checked={!value} label="Nessuno" onSelect={() => onChange(null)}>
            <span className="text-2xl text-muted">—</span>
          </SymbolChoice>
          {symbolOptions.map((o) => (
            <SymbolChoice
              key={o.kind}
              checked={value?.kind === o.kind}
              label={o.label}
              onSelect={() => onChange({ kind: o.kind, corner })}
            >
              <SymbolIcon kind={o.kind} className="h-10 w-10" />
            </SymbolChoice>
          ))}
        </div>

        {value && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">Angolo della vignetta</span>
            <div role="radiogroup" aria-label="Angolo" className="grid w-40 grid-cols-2 gap-2 self-center">
              {cornerOptions.map((o) => (
                <button
                  key={o.corner}
                  role="radio"
                  aria-checked={corner === o.corner}
                  aria-label={o.label}
                  title={doneCircle && o.corner === 'tr' ? 'Qui c’è il cerchietto per la stellina' : o.label}
                  disabled={doneCircle && o.corner === 'tr'}
                  onClick={() => onChange({ ...value, corner: o.corner })}
                  className={`relative h-16 rounded-xl border-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
                    corner === o.corner ? 'border-sky bg-sky-soft' : 'border-line bg-white hover:border-sky'
                  }`}
                >
                  <SymbolIcon
                    kind={value.kind}
                    className={`absolute h-7 w-7 ${o.corner[0] === 't' ? 'top-1' : 'bottom-1'} ${o.corner[1] === 'l' ? 'left-1' : 'right-1'}`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button tone="primary" onClick={onClose}>
            Fatto
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SymbolChoice({
  checked,
  label,
  onSelect,
  children,
}: {
  checked: boolean
  label: string
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={`flex h-16 items-center justify-center rounded-xl border-2 transition ${
        checked ? 'border-sky bg-sky-soft' : 'border-line bg-white hover:border-sky'
      }`}
    >
      {children}
    </button>
  )
}
