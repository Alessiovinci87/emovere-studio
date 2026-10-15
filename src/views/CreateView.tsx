import { useState } from 'react'
import { Page, SectionHeader } from '../components/AppShell'
import { FolderPicker } from '../components/Pickers'
import { catalog, sceneThumb } from '../lib/catalog'
import { stepColors, templateList, type Template } from '../lib/sheet'
import type { Folder, TemplateId } from '../types'

export type CreateChoice = { folderId: string } | { newName: string } | { draft: true }

interface Props {
  folders: Folder[]
  /** Cartella proposta (es. da "+ Nuova scheda" dentro una cartella) */
  folderId?: string
  onBack?: () => void
  onCreate: (template: TemplateId, choice: CreateChoice) => void
}

/** Galleria dei modelli. Scelto il modello, si sceglie la cartella (o bozza) e si apre l'editor. */
export function CreateView({ folders, folderId, onBack, onCreate }: Props) {
  const [chosen, setChosen] = useState<Template | null>(null)
  const folder = folders.find((f) => f.id === folderId)

  return (
    <Page>
      <SectionHeader
        title="Crea"
        subtitle={folder ? `Nuova scheda per ${folder.name}: scegli il modello.` : 'Scegli il modello della nuova scheda.'}
        onBack={onBack}
      />
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {templateList.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => setChosen(t)}
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
      <p className="mt-8 text-sm text-muted">
        Su ogni modello puoi aggiungere il cerchietto per la stellina “fatto” e la pagina di stelline da ritagliare.
      </p>

      {chosen && (
        <FolderPicker
          title={`${chosen.label}: dove la salvo?`}
          confirmLabel="Crea e apri"
          folders={[...folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))}
          initialFolderId={folderId}
          allowDraft
          onConfirm={(choice) => {
            onCreate(chosen.id, choice)
            setChosen(null)
          }}
          onClose={() => setChosen(null)}
        />
      )}
    </Page>
  )
}

/** Mini anteprima del foglio A4 con vignette di esempio. */
function TemplatePreview({ template }: { template: Template }) {
  const count = template.cols * template.rows
  const samples = catalog.scenes.slice(0, count)
  return (
    <span
      className="flex h-[124px] w-[88px] shrink-0 flex-col gap-1 rounded-lg border border-line bg-white p-1.5 shadow-sm"
      aria-hidden="true"
    >
      <span className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-line" />
      <span
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${template.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${template.rows}, minmax(0, 1fr))`,
          gap: template.arrows ? '7px 3px' : '3px',
        }}
      >
        {samples.map((scene, i) => (
          <span
            key={scene.code}
            className="relative overflow-hidden rounded-[3px] border"
            style={{ borderColor: `${stepColors[i % stepColors.length]}88` }}
          >
            <img src={sceneThumb(scene.code, 'bambina')} alt="" loading="lazy" className="h-full w-full object-cover" />
            {template.numbered && (
              <span
                className="absolute left-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: stepColors[i % stepColors.length] }}
              />
            )}
          </span>
        ))}
      </span>
    </span>
  )
}
