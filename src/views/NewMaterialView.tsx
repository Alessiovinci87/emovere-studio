import { useEffect, useId, useRef, useState } from 'react'
import { SourceChip, ErrorText } from '../components/child/ProfileTab'
import { CharacterToggle } from '../components/CharacterToggle'
import { SequenceProposalEditor } from '../components/flow/SequenceProposal'
import { BackIcon } from '../components/Icons'
import { Button, PrivacyNote, inputClass } from '../components/ui'
import {
  COMPREHENSIONS,
  FLOW_CONTEXTS,
  FLOW_MAX,
  SEQUENCE_LENGTHS,
  sequenceRequestText,
  type Comprehension,
  type FlowContext,
  type SequenceInput,
  type SequenceLength,
  type SequenceProposal,
} from '../config/flow'
import { AGE_BANDS, FAMILY_LANGUAGES, guideRequestText, identifyingProblems, type AgeBand, type FamilyLanguage, type GuideInput } from '../config/guide'
import { GOAL_AREAS, OTHER_NOTES_SECTION, PROFILE_SECTIONS, goalStatusInfo, type GoalArea } from '../config/profile'
import { childApi, type ChildDetail } from '../lib/childApi'
import { ageBandFor, chosenProfileLines, flowApi, sheetFromProposal } from '../lib/flow'
import { emptyGuide, guideApi, type GuideContent } from '../lib/guide'
import { materialsApi } from '../lib/materials'
import type { Character, Folder, Scene, Sheet } from '../types'

// Flusso guidato "Nuovo materiale" (piano, Fase 1 punto 2): per chi → obiettivo → situazione → tipo →
// parametri → dati del profilo con anteprima di cosa va all'AI → proposta. Oggi porta alle sequenze (scheda
// Routine) e alla guida per genitori e scuola. Lo stato resta solo in memoria: niente dati del bambino nel browser.
// Il materiale creato si collega da solo all'obiettivo scelto (un obiettivo nuovo si crea solo alla fine).

type StepId = 'chi' | 'obiettivo' | 'situazione' | 'tipo' | 'parametri' | 'profilo' | 'proposta'
type Kind = 'sequenza' | 'guida'
type GoalChoice = { mode: 'existing'; id: string } | { mode: 'new' }

interface Props {
  folders: Folder[]
  initialChildId?: string
  initialGoalId?: string
  /** Nomi da non inviare mai all'AI (cartelle e nomi sulle schede) */
  names: string[]
  uppercaseDefault: boolean
  whenFolderSaved: (id: string, signal?: AbortSignal) => Promise<void>
  onClose: () => void
  /** "Parti da un modello vuoto": la sezione Crea (con la cartella del bambino, se c'è) */
  onBlank: (childId: string | null) => void
  /** Crea la scheda (make riceve il nome sulle schede del bambino) e la collega all'obiettivo dopo il salvataggio */
  onCreateSheet: (make: (childName: string) => Sheet, childId: string | null, goalId: string | null) => void
  /** Guida creata; `warning` se non è stato possibile collegarla all'obiettivo */
  onOpenGuide: (id: string, warning?: string) => void
  onAiScene: (scene: Scene) => void
}

const KINDS: { id: Kind | 'storia' | 'scenario'; label: string; description: string; soon?: boolean }[] = [
  { id: 'sequenza', label: 'Sequenza o routine', description: 'Passaggi illustrati e numerati, da appendere o da riordinare.' },
  { id: 'guida', label: 'Guida per genitori e scuola', description: 'Bozza in 10 punti, versione famiglia e versione scuola.' },
  { id: 'storia', label: 'Storia sociale', description: 'Una situazione raccontata in prima persona, scena per scena.', soon: true },
  { id: 'scenario', label: 'Scenario comportamentale', description: 'Comportamento, alternativa e conseguenze, a confronto.', soon: true },
]

export function NewMaterialView(props: Props) {
  const { folders, initialChildId, initialGoalId, names, onClose } = props
  const [childId, setChildId] = useState<string | null | undefined>(
    initialChildId && folders.some((f) => f.id === initialChildId) ? initialChildId : undefined,
  )
  const [detail, setDetail] = useState<ChildDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [goal, setGoal] = useState<GoalChoice | null>(initialGoalId ? { mode: 'existing', id: initialGoalId } : null)
  const [newGoal, setNewGoal] = useState<{ title: string; area: GoalArea | null }>({ title: '', area: null })
  /** Materiale generico: obiettivo solo per la proposta, non si salva */
  const [freeGoal, setFreeGoal] = useState('')
  const [situation, setSituation] = useState('')
  const [kind, setKind] = useState<Kind | null>(null)
  const [ageBand, setAgeBand] = useState<AgeBand>('3-5')
  const [ageFromBirth, setAgeFromBirth] = useState(false)
  const [comprehension, setComprehension] = useState<Comprehension>('frasi_brevi')
  const [steps, setSteps] = useState<SequenceLength>(6)
  const [character, setCharacter] = useState<Character>('bambina')
  const [familyLanguage, setFamilyLanguage] = useState<FamilyLanguage>('semplice')
  const [context, setContext] = useState<FlowContext>('casa')
  const [profileIds, setProfileIds] = useState<ReadonlySet<string>>(() => new Set())
  const [proposal, setProposal] = useState<SequenceProposal | null>(null)
  /** Testo della richiesta da cui viene la proposta attuale */
  const proposedFor = useRef<string | null>(null)
  const [busy, setBusy] = useState<'proposta' | 'crea' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<StepId>(childId === undefined ? 'chi' : initialGoalId ? 'situazione' : 'obiettivo')
  const folder = folders.find((f) => f.id === childId)

  // Dettaglio del bambino (obiettivi, profilo, anno di nascita); un bambino appena creato si aspetta sul server
  useEffect(() => {
    setDetail(null)
    setDetailError(null)
    if (!childId) return
    const controller = new AbortController()
    props
      .whenFolderSaved(childId, controller.signal)
      .then(() => childApi.detail(childId))
      .then((d) => {
        if (controller.signal.aborted) return
        setDetail(d)
        const band = ageBandFor(d.child.birthYear)
        setAgeBand(band ?? '3-5')
        setAgeFromBirth(band !== null)
        setGoal((g) => {
          if (g?.mode === 'existing' && d.goals.some((x) => x.id === g.id)) return g
          return d.goals.some((x) => x.status === 'attivo') ? null : { mode: 'new' }
        })
        // Obiettivo dell'URL che non esiste più: si torna a sceglierlo
        if (initialGoalId && !d.goals.some((x) => x.id === initialGoalId)) setStep((s) => (s === 'situazione' ? 'obiettivo' : s))
      })
      .catch((err: Error) => !controller.signal.aborted && err.name !== 'AbortError' && setDetailError(err.message))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, reloadKey])

  const goalTitle =
    childId === null
      ? freeGoal.trim()
      : goal?.mode === 'existing'
        ? (detail?.goals.find((g) => g.id === goal.id)?.title ?? '')
        : goal?.mode === 'new'
          ? newGoal.title.trim()
          : ''
  const lines = detail ? chosenProfileLines(detail.profile, profileIds) : []
  const sequenceInput: SequenceInput = { goal: goalTitle, situation, ageBand, comprehension, steps, context, character }
  const guideInput: GuideInput = { difficulty: situation.trim(), goal: goalTitle, situations: FLOW_CONTEXTS[context].request, ageBand, familyLanguage }
  const requestText = kind === 'guida' ? guideRequestText(guideInput, lines) : sequenceRequestText(sequenceInput, lines)
  const problems = identifyingProblems(requestText, names)
  const situationProblems = identifyingProblems(`${goalTitle}\n${situation}`, names)
  const profileRequest = childId ? { childId, profileIds: [...profileIds].filter((id) => detail?.profile.some((e) => e.id === id && !e.archivedAt)) } : undefined

  const order: StepId[] = ['chi', 'obiettivo', 'situazione', 'tipo', 'parametri', 'profilo', 'proposta']
  const valid: Record<StepId, boolean> = {
    chi: childId !== undefined,
    obiettivo: childId !== undefined && goalTitle.length >= 3 && (childId === null || detail !== null),
    situazione: situation.trim().length >= 10 && situationProblems.length === 0,
    tipo: kind !== null,
    parametri: true,
    profilo: problems.length === 0,
    proposta: true,
  }
  const index = order.indexOf(step)
  /** Un passo si apre se tutti i precedenti sono completi */
  const reachable = (id: StepId) => order.slice(0, order.indexOf(id)).every((s) => valid[s])
  const stepLabel = (id: StepId) =>
    ({
      chi: 'Per chi',
      obiettivo: 'Obiettivo',
      situazione: 'Situazione',
      tipo: 'Tipo',
      parametri: 'Parametri',
      profilo: childId === null ? 'Anteprima' : 'Dati del profilo',
      proposta: 'Proposta',
    })[id]

  function close() {
    const typed = situation.trim() || freeGoal.trim() || newGoal.title.trim() || proposal
    if (typed && !confirm('Uscire dal flusso? Quello che hai scritto qui non viene salvato.')) return
    onClose()
  }

  async function propose() {
    setStep('proposta')
    if (kind === 'sequenza' && proposal && proposedFor.current === requestText) return
    if (kind === 'sequenza' && proposal && !confirm('Hai cambiato i dati: preparo una proposta nuova al posto di quella attuale?')) return
    setBusy('proposta')
    setError(null)
    try {
      if (kind === 'sequenza') {
        setProposal(await flowApi.proposeSequence(sequenceInput, profileRequest))
        proposedFor.current = requestText
      } else {
        await createGuide()
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  /** Obiettivo del materiale: quello scelto o quello nuovo, creato solo adesso */
  async function goalId(): Promise<string | null> {
    if (!childId || !goal) return null
    if (goal.mode === 'existing') return goal.id
    const created = await childApi.addGoal({ childId, title: newGoal.title.trim(), area: newGoal.area ?? undefined })
    setGoal({ mode: 'existing', id: created.id })
    setDetail((d) => (d ? { ...d, goals: [...d.goals, created] } : d))
    return created.id
  }

  /** Guida: proposta dell'AI, poi materiale del bambino (o generico) già compilato, collegato all'obiettivo */
  async function createGuide() {
    const result = await guideApi.propose(guideInput, profileRequest)
    const linkTo = await goalId()
    const content: GuideContent = {
      ...emptyGuide(),
      input: guideInput,
      famiglia: result.family.map((text) => ({ text, confirmed: false })),
      scuola: result.school.map((text) => ({ text, confirmed: false })),
      generatedAt: new Date().toISOString(),
      profileIds: profileRequest?.profileIds ?? [],
    }
    const { material } = await materialsApi.create({
      childId: childId ?? null,
      kind: 'guida',
      title: `Guida: ${goalTitle}`.slice(0, 120),
      content: content as unknown as Record<string, unknown>,
    })
    let warning: string | undefined
    if (linkTo) {
      try {
        await childApi.setGoals(material.id, [linkTo])
      } catch (err) {
        warning = `Guida creata, ma non collegata all’obiettivo: ${(err as Error).message}`
      }
    }
    props.onOpenGuide(material.id, warning)
  }

  async function createSequence() {
    if (!proposal) return
    setBusy('crea')
    setError(null)
    try {
      const linkTo = await goalId()
      const input = sequenceInput
      props.onCreateSheet((childName) => sheetFromProposal(proposal, input, childName, props.uppercaseDefault), childId ?? null, linkTo)
    } catch (err) {
      setError((err as Error).message)
      setBusy(null)
    }
  }

  const next = () => {
    if (step === 'profilo') void propose()
    else setStep(order[index + 1])
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-cream">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line/70 bg-white px-2 sm:gap-3 sm:px-4">
        <button onClick={close} className="flex h-11 shrink-0 items-center gap-1 rounded-full px-2 font-bold text-accent hover:bg-accent-soft sm:pr-4">
          <BackIcon />
          <span className="hidden sm:inline">Esci</span>
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate font-bold leading-tight">Nuovo materiale</h1>
          <span className="truncate text-xs text-muted">
            {childId === null ? 'Materiale generico' : folder ? `Per ${folder.name}` : 'Scegli per chi'}
            {goalTitle && index > 1 ? ` · ${goalTitle}` : ''}
          </span>
        </div>
      </header>

      <nav aria-label="Passi" className="shrink-0 border-b border-line/70 bg-white/60 px-3 py-2">
        <p className="text-center text-sm font-bold sm:hidden">
          Passo {index + 1} di {order.length} · {stepLabel(step)}
        </p>
        <ol className="mx-auto hidden max-w-5xl flex-wrap justify-center gap-1 sm:flex">
          {order.map((id, i) => {
            const open = reachable(id) && (id !== 'proposta' || proposal !== null || step === 'proposta')
            return (
              <li key={id}>
                <button
                  disabled={!open || busy !== null}
                  onClick={() => setStep(id)}
                  aria-current={step === id ? 'step' : undefined}
                  className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition disabled:cursor-not-allowed ${
                    step === id ? 'bg-accent text-white' : open ? 'text-ink hover:bg-accent-soft' : 'text-muted/60'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${step === id ? 'bg-white/25' : 'bg-sand'}`}>{i + 1}</span>
                  {stepLabel(id)}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pb-10 sm:p-8">
          {step === 'chi' && (
            <StepIntro title="Per chi è il materiale?" text="Con un bambino puoi usare i suoi obiettivi e le voci del suo profilo." />
          )}
          {step === 'chi' && (
            <div role="radiogroup" aria-label="Per chi" className="grid gap-3 sm:grid-cols-2">
              {[...folders]
                .sort((a, b) => a.name.localeCompare(b.name, 'it'))
                .map((f) => (
                  <OptionCard key={f.id} selected={childId === f.id} onSelect={() => choose(f.id)} title={f.name} text={f.code ?? ''} />
                ))}
              <OptionCard
                selected={childId === null}
                onSelect={() => choose(null)}
                title="Materiale generico"
                text="Senza bambino: si può usare con più bambini. Nessun dato del profilo."
              />
            </div>
          )}

          {step === 'obiettivo' && (
            <>
              <StepIntro
                title="Qual è l’obiettivo?"
                text={
                  childId === null
                    ? 'Scrivi l’obiettivo del materiale: serve solo alla proposta, non viene salvato.'
                    : 'Scegli uno degli obiettivi attivi o creane uno nuovo: il materiale si collega da solo e il collegamento resta nello storico.'
                }
              />
              {childId === null ? (
                <TextArea label="Obiettivo" value={freeGoal} max={FLOW_MAX.goal} rows={2} placeholder="Es. Lavarsi le mani da solo prima di pranzo" onChange={setFreeGoal} />
              ) : detailError ? (
                <div className="flex flex-col items-start gap-3 rounded-3xl bg-white p-5 shadow-sm">
                  <ErrorText>{detailError}</ErrorText>
                  <Button tone="primary" onClick={() => setReloadKey((k) => k + 1)}>
                    Riprova
                  </Button>
                </div>
              ) : !detail ? (
                <p className="text-muted">Carico gli obiettivi…</p>
              ) : (
                <div role="radiogroup" aria-label="Obiettivo" className="flex flex-col gap-3">
                  {detail.goals
                    .filter((g) => g.status === 'attivo' || (goal?.mode === 'existing' && goal.id === g.id))
                    .map((g) => (
                      <OptionCard
                        key={g.id}
                        selected={goal?.mode === 'existing' && goal.id === g.id}
                        onSelect={() => setGoal({ mode: 'existing', id: g.id })}
                        title={g.title}
                        text={[GOAL_AREAS.find((a) => a.id === g.area)?.label, g.status !== 'attivo' ? goalStatusInfo(g.status).label : null].filter(Boolean).join(' · ')}
                      />
                    ))}
                  <OptionCard selected={goal?.mode === 'new'} onSelect={() => setGoal({ mode: 'new' })} title="+ Nuovo obiettivo" text="Si crea quando crei il materiale." />
                  {goal?.mode === 'new' && (
                    <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
                      <TextArea
                        label="Titolo dell’obiettivo"
                        value={newGoal.title}
                        max={200}
                        rows={2}
                        placeholder="Es. Aspettare il proprio turno nel gioco"
                        onChange={(title) => setNewGoal((g) => ({ ...g, title }))}
                      />
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold">Area (facoltativa)</span>
                        <select
                          value={newGoal.area ?? ''}
                          onChange={(e) => setNewGoal((g) => ({ ...g, area: (e.target.value || null) as GoalArea | null }))}
                          className={inputClass}
                        >
                          <option value="">—</option>
                          {GOAL_AREAS.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 'situazione' && (
            <>
              <StepIntro title="Qual è la situazione?" text="Descrivi a parole cosa succede: quando, dove, con chi, cosa fa il bambino e cosa fanno gli adulti." />
              <TextArea
                label="Situazione"
                value={situation}
                max={FLOW_MAX.situation}
                rows={6}
                placeholder="Es. Prima di pranzo va in bagno ma si ferma a giocare con l’acqua e non si asciuga le mani."
                onChange={setSituation}
              />
              {situationProblems.length > 0 && <ProblemsAlert problems={situationProblems} />}
            </>
          )}

          {step === 'tipo' && (
            <>
              <StepIntro title="Che materiale prepariamo?" text="Storie sociali e scenari arriveranno presto." />
              <div role="radiogroup" aria-label="Tipo di materiale" className="grid gap-3 sm:grid-cols-2">
                {KINDS.map((k) => (
                  <OptionCard
                    key={k.id}
                    selected={kind === k.id}
                    disabled={k.soon}
                    badge={k.soon ? 'In arrivo' : undefined}
                    onSelect={() => setKind(k.id as Kind)}
                    title={k.label}
                    text={k.description}
                  />
                ))}
              </div>
              <button onClick={() => props.onBlank(childId ?? null)} className="self-start text-sm font-bold text-accent underline">
                Oppure parti da un modello vuoto o da una scheda pronta
              </button>
            </>
          )}

          {step === 'parametri' && (
            <>
              <StepIntro title="Parametri" text={kind === 'guida' ? 'La guida è per gli adulti: famiglia e scuola.' : 'Come deve essere la sequenza.'} />
              <div className="flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm">
                <Choice label="Fascia d’età" value={ageBand} options={AGE_BANDS} onChange={(v) => setAgeBand(v)} />
                {ageFromBirth && <p className="-mt-3 text-xs text-muted">Proposta dall’anno di nascita nel profilo.</p>}
                {kind === 'sequenza' && (
                  <>
                    <Choice
                      label="Livello di comprensione"
                      value={comprehension}
                      options={Object.fromEntries(Object.entries(COMPREHENSIONS).map(([id, c]) => [id, c.label])) as Record<Comprehension, string>}
                      onChange={setComprehension}
                    />
                    <p className="-mt-3 text-xs text-muted">
                      {COMPREHENSIONS[comprehension].hint}
                      {comprehension === 'immagini' ? ': la scheda mostrerà solo le vignette (le frasi restano salvate).' : '.'}
                    </p>
                    <Choice
                      label="Lunghezza"
                      value={String(steps)}
                      options={Object.fromEntries(SEQUENCE_LENGTHS.map((n) => [String(n), `${n} passaggi`]))}
                      onChange={(v) => setSteps(Number(v) as SequenceLength)}
                    />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold">Personaggio</span>
                      <CharacterToggle value={character} onChange={setCharacter} />
                    </div>
                  </>
                )}
                {kind === 'guida' && <Choice label="Linguaggio per la famiglia" value={familyLanguage} options={FAMILY_LANGUAGES} onChange={setFamilyLanguage} />}
                <Choice
                  label="Contesto"
                  value={context}
                  options={Object.fromEntries(Object.entries(FLOW_CONTEXTS).map(([id, c]) => [id, c.label])) as Record<FlowContext, string>}
                  onChange={setContext}
                />
              </div>
            </>
          )}

          {step === 'profilo' && (
            <>
              <StepIntro
                title={childId === null ? 'Cosa va all’AI' : 'Quali dati del profilo usare?'}
                text={
                  childId === null
                    ? 'Controlla il testo che verrà inviato per la proposta.'
                    : 'Scegli le voci che aiutano questa proposta. Nessuna è scelta in partenza: all’AI va solo quello che spunti.'
                }
              />
              {childId !== null && detail && (
                <ProfilePicker detail={detail} selected={profileIds} onChange={setProfileIds} />
              )}
              <section className="flex flex-col gap-2 rounded-3xl bg-white p-5 shadow-sm">
                <h3 className="font-bold">Cosa viene inviato all’AI</h3>
                <p className="whitespace-pre-wrap rounded-2xl bg-cream p-4 text-sm leading-relaxed">{requestText}</p>
                <p className="text-xs text-muted">
                  Solo questo testo, con le regole fisse{kind === 'sequenza' ? ' e l’elenco delle vignette della libreria' : ' della guida'}. Nessun nome, nessun
                  dato identificativo.
                </p>
              </section>
              {problems.length > 0 && <ProblemsAlert problems={problems} />}
            </>
          )}

          {step === 'proposta' && (
            <>
              {busy === 'proposta' && (
                <p role="status" className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-accent">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  {kind === 'guida' ? 'Preparo la guida: 10 punti per la famiglia e 10 per la scuola, fino a un minuto…' : 'Preparo la proposta…'}
                </p>
              )}
              {error && (
                <div className="flex flex-col items-start gap-3 rounded-3xl bg-white p-5 shadow-sm">
                  <ErrorText>{error}</ErrorText>
                  {busy === null && (kind === 'guida' || !proposal) && (
                    <Button tone="primary" onClick={() => void propose()}>
                      Riprova
                    </Button>
                  )}
                </div>
              )}
              {kind === 'sequenza' && proposal && (
                <>
                  <StepIntro title="La proposta" text="Una bozza: correggi frasi, ordine e vignette. Poi “Crea e apri” prepara la scheda." />
                  <SequenceProposalEditor proposal={proposal} character={character} onChange={setProposal} onAiScene={props.onAiScene} />
                </>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line/70 bg-white px-4 py-3">
        <Button disabled={index === 0 || busy !== null} onClick={() => setStep(order[index - 1])}>
          Indietro
        </Button>
        {step === 'proposta' ? (
          kind === 'sequenza' && proposal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={busy !== null}
                onClick={() => {
                  if (!confirm('Preparo una proposta nuova al posto di questa?')) return
                  setProposal(null)
                  proposedFor.current = null
                  setBusy('proposta')
                  setError(null)
                  flowApi
                    .proposeSequence(sequenceInput, profileRequest)
                    .then((p) => {
                      setProposal(p)
                      proposedFor.current = requestText
                    })
                    .catch((err: Error) => setError(err.message))
                    .finally(() => setBusy(null))
                }}
              >
                Rigenera
              </Button>
              <Button tone="primary" disabled={busy !== null} onClick={() => void createSequence()}>
                {busy === 'crea' ? 'Creo…' : 'Crea e apri'}
              </Button>
            </div>
          ) : null
        ) : (
          <Button tone="primary" disabled={!valid[step] || busy !== null} onClick={next}>
            {step === 'profilo' ? (kind === 'guida' ? 'Prepara la guida' : 'Chiedi la proposta') : 'Avanti'}
          </Button>
        )}
      </footer>
    </div>
  )

  function choose(id: string | null) {
    if (id === childId) return
    setChildId(id)
    setGoal(null)
    setProfileIds(new Set())
    setAgeFromBirth(false)
  }
}

function StepIntro({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
    </div>
  )
}

function OptionCard({
  selected,
  disabled,
  badge,
  onSelect,
  title,
  text,
}: {
  selected: boolean
  disabled?: boolean
  badge?: string
  onSelect: () => void
  title: string
  text: string
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex min-h-16 flex-col items-start gap-1 rounded-3xl border-2 bg-white p-4 text-left shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? 'border-accent' : 'border-transparent hover:border-line'
      }`}
    >
      <span className="flex w-full items-center justify-between gap-2 font-bold">
        {title}
        {badge && <span className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-xs text-muted">{badge}</span>}
      </span>
      {text && <span className="text-sm text-muted">{text}</span>}
    </button>
  )
}

function TextArea({
  label,
  value,
  max,
  rows,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  max: number
  rows: number
  placeholder?: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
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
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-3xl bg-sand p-1">
        {(Object.keys(options) as T[]).map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={`min-h-9 flex-1 whitespace-nowrap rounded-full px-3 text-sm font-bold transition ${value === id ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {options[id]}
          </button>
        ))}
      </div>
    </div>
  )
}

function ProblemsAlert({ problems }: { problems: string[] }) {
  return (
    <p role="alert" className="rounded-2xl bg-peach-soft p-4 text-sm font-bold text-[#a2472f]">
      Prima di inviare togli {problems.join(', ')}: all’AI non vanno mai dati che identificano un bambino.
    </p>
  )
}

/** Voci attive del profilo per sezione, con la provenienza; le ipotesi restano distinte */
function ProfilePicker({ detail, selected, onChange }: { detail: ChildDetail; selected: ReadonlySet<string>; onChange: (ids: ReadonlySet<string>) => void }) {
  const active = detail.profile.filter((e) => !e.archivedAt)
  if (active.length === 0) {
    return (
      <p className="rounded-3xl bg-sand/60 px-5 py-6 text-center text-sm text-muted">
        Il profilo è vuoto: la proposta userà solo obiettivo, situazione e parametri.
      </p>
    )
  }
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button small onClick={() => onChange(new Set(active.map((e) => e.id)))}>
          Scegli tutte
        </Button>
        <Button small onClick={() => onChange(new Set())}>
          Nessuna
        </Button>
        <span className="self-center text-sm text-muted">
          {selected.size} di {active.length} scelte
        </span>
      </div>
      {[...PROFILE_SECTIONS, OTHER_NOTES_SECTION].map((section) => {
        const entries = active.filter((e) => e.section === section.id)
        if (entries.length === 0) return null
        return (
          <section key={section.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold">{section.label}</h3>
            <ul className="flex flex-col gap-2">
              {entries.map((e) => {
                const hypothesis = e.source === 'ipotesi'
                return (
                  <li key={e.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border bg-white px-4 py-3 ${hypothesis ? 'border-dashed' : 'border-line'}`}
                      style={hypothesis ? { borderColor: '#7a5aa8' } : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={(ev) => toggle(e.id, ev.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#3f74b8]"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className={`whitespace-pre-wrap leading-snug ${hypothesis ? 'italic' : ''}`}>{e.text}</span>
                        <SourceChip source={e.source} />
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

