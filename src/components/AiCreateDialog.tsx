import { useEffect, useState, type ReactNode } from 'react'
import {
  AI_ADULTS,
  AI_EXPRESSIONS,
  AI_IMAGE_COST_ESTIMATE,
  AI_OUTFITS,
  AI_SETTINGS,
  type AiAdult,
  type AiExpression,
  type AiOutfit,
  type AiSetting,
} from '../config/ai'
import { aiApi, type AiPreview, type AiStatus } from '../lib/ai'
import type { Character, Scene } from '../types'
import { CharacterToggle } from './CharacterToggle'
import { Modal } from './Modal'
import { Button, inputClass } from './ui'

interface Props {
  onSaved: (scene: Scene) => void
  onClose: () => void
  /** Valori iniziali (es. dal flusso guidato: frase del passaggio e personaggio della scheda) */
  initial?: { description?: string; character?: Character }
}

/** Costo stimato di una vignetta (2 immagini), in dollari con la virgola */
const costText = (['min', 'max'] as const).map((k) => (AI_IMAGE_COST_ESTIMATE[k] * 2).toFixed(2).replace('.', ',')).join('-')

type Step = { name: 'form' } | { name: 'generating' } | { name: 'preview'; preview: AiPreview } | { name: 'saving'; preview: AiPreview }

/** Crea una nuova vignetta con AI: versione bambina e bambino, anteprima, salvataggio in libreria. */
export function AiCreateDialog({ onSaved, onClose, initial }: Props) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [character, setCharacter] = useState<Character>(initial?.character ?? 'bambina')
  const [setting, setSetting] = useState<AiSetting>('cameretta')
  const [outfit, setOutfit] = useState<AiOutfit>('casa')
  const [expression, setExpression] = useState<AiExpression>('serena')
  const [adult, setAdult] = useState<AiAdult | null>(null)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [step, setStep] = useState<Step>({ name: 'form' })
  const [error, setError] = useState<string | null>(null)
  // Titoli e tag confermati al salvataggio
  const [titleF, setTitleF] = useState('')
  const [titleM, setTitleM] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    aiApi.status().then(setStatus, (err: Error) => setError(err.message))
  }, [])

  const remaining = status ? status.limit - status.used : null
  const canGenerate = description.trim().length >= 3 && (remaining === null || remaining >= 2) && step.name === 'form'

  async function generate() {
    setError(null)
    setStep({ name: 'generating' })
    try {
      const preview = await aiApi.generate({ setting, outfit, expression, adult, description })
      setStatus((s) => (s ? { ...s, used: preview.used, limit: preview.limit, period: preview.period } : s))
      setTitleF(preview.title_f)
      setTitleM(preview.title_m)
      setTags(preview.tags.join(', '))
      setStep({ name: 'preview', preview })
    } catch (err) {
      setError((err as Error).message)
      setStep({ name: 'form' })
    }
  }

  async function save(preview: AiPreview) {
    setError(null)
    setStep({ name: 'saving', preview })
    try {
      const { scene } = await aiApi.save({
        title_f: titleF,
        title_m: titleM,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        setting,
        outfit,
        adult,
        images: preview.images,
      })
      onSaved(scene)
    } catch (err) {
      setError((err as Error).message)
      setStep({ name: 'preview', preview })
    }
  }

  const busy = step.name === 'generating' || step.name === 'saving'

  return (
    <Modal title="Crea nuova vignetta con AI" onClose={busy ? () => {} : onClose}>
      <div className="flex flex-col gap-6">
        {error && (
          <p role="alert" className="rounded-2xl bg-peach-soft px-4 py-3 font-bold text-[#a2472f]">
            {error}
          </p>
        )}

        {(step.name === 'form' || step.name === 'generating') && (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <Group label="Personaggio principale">
                <CharacterToggle value={character} onChange={setCharacter} />
                <p className="text-xs text-muted">Vengono create sempre entrambe le versioni, bambina e bambino.</p>
              </Group>
              <Group label="Ambiente">
                <select value={setting} onChange={(e) => setSetting(e.target.value as AiSetting)} aria-label="Ambiente" className={inputClass}>
                  {Object.entries(AI_SETTINGS).map(([id, o]) => (
                    <option key={id} value={id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Group>
            </div>

            <Group label="Abbigliamento">
              <Chips options={AI_OUTFITS} value={outfit} onChange={(v) => setOutfit(v as AiOutfit)} />
            </Group>
            <Group label="Espressione">
              <Chips options={AI_EXPRESSIONS} value={expression} onChange={(v) => setExpression(v as AiExpression)} />
            </Group>
            <Group label="Adulto (facoltativo)">
              <div className="flex flex-wrap gap-2">
                <Chip active={adult === null} onClick={() => setAdult(null)}>
                  Nessuno
                </Chip>
                {(Object.keys(AI_ADULTS) as AiAdult[]).map((a) => {
                  const available = status?.adults.includes(a) ?? false
                  return (
                    <Chip
                      key={a}
                      active={adult === a}
                      disabled={!available}
                      title={available ? undefined : 'Foglio di riferimento non ancora caricato'}
                      onClick={() => setAdult(a)}
                    >
                      {AI_ADULTS[a].label}
                    </Chip>
                  )
                })}
              </div>
              {status && status.adults.length === 0 && (
                <p className="text-xs text-muted">Gli adulti si attivano quando i loro fogli di riferimento sono in libreria.</p>
              )}
            </Group>

            <Group label="Cosa fa il bambino?">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={300}
                aria-label="Cosa fa il bambino"
                placeholder="Es. si allaccia le scarpe da solo"
                className={`${inputClass} resize-none text-lg`}
              />
              <p className="text-xs text-muted">Scrivi in italiano solo l'azione: ambiente, vestiti ed espressione li scegli sopra.</p>
            </Group>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
              <p className="text-sm text-muted">
                {status
                  ? `${status.period === 'mese' ? 'Questo mese' : 'Oggi'}: ${status.used} di ${status.limit} immagini.`
                  : 'Controllo il limite…'}{' '}
                Ogni vignetta usa 2 immagini, costo stimato {costText} $.
              </p>
              <div className="flex gap-2">
                <Button onClick={onClose} disabled={busy}>
                  Annulla
                </Button>
                <Button tone="primary" onClick={generate} disabled={!canGenerate}>
                  {step.name === 'generating' ? 'Sto disegnando…' : 'Genera'}
                </Button>
              </div>
            </div>
            {remaining !== null && remaining < 2 && (
              <p className="text-sm font-bold text-[#a2472f]">
                {status?.period === 'mese' ? 'Limite del mese raggiunto: si riparte il primo del mese.' : 'Limite di oggi raggiunto: si riparte domani.'}
              </p>
            )}
            {step.name === 'generating' && (
              <p className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-accent" role="status">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Sto disegnando la versione bambina e la versione bambino: può volerci circa un minuto.
              </p>
            )}
          </>
        )}

        {(step.name === 'preview' || step.name === 'saving') && (
          <>
            <div className="mx-auto grid w-full max-w-xl grid-cols-2 gap-4">
              {(character === 'bambina' ? (['bambina', 'bambino'] as const) : (['bambino', 'bambina'] as const)).map((c) => (
                <figure key={c} className="flex flex-col gap-2">
                  <img src={step.preview.images[c]} alt={`Anteprima ${c}`} className="aspect-square w-full rounded-3xl bg-sand object-cover shadow-sm" />
                  <figcaption className="text-center text-sm font-bold capitalize text-muted">{c}</figcaption>
                </figure>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Group label="Titolo bambina">
                <input value={titleF} onChange={(e) => setTitleF(e.target.value)} maxLength={60} aria-label="Titolo bambina" className={inputClass} />
              </Group>
              <Group label="Titolo bambino">
                <input value={titleM} onChange={(e) => setTitleM(e.target.value)} maxLength={60} aria-label="Titolo bambino" className={inputClass} />
              </Group>
            </div>
            <Group label="Tag (separati da virgola)">
              <input value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tag" className={inputClass} />
            </Group>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 pt-5">
              <Button onClick={onClose} disabled={busy}>
                Annulla
              </Button>
              <Button
                onClick={() => {
                  setStep({ name: 'form' })
                  void generate()
                }}
                disabled={busy || (remaining !== null && remaining < 2)}
              >
                Rigenera
              </Button>
              <Button tone="primary" onClick={() => save(step.preview)} disabled={busy || !titleF.trim() || !titleM.trim()}>
                {step.name === 'saving' ? 'Salvo…' : 'Salva in libreria'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold">{label}</span>
      {children}
    </div>
  )
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: Record<string, { label: string }>
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(options).map(([id, o]) => (
        <Chip key={id} active={value === id} onClick={() => onChange(id)}>
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

function Chip({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`min-h-11 rounded-full border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-white text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
