// Guida per genitori e scuola (specifica di Martina, sezione 10), condivisa tra app e funzione /api/guide.
// I 10 punti e le regole del testo sono fissi: il prompt lo compone solo il server, con queste regole.

import { profileRequestText, type ProfileLine } from './flow.js'

export type GuideVersion = 'famiglia' | 'scuola'
export type AgeBand = '3-5' | '6-8'
export type FamilyLanguage = 'semplice' | 'articolato'

/** I 10 punti, nell'ordine della specifica */
export const GUIDE_POINTS = [
  'Obiettivo di lavoro',
  'Descrizione osservabile della difficoltà',
  'Situazioni in cui si presenta',
  'Possibili antecedenti e ipotesi funzionali, da verificare',
  'Competenze alternative da insegnare',
  'Come preparare la situazione',
  'Esempi di frasi da usare',
  'Supporti visivi consigliati',
  'Come valorizzare le risposte adeguate',
  'Cosa osservare e come registrarlo',
] as const

export const GUIDE_VERSIONS: Record<GuideVersion, string> = {
  famiglia: 'Versione famiglia',
  scuola: 'Versione scuola',
}

/** Cosa scrive l'utente (mai nomi, età precise o diagnosi) */
export interface GuideInput {
  difficulty: string
  goal: string
  situations: string
  ageBand: AgeBand
  familyLanguage: FamilyLanguage
}

export const GUIDE_INPUT_MAX = { difficulty: 1500, goal: 600, situations: 1500 }

export const AGE_BANDS: Record<AgeBand, string> = { '3-5': '3-5 anni', '6-8': '6-8 anni' }
export const FAMILY_LANGUAGES: Record<FamilyLanguage, string> = { semplice: 'Semplice', articolato: 'Più articolato' }

export function emptyGuideInput(): GuideInput {
  return { difficulty: '', goal: '', situations: '', ageBand: '3-5', familyLanguage: 'semplice' }
}

export function isGuideInput(value: unknown): value is GuideInput {
  const v = value as Partial<GuideInput> | null
  return (
    !!v &&
    typeof v.difficulty === 'string' &&
    typeof v.goal === 'string' &&
    typeof v.situations === 'string' &&
    (v.ageBand === '3-5' || v.ageBand === '6-8') &&
    (v.familyLanguage === 'semplice' || v.familyLanguage === 'articolato')
  )
}

/**
 * Testo esattamente come viene inviato all'AI (anteprima nell'app = contenuto della richiesta).
 * `profile`: voci del profilo scelte nel flusso guidato (guida di un bambino).
 */
export function guideRequestText(input: GuideInput, profile: ProfileLine[] = []): string {
  return [
    `Difficoltà osservata: ${input.difficulty.trim()}`,
    `Obiettivo: ${input.goal.trim()}`,
    input.situations.trim() ? `Situazioni in cui si presenta: ${input.situations.trim()}` : null,
    `Fascia d'età: ${AGE_BANDS[input.ageBand]}`,
    `Linguaggio per la famiglia: ${FAMILY_LANGUAGES[input.familyLanguage].toLowerCase()}`,
    profileRequestText(profile),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Dati identificativi riconoscibili dal formato: l'invio all'AI si blocca e si dice cosa togliere.
 * L'app controlla anche i nomi delle cartelle e dei bambini presenti; il server ripete questi controlli.
 */
const IDENTIFYING: { label: string; pattern: RegExp }[] = [
  { label: 'un indirizzo email', pattern: /[^\s@]+@[^\s@]+\.[^\s@]+/ },
  { label: 'un numero di telefono', pattern: /(\+\d{1,3}[\s.-]?)?\d{3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/ },
  { label: 'un codice fiscale', pattern: /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/i },
  { label: 'una data', pattern: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/ },
  // Solo con l'iniziale maiuscola del nome: "va via subito" non è un indirizzo
  { label: 'un indirizzo', pattern: /\b[VvPpCc](?:ia|iale|iazza|orso|icolo)\s+[A-ZÀ-Ü][a-zà-ü]+/ },
]

/** Cosa togliere prima dell'invio (vuoto = si può inviare). `names`: nomi da non inviare mai. */
export function identifyingProblems(text: string, names: string[] = []): string[] {
  const problems = IDENTIFYING.filter((i) => i.pattern.test(text)).map((i) => i.label)
  const lower = ` ${normalize(text)} `
  for (const name of names) {
    const n = normalize(name).trim()
    if (n.length >= 2 && new RegExp(`[^a-z0-9]${escapeRegExp(n)}[^a-z0-9]`).test(lower)) problems.push(`il nome “${name.trim()}”`)
  }
  return [...new Set(problems)]
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Istruzioni fisse del modello di testo (in italiano: la guida è in italiano). */
export const GUIDE_INSTRUCTIONS = `Sei un assistente per un'Educatrice Professionale Socio-Sanitaria che lavora con bambini di 3-8 anni (autismo, ADHD, disturbo oppositivo-provocatorio). Prepari la BOZZA di una guida pratica che lei rivedrà e correggerà prima di consegnarla.

Ricevi: una difficoltà osservata, un obiettivo, eventuali situazioni, la fascia d'età, il linguaggio per la famiglia ed eventuali voci del profilo del bambino, con la loro provenienza.
Scrivi due versioni della guida, ognuna in 10 punti, in italiano:
1. Obiettivo di lavoro
2. Descrizione osservabile della difficoltà
3. Situazioni in cui si presenta
4. Possibili antecedenti e ipotesi funzionali, da verificare
5. Competenze alternative da insegnare
6. Come preparare la situazione
7. Esempi di frasi da usare
8. Supporti visivi consigliati
9. Come valorizzare le risposte adeguate
10. Cosa osservare e come registrarlo

Versione famiglia: linguaggio accessibile (più semplice o più articolato secondo la richiesta), esempi della vita di casa, indicazioni concrete, poche procedure essenziali. Rivolgiti ai genitori con il "voi".
Versione scuola: obiettivi osservabili, antecedenti, comportamento, risposta dell'adulto, supporti visivi, modalità di registrazione, indicazioni condivise per le transizioni. Rivolgiti agli insegnanti con il "voi".

Regole fisse:
- È una bozza da rivedere: indicazioni personalizzabili, mai protocolli universali né garanzie di risultato.
- Non dedurre la funzione del comportamento da una descrizione isolata. Il punto 4 inizia sempre con "Da verificare con l'osservazione:" e propone più ipotesi possibili, mai una sola certezza.
- Le emozioni del bambino sono possibilità plausibili, mai certezze.
- Le voci del profilo marcate come ipotesi restano ipotesi da verificare: non presentarle come fatti. Usa interessi e rinforzatori del profilo negli esempi quando aiutano.
- Nessuna diagnosi, nessun farmaco, nessuna indicazione di trattamento clinico, nessuna punizione, nessuna minaccia, nessuna privazione come strategia. Linguaggio positivo: cosa fare, non solo cosa evitare.
- Descrizioni osservabili: azioni che si vedono e si possono contare, non etichette.
- Adatta esempi, frasi e supporti visivi alla fascia d'età indicata.
- Punto 7: frasi brevi, tra virgolette, una per riga, come le direbbe un adulto al bambino.
- Punto 8: supporti concreti (es. sequenza illustrata, prima/poi, timer visivo, storia sociale, tabella a gettoni), spiegando in una riga a cosa servono.
- Punto 10: cosa contare o annotare, quando, e un modo semplice per registrarlo.
- Non inventare nomi, età precise, luoghi o altri dettagli personali: parla sempre di "il bambino" o "la bambina/il bambino".
- Ogni punto: da 2 a 6 frasi brevi oppure un breve elenco con righe che iniziano con "- ". Niente titoli, niente grassetto, niente markdown oltre a "- ".
- Lunghezza: ogni punto al massimo circa 90 parole (famiglia) e 110 parole (scuola).`

/** Rigenerazione di un solo punto: stesse regole, solo quel punto. */
export function guidePointInstructions(version: GuideVersion, index: number): string {
  return `${GUIDE_INSTRUCTIONS}

Ora riscrivi SOLO il punto ${index + 1} ("${GUIDE_POINTS[index]}") della ${GUIDE_VERSIONS[version].toLowerCase()}, in modo diverso dalla versione attuale che ti viene data, con le stesse regole. Restituisci solo il testo del punto.`
}
