import { useMemo, useState } from 'react'
import { catalog, filterScenes, sceneThumb, sceneTitle, settings, usedBlocks } from '../lib/catalog'
import type { Character, Scene } from '../types'
import { CharacterToggle } from './CharacterToggle'

interface Props {
  character: Character
  /** Se assente il personaggio è fisso (es. scelta per un riquadro della scheda) */
  onCharacterChange?: (c: Character) => void
  onPick: (scene: Scene) => void
}

export function Library({ character, onCharacterChange, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [block, setBlock] = useState<string | null>(null)
  const [setting, setSetting] = useState<string | null>(null)

  const scenes = useMemo(
    () => filterScenes({ query, block, setting, character }),
    [query, block, setting, character],
  )
  const hasFilters = query !== '' || block !== null || setting !== null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca: denti, colazione, scuola…"
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-5 py-2.5 outline-none focus:border-sky"
            autoFocus
          />
          {onCharacterChange && <CharacterToggle value={character} onChange={onCharacterChange} />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={block === null} onClick={() => setBlock(null)}>
            Tutti i blocchi
          </Chip>
          {usedBlocks.map((b) => (
            <Chip key={b} active={block === b} onClick={() => setBlock(block === b ? null : b)}>
              {catalog.blocks[b]}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Ambiente:</span>
          <Chip active={setting === null} onClick={() => setSetting(null)} small>
            Tutti
          </Chip>
          {settings.map((s) => (
            <Chip key={s} active={setting === s} onClick={() => setSetting(setting === s ? null : s)} small>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Chip>
          ))}
        </div>
      </div>

      {scenes.length === 0 ? (
        <div className="rounded-3xl bg-sand/60 py-16 text-center text-muted">
          Nessuna vignetta trovata.
          {hasFilters && (
            <button
              className="ml-2 font-bold text-sky underline"
              onClick={() => {
                setQuery('')
                setBlock(null)
                setSetting(null)
              }}
            >
              Togli i filtri
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {scenes.map((scene) => (
            <li key={scene.code}>
              <button
                onClick={() => onPick(scene)}
                className="group flex h-full w-full flex-col overflow-hidden rounded-3xl border border-line bg-white text-left transition hover:-translate-y-0.5 hover:border-sky hover:shadow-md"
              >
                <img
                  src={sceneThumb(scene.code, character)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full bg-sand object-cover"
                />
                <span className="flex flex-1 items-baseline justify-between gap-2 px-4 py-3">
                  <span className="font-bold leading-snug">{sceneTitle(scene, character)}</span>
                  <span className="text-xs text-muted">{scene.code}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  small,
  children,
}: {
  active: boolean
  onClick: () => void
  small?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border font-bold transition ${small ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'} ${
        active ? 'border-sky bg-sky-soft text-ink' : 'border-line bg-white text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
