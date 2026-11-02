import { useMemo, useState } from 'react'
import { GOAL_BANK, type GoalTemplate } from '../../config/goalBank'
import { GOAL_AREAS, type GoalArea } from '../../config/profile'
import { normalize } from '../../lib/catalog'
import { Modal } from '../Modal'
import { FilterChip, inputClass } from '../ui'

/** Obiettivi pronti: si sceglie una proposta, che poi si adatta prima di crearla. */
export function GoalBankPicker({ onPick, onClose }: { onPick: (goal: GoalTemplate) => void; onClose: () => void }) {
  const [area, setArea] = useState<GoalArea | null>(null)
  const [query, setQuery] = useState('')
  const areas = GOAL_AREAS.filter((a) => GOAL_BANK.some((g) => g.area === a.id))

  const list = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    return GOAL_BANK.filter((g) => {
      if (area && g.area !== area) return false
      const text = normalize(`${g.title} ${g.description} ${g.material ?? ''}`)
      return words.every((w) => text.includes(w))
    })
  }, [area, query])

  return (
    <Modal title="Obiettivi pronti" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Proposte da cui partire: dopo la scelta puoi modificare titolo, descrizione e criterio prima di creare l’obiettivo.
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca: bagno, turno, emozioni…"
          aria-label="Cerca tra gli obiettivi pronti"
          className={inputClass}
          autoFocus
        />
        <div className="flex flex-wrap gap-2">
          <FilterChip small active={area === null} onClick={() => setArea(null)}>
            Tutte le aree
          </FilterChip>
          {areas.map((a) => (
            <FilterChip key={a.id} small active={area === a.id} onClick={() => setArea(area === a.id ? null : a.id)}>
              {a.label}
            </FilterChip>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="rounded-3xl bg-sand/60 py-10 text-center text-muted">Nessun obiettivo trovato.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((g) => (
              <li key={g.title}>
                <button
                  type="button"
                  onClick={() => onPick(g)}
                  className="flex h-full w-full flex-col gap-1.5 rounded-3xl bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="font-bold leading-snug">{g.title}</span>
                  <span className="text-sm leading-relaxed text-muted">{g.description}</span>
                  <span className="mt-auto flex flex-wrap gap-x-2 pt-1 text-xs text-muted">
                    <span className="font-bold">{GOAL_AREAS.find((a) => a.id === g.area)?.label}</span>
                    {g.material && <span>· Materiale: {g.material}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
