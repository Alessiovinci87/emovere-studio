import { useState } from 'react'
import { Page, SectionHeader } from '../components/AppShell'
import { CharacterToggle } from '../components/CharacterToggle'
import { FolderPicker } from '../components/Pickers'
import { catalog, sceneThumb } from '../lib/catalog'
import { availablePresets, genderize, type Preset } from '../lib/presets'
import { WEEK_DAYS, stepColors, templateList, templates, type Template } from '../lib/sheet'
import type { Character, Folder, TemplateId } from '../types'

export type CreateChoice = { folderId: string } | { newName: string } | { draft: true }

interface Props {
  folders: Folder[]
  /** Cartella proposta (es. da "+ Nuova scheda" dentro una cartella) */
  folderId?: string
  onBack?: () => void
  onCreate: (template: TemplateId, choice: CreateChoice) => void
  onCreatePreset: (preset: Preset, character: Character, choice: CreateChoice) => void
}

type Chosen = { kind: 'template'; template: Template } | { kind: 'preset'; preset: Preset }

/** Schede pronte e galleria dei modelli vuoti. Scelto, si sceglie la cartella (o bozza) e si apre l'editor. */
export function CreateView({ folders, folderId, onBack, onCreate, onCreatePreset }: Props) {
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [character, setCharacter] = useState<Character>('bambina')
  const folder = folders.find((f) => f.id === folderId)
  const presets = availablePresets()

  return (
    <Page>
      <SectionHeader
        title="Crea"
        subtitle={folder ? `Nuova scheda per ${folder.name}.` : 'Parti da una scheda pronta o da un modello vuoto.'}
        onBack={onBack}
      />

      {presets.length > 0 && (
        <section className="mb-10 flex flex-col gap-4">
          <h2 className="text-lg font-bold">Pronte da usare</h2>
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {presets.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setChosen({ kind: 'preset', preset: p })}
                  className="flex h-full w-full items-center gap-5 rounded-3xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <TemplatePreview template={templates[p.template]} codes={p.scene} />
                  <span className="flex flex-col gap-1.5">
                    <span className="text-lg font-bold">{p.titolo}</span>
                    <span className="text-sm leading-snug text-muted">
                      {templates[p.template].label} · {p.scene.length} vignette già pronte, tutto modificabile.
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Modelli vuoti</h2>
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {templateList.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setChosen({ kind: 'template', template: t })}
                className="flex h-full w-full items-center gap-5 rounded-3xl bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <TemplatePreview template={t} />
                <span className="flex flex-col gap-1.5">
                  <span className="text-lg font-bold">{t.label}</span>
                  <span className="text-sm leading-snug text-muted">{t.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-8 text-sm text-muted">
        Su ogni modello puoi scegliere immagini e testo, solo immagini o solo testo, togliere i numeri, aggiungere il
        cerchietto per la stellina “fatto”, lo stampatello maiuscolo, la versione da colorare e le carte da ritagliare. Le
        sequenze si esportano anche in versione da riordinare.
      </p>

      {chosen?.kind === 'template' && (
        <FolderPicker
          title={`${chosen.template.label}: dove la salvo?`}
          confirmLabel="Crea e apri"
          folders={[...folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))}
          initialFolderId={folderId}
          allowDraft
          onConfirm={(choice) => {
            onCreate(chosen.template.id, choice)
            setChosen(null)
          }}
          onClose={() => setChosen(null)}
        />
      )}

      {chosen?.kind === 'preset' && (
        <FolderPicker
          title={`${genderize(chosen.preset.titolo, character)}: dove la salvo?`}
          confirmLabel="Crea e apri"
          folders={[...folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))}
          initialFolderId={folderId}
          allowDraft
          extra={
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold">Personaggio</span>
              <CharacterToggle value={character} onChange={setCharacter} />
            </div>
          }
          onConfirm={(choice) => {
            onCreatePreset(chosen.preset, character, choice)
            setChosen(null)
          }}
          onClose={() => setChosen(null)}
        />
      )}
    </Page>
  )
}

/** Mini anteprima del foglio A4 (verticale o orizzontale) con vignette di esempio. */
function TemplatePreview({ template, codes }: { template: Template; codes?: string[] }) {
  const landscape = template.orientation === 'landscape'
  const agenda = template.layout === 'agenda'
  const cols = agenda ? 7 : template.cols
  const rows = agenda ? 3 : template.rows
  const count = cols * rows
  const samples = codes ?? catalog.scenes.slice(0, count).map((s) => s.code)
  if (template.layout === 'checklist') {
    // Righe: vignetta piccola, frase, casella
    return (
      <span className="flex h-[124px] w-[88px] shrink-0 flex-col gap-1 rounded-lg border border-line bg-white p-1.5 shadow-sm" aria-hidden="true">
        <span className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-line" />
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex min-h-0 flex-1 items-center gap-1 rounded-[3px] border px-0.5" style={{ borderColor: `${stepColors[i % stepColors.length]}88` }}>
            <img src={sceneThumb(samples[i % samples.length], 'bambina')} alt="" loading="lazy" className="aspect-square h-[80%] rounded-[2px] object-cover" />
            <span className="h-1 flex-1 rounded-full bg-line" />
            <span className="aspect-square h-[55%] rounded-[2px] border" style={{ borderColor: stepColors[i % stepColors.length] }} />
          </span>
        ))}
      </span>
    )
  }
  return (
    <span
      className={`flex shrink-0 flex-col gap-1 rounded-lg border border-line bg-white p-1.5 shadow-sm ${
        landscape ? 'h-[88px] w-[124px]' : 'h-[124px] w-[88px]'
      }`}
      aria-hidden="true"
    >
      <span className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-line" />
      {agenda && (
        <span className="grid shrink-0 grid-cols-7 gap-[2px]">
          {WEEK_DAYS.map((d, i) => (
            <span key={d} className="h-1.5 rounded-[2px]" style={{ backgroundColor: `${stepColors[i % stepColors.length]}66` }} />
          ))}
        </span>
      )}
      <span
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: template.layout === 'stack' ? '7px 3px' : template.layout === 'sequence' ? '3px 7px' : agenda ? '2px' : '3px',
        }}
      >
        {Array.from({ length: count }, (_, i) => {
          const code = agenda ? (i % 3 === 0 ? samples[i % samples.length] : null) : samples[i]
          const highlighted = template.highlight === i
          return (
            <span
              key={i}
              className="relative overflow-hidden rounded-[3px] border bg-white"
              style={{ borderColor: `${stepColors[i % stepColors.length]}${highlighted ? '' : '88'}`, borderWidth: highlighted ? 2 : 1 }}
            >
              {code && <img src={sceneThumb(code, 'bambina')} alt="" loading="lazy" className="h-full w-full object-cover" />}
              {template.numbered && (
                <span className="absolute left-0.5 top-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stepColors[i % stepColors.length] }} />
              )}
            </span>
          )
        })}
      </span>
    </span>
  )
}
