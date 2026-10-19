import { useState } from 'react'
import type { SequenceProposal } from '../../config/flow'
import { getScene, sceneThumb, sceneTitle } from '../../lib/catalog'
import { stepColors } from '../../lib/sheet'
import type { Character, Scene } from '../../types'
import { AiCreateDialog } from '../AiCreateDialog'
import { SparkleIcon } from '../Icons'
import { Library } from '../Library'
import { Modal } from '../Modal'
import { Button, inputClass } from '../ui'

// Proposta di sequenza del flusso guidato: titolo e passaggi modificabili prima di creare la scheda.
// Le vignette si scelgono solo dalla libreria; dove manca, "Genera questa vignetta" usa la creazione con AI
// (solo su richiesta, con il limite e il costo indicati nella finestra).

interface Props {
  proposal: SequenceProposal
  character: Character
  onChange: (proposal: SequenceProposal) => void
  /** Vignetta creata con AI: va aggiunta al catalogo dell'app */
  onAiScene: (scene: Scene) => void
}

export function SequenceProposalEditor({ proposal, character, onChange, onAiScene }: Props) {
  const [picking, setPicking] = useState<number | null>(null)
  const [generating, setGenerating] = useState<number | null>(null)
  const steps = proposal.steps
  const withScene = steps.filter((s) => s.code && getScene(s.code)).length

  const setStep = (index: number, patch: Partial<SequenceProposal['steps'][number]>) =>
    onChange({ ...proposal, steps: steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) })
  const move = (index: number, delta: number) => {
    const next = [...steps]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    onChange({ ...proposal, steps: next })
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Titolo</span>
        <input
          value={proposal.title}
          onChange={(e) => onChange({ ...proposal, title: e.target.value })}
          maxLength={120}
          className={`${inputClass} text-lg font-bold`}
        />
      </label>
      <p className="text-sm text-muted">
        {withScene} {withScene === 1 ? 'passaggio ha' : 'passaggi hanno'} una vignetta della libreria
        {withScene < steps.length ? `, ${steps.length - withScene} senza: scegline una o generala con AI` : ''}. Tutto resta
        modificabile anche dopo, nell’editor.
      </p>

      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => {
          const scene = step.code ? getScene(step.code) : undefined
          const color = stepColors[i % stepColors.length]
          return (
            <li key={i} className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {i + 1}
                </span>
                <button
                  onClick={() => setPicking(i)}
                  aria-label={scene ? `Cambia la vignetta del passaggio ${i + 1}` : `Scegli la vignetta del passaggio ${i + 1}`}
                  className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
                    scene ? 'bg-sand' : 'border-2 border-dashed border-line text-xs font-bold text-muted'
                  }`}
                >
                  {scene ? (
                    <img src={sceneThumb(scene.code, character)} alt={sceneTitle(scene, character)} className="h-full w-full object-cover" />
                  ) : (
                    'Scegli'
                  )}
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  value={step.text}
                  onChange={(e) => setStep(i, { text: e.target.value })}
                  maxLength={200}
                  aria-label={`Frase del passaggio ${i + 1}`}
                  placeholder={scene ? sceneTitle(scene, character) : 'Frase del passaggio'}
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-2">
                  {!scene && (
                    <Button
                      small
                      tone="soft"
                      disabled={step.text.trim().length < 3}
                      title={step.text.trim().length < 3 ? 'Scrivi prima la frase del passaggio' : undefined}
                      onClick={() => setGenerating(i)}
                      className="inline-flex items-center gap-1"
                    >
                      <SparkleIcon className="h-4 w-4" />
                      Genera questa vignetta
                    </Button>
                  )}
                  {scene && (
                    <Button small onClick={() => setStep(i, { code: null })}>
                      Togli vignetta
                    </Button>
                  )}
                  <Button small disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Sposta su il passaggio ${i + 1}`}>
                    ↑
                  </Button>
                  <Button small disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Sposta giù il passaggio ${i + 1}`}>
                    ↓
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {picking !== null && (
        <Modal title={`Scegli la vignetta per il passaggio ${picking + 1}`} onClose={() => setPicking(null)}>
          <Library
            character={character}
            onPick={(scene) => {
              setStep(picking, { code: scene.code })
              setPicking(null)
            }}
          />
        </Modal>
      )}

      {generating !== null && (
        <AiCreateDialog
          initial={{ description: steps[generating].text, character }}
          onSaved={(scene) => {
            onAiScene(scene)
            setStep(generating, { code: scene.code })
            setGenerating(null)
          }}
          onClose={() => setGenerating(null)}
        />
      )}
    </div>
  )
}
