import type { Character } from '../types'

interface Props {
  value: Character
  onChange: (c: Character) => void
}

const options: { value: Character; label: string }[] = [
  { value: 'bambina', label: 'Bambina' },
  { value: 'bambino', label: 'Bambino' },
]

export function CharacterToggle({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Personaggio" className="inline-flex rounded-full bg-sand p-1">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
