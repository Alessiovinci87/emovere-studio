import { useId, useState } from 'react'
import { choiceProblem, initialChoices, runImport, type FolderChoice, type ImportResult, type ImportSource } from '../lib/importLocal'
import { Modal } from './Modal'
import { Button, PrivacyNote, inputClass } from './ui'

/**
 * Importazione nel centro (dal browser o da un file di backup): per ogni cartella si sceglie lo pseudonimo,
 * se il nome della cartella era quello vero e quale nome stampare sulle schede. Poi si importa tutto.
 */
export function ImportDialog({
  source,
  isOwner,
  centerSettingsEmpty,
  onDone,
  onClose,
}: {
  source: ImportSource
  isOwner: boolean
  centerSettingsEmpty: boolean
  onDone: (result: ImportResult) => void
  onClose: () => void
}) {
  const [choices, setChoices] = useState<FolderChoice[]>(() => initialChoices(source))
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const problems = choices.map(choiceProblem)
  const sheetCount = source.data.sheets.length + (source.draft ? 1 : 0)
  const update = (i: number, patch: Partial<FolderChoice>) => setChoices((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  async function start() {
    setError(null)
    setProgress({ done: 0, total: 1 })
    try {
      const result = await runImport(source, choices, { isOwner, centerSettingsEmpty }, (done, total) => setProgress({ done, total }))
      onDone(result)
    } catch (err) {
      // Si può ripetere: quanto già importato non si duplica
      setError(`${(err as Error).message} Riprova: quello che è già stato importato non viene duplicato.`)
      setProgress(null)
    }
  }

  return (
    <Modal title={source.kind === 'browser' ? 'Importa i dati di questo browser' : 'Importa il backup'} onClose={progress ? undefined : onClose}>
      <div className="flex flex-col gap-5">
        <p className="leading-relaxed">
          {source.data.folders.length} {source.data.folders.length === 1 ? 'cartella' : 'cartelle'} e {sheetCount}{' '}
          {sheetCount === 1 ? 'scheda' : 'schede'}
          {source.draft ? ' (compresa la bozza, che diventa una scheda senza bambino)' : ''} entrano nel centro, accanto a quelle
          che ci sono già. Nel centro ogni bambino compare con uno <strong>pseudonimo</strong>; il nome stampato sulle schede si
          conserva cifrato.
        </p>
        {choices.length > 0 && (
          <ul className="flex flex-col gap-3">
            {choices.map((choice, i) => (
              <FolderRow key={choice.folder.id} choice={choice} problem={problems[i]} isOwner={isOwner} onChange={(patch) => update(i, patch)} />
            ))}
          </ul>
        )}
        {progress && (
          <div className="flex flex-col gap-2" role="status">
            <div className="h-3 overflow-hidden rounded-full bg-sand">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            </div>
            <p className="text-sm text-muted">
              Importo… {progress.done} di {progress.total}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-bold text-[#a2472f]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} disabled={progress !== null}>
            Non ora
          </Button>
          <Button tone="primary" disabled={progress !== null || problems.some(Boolean)} onClick={() => void start()}>
            Importa
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function FolderRow({
  choice,
  problem,
  isOwner,
  onChange,
}: {
  choice: FolderChoice
  problem: string | null
  isOwner: boolean
  onChange: (patch: Partial<FolderChoice>) => void
}) {
  const id = useId()
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <p className="font-bold">📁 {choice.folder.name}</p>
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={choice.realName}
          onChange={(e) => onChange({ realName: e.target.checked, pseudonym: e.target.checked ? '' : choice.folder.name })}
          className="h-5 w-5 accent-[#3f74b8]"
        />
        <span className="text-sm">
          È il nome vero del bambino
          {choice.realName && (
            <span className="block text-xs text-muted">
              {isOwner ? 'Si conserva cifrato, visibile solo al titolare.' : 'Nel centro non si conserva: serve uno pseudonimo.'}
            </span>
          )}
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Pseudonimo</span>
          <input value={choice.pseudonym} onChange={(e) => onChange({ pseudonym: e.target.value })} maxLength={60} className={inputClass} placeholder="Es. Stella, B.R." />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold">Nome sulle schede</span>
          <input
            value={choice.materialName}
            onChange={(e) => onChange({ materialName: e.target.value })}
            maxLength={40}
            aria-describedby={id}
            className={inputClass}
            placeholder="Vuoto = nessun nome"
          />
        </label>
      </div>
      <PrivacyNote id={id} />
      {problem && <p className="text-sm font-bold text-[#a2472f]">{problem}</p>}
    </li>
  )
}
