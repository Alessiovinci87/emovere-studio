import { useEffect, useRef, useState } from 'react'
import { templates } from '../lib/sheet'
import type { Sheet } from '../types'
import { CharacterToggle } from './CharacterToggle'
import { SheetView } from './SheetView'

/** Larghezza di un A4 in pixel CSS (210 mm a 96 dpi) */
const A4_WIDTH_PX = (210 / 25.4) * 96
const A4_HEIGHT_PX = (297 / 25.4) * 96

interface Props {
  sheet: Sheet
  onChange: (patch: Partial<Sheet>) => void
  onChooseScene: (index: number) => void
  onReset: () => void
}

export function Composer({ sheet, onChange, onChooseScene, onReset }: Props) {
  const scale = useFitScale()
  const filled = sheet.cells.filter((c) => c.code).length

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="flex shrink-0 flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm lg:sticky lg:top-6 lg:w-64">
        <Field label="Modello">
          <p className="font-bold">{templates[sheet.template].label}</p>
          <p className="text-sm text-muted">
            {filled} di {sheet.cells.length} riquadri pieni
          </p>
        </Field>

        <Field label="Personaggio">
          <CharacterToggle value={sheet.character} onChange={(character) => onChange({ character })} />
        </Field>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="font-bold">Riquadro “Ricordo sempre”</span>
          <input
            type="checkbox"
            checked={sheet.remember.enabled}
            onChange={(e) => onChange({ remember: { ...sheet.remember, enabled: e.target.checked } })}
            className="h-5 w-5 accent-sky"
          />
        </label>

        <p className="text-sm leading-relaxed text-muted">
          Clicca su un riquadro per scegliere la vignetta. Trascina i riquadri per cambiare l'ordine. Titolo,
          frasi e orari si modificano direttamente sul foglio.
        </p>

        <button
          onClick={() => {
            if (confirm('Vuoi iniziare una scheda nuova? Quella attuale verrà cancellata.')) onReset()
          }}
          className="rounded-full border border-line px-4 py-2 text-sm font-bold text-muted hover:bg-sand hover:text-ink"
        >
          Nuova scheda
        </button>
      </aside>

      <div ref={scale.ref} className="min-w-0 flex-1">
        <div
          className="mx-auto overflow-hidden rounded-xl shadow-lg"
          style={{ width: A4_WIDTH_PX * scale.value, height: A4_HEIGHT_PX * scale.value }}
        >
          <div style={{ transform: `scale(${scale.value})`, transformOrigin: 'top left' }}>
            <SheetView sheet={sheet} scale={scale.value} onChange={onChange} onChooseScene={onChooseScene} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  )
}

/** Scala la pagina A4 per farla stare nella larghezza disponibile (mai oltre il 100%). */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setValue(Math.min(1, entry.contentRect.width / A4_WIDTH_PX))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, value }
}
