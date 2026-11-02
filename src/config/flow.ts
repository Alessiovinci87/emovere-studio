// Flusso guidato "Nuovo materiale" (piano, Fase 1 punto 2): parametri, voci del profilo inviate all'AI e
// proposta di una sequenza. Condiviso tra app e funzione /api/guide: l'anteprima nell'app e il testo inviato
// dal server si compongono con le stesse funzioni, così all'AI va solo quello che si è visto.
import type { AgeBand } from './guide.js'
import { OTHER_NOTES_SECTION, PROFILE_SECTIONS, type ProfileSection, type ProfileSource } from './profile.js'

export type Comprehension = 'immagini' | 'frasi_brevi' | 'frasi_complete'
export type FlowContext = 'casa' | 'scuola' | 'centro' | 'fuori'
export type SequenceLength = 4 | 6 | 9 | 12
export type FlowCharacter = 'bambina' | 'bambino'

export const COMPREHENSIONS: Record<Comprehension, { label: string; hint: string; request: string }> = {
  immagini: { label: 'Solo immagini', hint: 'Comprende soprattutto le immagini', request: 'soprattutto immagini: frasi di 2-4 parole' },
  frasi_brevi: { label: 'Frasi brevi', hint: 'Comprende frasi semplici', request: 'frasi brevi, al massimo 6 parole' },
  frasi_complete: { label: 'Frasi complete', hint: 'Comprende frasi più lunghe', request: 'frasi complete, al massimo 12 parole' },
}

export const FLOW_CONTEXTS: Record<FlowContext, { label: string; request: string }> = {
  casa: { label: 'Casa', request: 'a casa' },
  scuola: { label: 'Scuola', request: 'a scuola' },
  centro: { label: 'Centro / studio', request: 'al centro o in studio' },
  fuori: { label: 'Fuori casa', request: 'fuori casa (negozi, parco, visite)' },
}

export const SEQUENCE_LENGTHS: SequenceLength[] = [4, 6, 9, 12]

/** Sequenza (routine a passaggi) o storia sociale (scene con frasi descrittive, prospettiche e di guida) */
export type FlowKind = 'sequenza' | 'storia'

/** Storia sociale: 4 o 6 scene */
export const STORY_LENGTHS: SequenceLength[] = [4, 6]

/** Limiti dei testi scritti nel flusso */
export const FLOW_MAX = { goal: 600, situation: 1500 }

/** Una voce del profilo scelta per la richiesta: solo testo, sezione e provenienza (mai id o date) */
export interface ProfileLine {
  section: ProfileSection
  source: ProfileSource
  text: string
}

const SOURCE_REQUEST: Record<ProfileSource, string> = {
  osservato: 'osservato',
  genitori: 'riferito dai genitori',
  scuola: 'riferito dalla scuola',
  ipotesi: 'ipotesi da verificare',
}

const SECTION_ORDER = [...PROFILE_SECTIONS, OTHER_NOTES_SECTION]

/** Voci nell'ordine delle sezioni del profilo (lo stesso nell'app e sul server) */
export function sortProfileLines<T extends ProfileLine>(lines: T[]): T[] {
  const rank = (s: ProfileSection) => SECTION_ORDER.findIndex((x) => x.id === s)
  return [...lines].sort((a, b) => rank(a.section) - rank(b.section))
}

/** Blocco del profilo nel testo della richiesta (vuoto se non ci sono voci scelte) */
export function profileRequestText(lines: ProfileLine[]): string {
  if (lines.length === 0) return ''
  const label = (s: ProfileSection) => SECTION_ORDER.find((x) => x.id === s)?.label ?? s
  return [
    'Dal profilo del bambino (voci scelte dall’educatrice):',
    ...sortProfileLines(lines).map((l) => `- ${label(l.section)} (${SOURCE_REQUEST[l.source]}): ${oneLine(l.text)}`),
  ].join('\n')
}

/** Nomi dei campi del profilo per il registro ai_requests (mai il contenuto) */
export function profileFields(lines: ProfileLine[]): string[] {
  return [...new Set(sortProfileLines(lines).map((l) => `profilo:${l.section}`))]
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// ——— Sequenza ———

/** Cosa si chiede all'AI per una sequenza (le voci del profilo le aggiunge il server dagli id) */
export interface SequenceInput {
  goal: string
  situation: string
  ageBand: AgeBand
  comprehension: Comprehension
  steps: SequenceLength
  context: FlowContext
  character: FlowCharacter
  /** Assente = sequenza (richieste precedenti) */
  kind?: FlowKind
}

export function isSequenceInput(value: unknown): value is SequenceInput {
  const v = value as Partial<SequenceInput> | null
  return (
    !!v &&
    typeof v.goal === 'string' &&
    typeof v.situation === 'string' &&
    (v.ageBand === '3-5' || v.ageBand === '6-8') &&
    typeof v.comprehension === 'string' &&
    v.comprehension in COMPREHENSIONS &&
    SEQUENCE_LENGTHS.includes(v.steps as SequenceLength) &&
    typeof v.context === 'string' &&
    v.context in FLOW_CONTEXTS &&
    (v.character === 'bambina' || v.character === 'bambino') &&
    (v.kind === undefined || v.kind === 'sequenza' || (v.kind === 'storia' && STORY_LENGTHS.includes(v.steps as SequenceLength)))
  )
}

/** Testo esattamente come viene inviato all'AI (anteprima nell'app = contenuto della richiesta) */
export function sequenceRequestText(input: SequenceInput, profile: ProfileLine[] = []): string {
  const story = input.kind === 'storia'
  return [
    story ? 'Tipo di materiale: storia sociale' : '',
    `Obiettivo: ${oneLine(input.goal)}`,
    `Situazione: ${input.situation.trim()}`,
    `Contesto: ${FLOW_CONTEXTS[input.context].request}`,
    `Fascia d'età: ${input.ageBand} anni`,
    `Comprensione: ${COMPREHENSIONS[input.comprehension].request}`,
    story ? `Numero di scene: ${input.steps}` : `Numero di passaggi: ${input.steps}`,
    `Personaggio delle immagini: ${input.character} (frasi al ${input.character === 'bambina' ? 'femminile' : 'maschile'})`,
    profileRequestText(profile),
  ]
    .filter(Boolean)
    .join('\n')
}

/** Nomi dei campi inviati, per il registro */
export function sequenceFields(profile: ProfileLine[], kind: FlowKind = 'sequenza'): string[] {
  return [
    ...(kind === 'storia' ? ['tipo'] : []),
    'obiettivo',
    'situazione',
    'contesto',
    'fascia_eta',
    'comprensione',
    kind === 'storia' ? 'scene' : 'passaggi',
    'personaggio',
    ...profileFields(profile),
  ]
}

/** Proposta dell'AI: titolo e un passaggio per riquadro (vignetta del catalogo o null) */
export interface SequenceProposal {
  title: string
  steps: { text: string; code: string | null }[]
}

/** Istruzioni fisse; `catalog` = una riga per vignetta disponibile ("A01: Mi sveglio (mattina, letto)") */
export function sequenceInstructions(catalog: string[]): string {
  return `Sei un assistente per un'Educatrice Professionale Socio-Sanitaria che lavora con bambini di 3-8 anni (autismo, ADHD, disturbo oppositivo-provocatorio). Prepari la BOZZA di una sequenza visiva (routine illustrata a passaggi numerati) che lei rivedrà prima di stamparla.

Ricevi obiettivo, situazione, contesto, fascia d'età, livello di comprensione, numero di passaggi, personaggio ed eventuali voci del profilo del bambino.
Restituisci:
- titolo: breve, in prima persona, al massimo 6 parole (es. "La mia mattina", "Mi lavo le mani").
- passaggi: esattamente il numero di passaggi richiesto, in ordine. Ogni passaggio ha:
  - frase: in prima persona, al presente, al femminile o al maschile secondo il personaggio, lunga quanto indicato dalla comprensione, senza punto finale. Un'azione concreta e osservabile per passaggio.
  - vignetta: il codice della vignetta dell'elenco che rappresenta bene QUELL'azione, oppure "" se nessuna è adatta. Non usare una vignetta solo vagamente simile: meglio "".

Regole fisse:
- Linguaggio positivo: cosa fare, non cosa evitare. Nessuna minaccia, punizione o privazione.
- Nessuna diagnosi, nessun riferimento clinico, nessun nome di persona o luogo preciso.
- Le voci del profilo marcate come ipotesi sono solo possibilità: non trattarle come fatti.
- Usa gli interessi e i rinforzatori del profilo, se ci sono, solo quando aiutano davvero (es. l'ultimo passaggio).

Vignette disponibili (codice: titolo, parole chiave):
${catalog.join('\n')}`
}

// ——— Storia sociale ———

/** Istruzioni fisse della storia sociale (stessa forma di risposta della sequenza: titolo e una frase per scena) */
export function storyInstructions(catalog: string[]): string {
  return `Sei un assistente per un'Educatrice Professionale Socio-Sanitaria che lavora con bambini di 3-8 anni (autismo, ADHD, disturbo oppositivo-provocatorio). Prepari la BOZZA di una storia sociale illustrata che lei rivedrà prima di usarla.

Ricevi obiettivo, situazione, contesto, fascia d'età, livello di comprensione, numero di scene, personaggio ed eventuali voci del profilo del bambino.
Restituisci:
- titolo: breve, in prima persona, al massimo 6 parole (es. "Quando aspetto il mio turno").
- passaggi: esattamente il numero di scene richiesto, in ordine. Ogni scena ha:
  - frase: 1 o 2 frasi in prima persona, al presente, al femminile o al maschile secondo il personaggio. Con comprensione "soprattutto immagini" al massimo 6 parole; "frasi brevi" al massimo 12 parole; "frasi complete" al massimo 25 parole.
  - vignetta: il codice della vignetta dell'elenco che rappresenta bene QUELLA scena, oppure "" se nessuna è adatta. Non usare una vignetta solo vagamente simile: meglio "".

Struttura della storia (secondo il modello delle storie sociali):
- Prima scena: descrive la situazione (dove, quando, chi c'è) in modo neutro.
- Scene centrali: frasi descrittive e prospettiche (cosa succede, cosa possono pensare o provare gli altri, sempre come possibilità: "a volte", "forse", "può succedere"), poi frasi di guida su cosa posso provare a fare ("Posso…", "Provo a…"), mai "devo".
- Almeno due frasi descrittive o prospettiche per ogni frase di guida.
- Ultima scena: chiusura positiva e rassicurante (come mi sento dopo, chi è contento con me).

Regole fisse:
- Linguaggio positivo e rassicurante: cosa fare, non cosa evitare. Nessuna minaccia, punizione, privazione o giudizio sul bambino.
- Le emozioni sono sempre possibilità, mai certezze.
- Nessuna diagnosi, nessun riferimento clinico, nessun nome di persona o luogo preciso.
- Le voci del profilo marcate come ipotesi sono solo possibilità: non trattarle come fatti.
- Usa interessi e rinforzatori del profilo solo quando aiutano davvero.

Vignette disponibili (codice: titolo, parole chiave):
${catalog.join('\n')}`
}
