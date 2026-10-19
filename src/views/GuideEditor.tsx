import { useEffect, useId, useState, type ReactNode } from 'react'
import { BackIcon, DownloadIcon } from '../components/Icons'
import { Modal } from '../components/Modal'
import { Button, PrivacyNote, inputClass } from '../components/ui'
import {
  AGE_BANDS,
  FAMILY_LANGUAGES,
  GUIDE_INPUT_MAX,
  GUIDE_POINTS,
  GUIDE_VERSIONS,
  guideRequestText,
  identifyingProblems,
  type AgeBand,
  type FamilyLanguage,
  type GuideInput,
  type GuideVersion,
} from '../config/guide'
import type { ProfileLine } from '../config/flow'
import { childApi } from '../lib/childApi'
import type { ExportKind } from '../lib/exportPdf'
import { chosenProfileLines } from '../lib/flow'
import { guideApi, normalizeGuide, unconfirmed, type GuideContent, type ProfileRequest } from '../lib/guide'
import { materialsApi, type ServerMaterial } from '../lib/materials'
import type { AppSettings } from '../lib/settings'
import { syncLabel, useAutosave } from '../lib/useAutosave'

interface Props {
  id: string
  settings: AppSettings
  /** Nomi da non inviare mai all'AI (cartelle e bambini presenti in questo browser) */
  names: string[]
  onOpen: (id: string) => void
  onClose: () => void
}

/** Carica la guida dal server, poi apre l'editor. */
export function GuideScreen({ id, ...props }: Props) {
  const [material, setMaterial] = useState<ServerMaterial | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setMaterial(null)
    setError(null)
    materialsApi
      .get(id)
      .then((r) => !cancelled && setMaterial(r.material))
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [id])

  if (!material) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-cream p-6 text-center">
        <p className={error ? 'font-bold text-[#a2472f]' : 'text-muted'}>{error ?? 'Apro la guida…'}</p>
        {error && <Button onClick={props.onClose}>Indietro</Button>}
      </div>
    )
  }
  return <GuideEditor key={material.id} material={material} {...props} />
}

function GuideEditor({ material, settings, names, onOpen, onClose }: Omit<Props, 'id'> & { material: ServerMaterial }) {
  const { draft, setDraft, status, flush, resolve } = useAutosave(material)
  const guide = normalizeGuide(draft.content)
  const [tab, setTab] = useState<GuideVersion>('famiglia')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  // Guida di un bambino creata dal flusso guidato: le voci del profilo scelte vanno anche nelle nuove richieste
  const usesProfile = material.childId !== null && guide.profileIds.length > 0
  const [profile, setProfile] = useState<ProfileLine[] | null>(usesProfile ? null : [])
  const profileIdsKey = guide.profileIds.join(',')
  useEffect(() => {
    if (!usesProfile || !material.childId) return
    let cancelled = false
    childApi
      .detail(material.childId)
      .then((d) => !cancelled && setProfile(chosenProfileLines(d.profile, new Set(profileIdsKey.split(',')))))
      .catch((err: Error) => !cancelled && setError(`Voci del profilo non caricate: ${err.message}`))
    return () => {
      cancelled = true
    }
  }, [usesProfile, material.childId, profileIdsKey])
  const profileRequest: ProfileRequest | undefined =
    usesProfile && material.childId ? { childId: material.childId, profileIds: guide.profileIds } : undefined

  const update = (fn: (g: GuideContent) => GuideContent) =>
    setDraft((d) => ({ ...d, content: fn(normalizeGuide(d.content)) as unknown as Record<string, unknown> }))
  const setInput = (patch: Partial<GuideInput>) => update((g) => ({ ...g, input: { ...g.input, ...patch } }))

  const requestText = guideRequestText(guide.input, profile ?? [])
  const problems = identifyingProblems(requestText, names)
  const ready = guide.input.difficulty.trim() !== '' && guide.input.goal.trim() !== '' && profile !== null
  const hasText = [...guide.famiglia, ...guide.scuola].some((p) => p.text.trim())

  async function propose() {
    if (hasText && !confirm('La proposta nuova sostituisce tutti i 20 punti attuali, anche quelli confermati. Continuare?')) return
    setBusy('proposta')
    setError(null)
    try {
      const result = await guideApi.propose(guide.input, profileRequest)
      update((g) => ({
        ...g,
        famiglia: result.family.map((text) => ({ text, confirmed: false })),
        scuola: result.school.map((text) => ({ text, confirmed: false })),
        generatedAt: new Date().toISOString(),
      }))
      if (!draft.title.trim() || draft.title === 'Nuova guida') {
        setDraft((d) => ({ ...d, title: `Guida: ${guide.input.goal.trim()}`.slice(0, 120) }))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function regenerate(version: GuideVersion, index: number) {
    setBusy(`${version}-${index}`)
    setError(null)
    try {
      const { text } = await guideApi.regeneratePoint(guide.input, version, index, guide[version][index].text, profileRequest)
      update((g) => ({ ...g, [version]: g[version].map((p, i) => (i === index ? { text, confirmed: false } : p)) }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function exportPdf(versions: GuideVersion[], kind: ExportKind) {
    setExportOpen(false)
    setBusy('pdf')
    setError(null)
    try {
      await flush()
      const { exportGuide } = await import('../lib/exportGuide')
      await exportGuide(draft.title.trim() || 'Guida', guide, versions, kind, settings)
      void materialsApi.saveVersion(material.id, 'export').catch(() => undefined)
    } catch (err) {
      console.error(err)
      setError('Non è stato possibile creare il PDF. Riprova.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-cream">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line/70 bg-white px-2 sm:gap-3 sm:px-4">
        <button onClick={onClose} className="flex h-11 shrink-0 items-center gap-1 rounded-full px-2 font-bold text-accent hover:bg-accent-soft sm:pr-4">
          <BackIcon />
          <span className="hidden sm:inline">Fatto</span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            maxLength={200}
            aria-label="Titolo della guida"
            placeholder="Titolo della guida"
            className="sheet-field truncate font-bold leading-tight"
          />
          <span className={`text-xs ${status.state === 'waiting' || status.state === 'error' ? 'font-bold text-[#a2472f]' : 'text-muted'}`} role="status">
            Guida per genitori e scuola · {syncLabel(status)}
            {status.state === 'error' ? `: ${status.message}` : ''}
          </span>
        </div>
        <button
          onClick={() => setExportOpen(true)}
          disabled={busy !== null}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-3 font-bold text-white hover:bg-accent/90 disabled:opacity-60 sm:px-4"
        >
          <DownloadIcon className="h-5 w-5" />
          <span className="hidden sm:inline">{busy === 'pdf' ? 'Preparo il PDF…' : 'Esporta'}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* Dati per la proposta */}
        <aside className="shrink-0 border-b border-line/70 bg-white p-5 lg:w-96 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-5">
            <p className="text-sm leading-relaxed text-muted">
              Descrivi la difficoltà e l’obiettivo: l’AI propone una bozza nei 10 punti, in versione famiglia e scuola. Ogni
              punto resta “Da rivedere” finché non lo confermi.
            </p>
            <InputArea
              label="Difficoltà osservata"
              hint="Cosa si vede fare, quando e quanto spesso."
              value={guide.input.difficulty}
              max={GUIDE_INPUT_MAX.difficulty}
              onChange={(difficulty) => setInput({ difficulty })}
            />
            <InputArea label="Obiettivo" value={guide.input.goal} max={GUIDE_INPUT_MAX.goal} onChange={(goal) => setInput({ goal })} />
            <InputArea
              label="Situazioni in cui succede (facoltativo)"
              value={guide.input.situations}
              max={GUIDE_INPUT_MAX.situations}
              onChange={(situations) => setInput({ situations })}
            />
            <Choice<AgeBand> label="Fascia d’età" value={guide.input.ageBand} options={AGE_BANDS} onChange={(ageBand) => setInput({ ageBand })} />
            <Choice<FamilyLanguage>
              label="Linguaggio per la famiglia"
              value={guide.input.familyLanguage}
              options={FAMILY_LANGUAGES}
              onChange={(familyLanguage) => setInput({ familyLanguage })}
            />

            <details className="rounded-2xl bg-cream p-4 text-sm">
              <summary className="cursor-pointer font-bold">Cosa viene inviato all’AI</summary>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">{requestText}</p>
              <p className="mt-2 text-xs text-muted">
                {usesProfile
                  ? 'Solo questo testo, con le regole fisse della guida: le voci del profilo sono quelle scelte nel flusso guidato. Nessun nome.'
                  : 'Solo questo testo, con le regole fisse della guida. Nessun nome, nessun dato del bambino.'}
              </p>
            </details>

            {problems.length > 0 && (
              <p role="alert" className="rounded-2xl bg-peach-soft p-4 text-sm font-bold text-[#a2472f]">
                Prima di inviare togli {problems.join(', ')}: all’AI non vanno mai dati che identificano un bambino.
              </p>
            )}
            <Button tone="primary" disabled={!ready || problems.length > 0 || busy !== null} onClick={() => void propose()} className="min-h-11">
              {busy === 'proposta' ? 'Preparo la proposta… (fino a un minuto)' : hasText ? 'Proponi di nuovo' : 'Proponi la guida'}
            </Button>
            {error && (
              <p role="alert" className="text-sm font-bold text-[#a2472f]">
                {error}
              </p>
            )}
          </div>
        </aside>

        {/* I 10 punti */}
        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-8">
            <div role="tablist" className="flex rounded-full bg-sand p-1">
              {(Object.keys(GUIDE_VERSIONS) as GuideVersion[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={tab === v}
                  onClick={() => setTab(v)}
                  className={`min-h-11 flex-1 rounded-full px-3 font-bold transition ${tab === v ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'}`}
                >
                  {GUIDE_VERSIONS[v]} · {GUIDE_POINTS.length - unconfirmed(guide, v)}/{GUIDE_POINTS.length}
                </button>
              ))}
            </div>
            {guide[tab].map((point, i) => (
              <PointCard
                key={`${tab}-${i}`}
                index={i}
                text={point.text}
                confirmed={point.confirmed}
                busy={busy === `${tab}-${i}`}
                canRegenerate={ready && problems.length === 0 && busy === null && guide.generatedAt !== null}
                onText={(text) => update((g) => ({ ...g, [tab]: g[tab].map((p, j) => (j === i ? { text, confirmed: false } : p)) }))}
                onConfirm={(confirmed) => update((g) => ({ ...g, [tab]: g[tab].map((p, j) => (j === i ? { ...p, confirmed } : p)) }))}
                onRegenerate={() => void regenerate(tab, i)}
              />
            ))}
          </div>
        </main>
      </div>

      {exportOpen && <ExportDialog guide={guide} busy={busy !== null} onExport={exportPdf} onClose={() => setExportOpen(false)} />}

      {status.state === 'conflict' && (
        <Modal title="Guida modificata altrove" size="sm">
          <div className="flex flex-col gap-4">
            <p className="leading-relaxed">
              Mentre lavoravi, questa guida è stata salvata su un altro dispositivo o da un’altra persona. Quale versione vuoi
              tenere?
            </p>
            <div className="flex flex-col gap-2">
              <Button tone="primary" onClick={() => void resolve('mine')}>
                Tieni la mia
              </Button>
              <Button onClick={() => void resolve('theirs')}>Usa quella salvata</Button>
              <Button
                onClick={async () => {
                  const copy = await resolve('copy')
                  if (copy) onOpen(copy.id)
                }}
              >
                Salva la mia come copia
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function InputArea({ label, hint, value, max, onChange }: { label: string; hint?: string; value: string; max: number; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        rows={3}
        aria-describedby={id}
        className={`${inputClass} resize-y leading-relaxed`}
      />
      <PrivacyNote id={id} />
    </label>
  )
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-full bg-sand p-1">
        {(Object.keys(options) as T[]).map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={`min-h-9 flex-1 rounded-full px-2 text-sm font-bold transition ${value === id ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {options[id]}
          </button>
        ))}
      </div>
    </div>
  )
}

function PointCard({
  index,
  text,
  confirmed,
  busy,
  canRegenerate,
  onText,
  onConfirm,
  onRegenerate,
}: {
  index: number
  text: string
  confirmed: boolean
  busy: boolean
  canRegenerate: boolean
  onText: (text: string) => void
  onConfirm: (confirmed: boolean) => void
  onRegenerate: () => void
}) {
  const written = text.trim() !== ''
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sand text-sm">{index + 1}</span>
          {GUIDE_POINTS[index]}
        </h3>
        {written && <Badge confirmed={confirmed} />}
      </div>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        maxLength={2500}
        rows={Math.min(14, Math.max(3, text.split('\n').length + Math.ceil(text.length / 80)))}
        placeholder={busy ? 'Riscrivo questo punto…' : 'Scrivi qui o chiedi una proposta all’AI'}
        aria-label={`Punto ${index + 1}: ${GUIDE_POINTS[index]}`}
        className={`${inputClass} resize-y leading-relaxed`}
      />
      <div className="flex flex-wrap gap-2">
        {written && !confirmed && (
          <Button tone="soft" small onClick={() => onConfirm(true)}>
            Confermo
          </Button>
        )}
        {confirmed && (
          <Button small onClick={() => onConfirm(false)}>
            Torna da rivedere
          </Button>
        )}
        {canRegenerate && (
          <Button small disabled={busy} onClick={onRegenerate}>
            {busy ? 'Riscrivo…' : 'Rigenera questo punto'}
          </Button>
        )}
      </div>
    </section>
  )
}

function Badge({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <span className="rounded-full bg-[#e3f2e3] px-3 py-1 text-xs font-bold text-[#3f7a41]">Confermato ✓</span>
  ) : (
    <span className="rounded-full bg-[#fdf1d6] px-3 py-1 text-xs font-bold text-[#8a6418]">Da rivedere</span>
  )
}

function ExportDialog({
  guide,
  busy,
  onExport,
  onClose,
}: {
  guide: GuideContent
  busy: boolean
  onExport: (versions: GuideVersion[], kind: ExportKind) => void
  onClose: () => void
}) {
  const [choice, setChoice] = useState<'famiglia' | 'scuola' | 'entrambe'>('famiglia')
  const versions: GuideVersion[] = choice === 'entrambe' ? ['famiglia', 'scuola'] : [choice]
  const missing = versions.map((v) => [v, unconfirmed(guide, v)] as const).filter(([, n]) => n > 0)
  const option = (id: typeof choice, label: ReactNode) => (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${choice === id ? 'border-accent bg-accent-soft' : 'border-line'}`}>
      <input type="radio" checked={choice === id} onChange={() => setChoice(id)} className="accent-[#3f74b8]" />
      <span className="font-bold">{label}</span>
    </label>
  )
  return (
    <Modal title="Esporta la guida" onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <div role="radiogroup" className="flex flex-col gap-2">
          {option('famiglia', GUIDE_VERSIONS.famiglia)}
          {option('scuola', GUIDE_VERSIONS.scuola)}
          {option('entrambe', 'Entrambe')}
        </div>
        {missing.length > 0 ? (
          <p role="alert" className="rounded-2xl bg-butter p-4 text-sm leading-relaxed">
            Il PDF si crea quando tutti i punti sono scritti e confermati. Mancano:{' '}
            <strong>{missing.map(([v, n]) => `${n} ${n === 1 ? 'punto' : 'punti'} nella ${GUIDE_VERSIONS[v].toLowerCase()}`).join(' e ')}</strong>.
          </p>
        ) : (
          <p className="text-sm text-muted">A4 verticale, con logo e nome del centro se impostati.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Annulla</Button>
          <Button tone="soft" disabled={busy || missing.length > 0} onClick={() => onExport(versions, 'whatsapp')}>
            PDF WhatsApp
          </Button>
          <Button tone="primary" disabled={busy || missing.length > 0} onClick={() => onExport(versions, 'stampa')}>
            PDF stampa
          </Button>
        </div>
      </div>
    </Modal>
  )
}
