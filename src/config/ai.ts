// Configurazione della generazione di vignette con AI, condivisa tra app e funzione /api/generate.
// I testi in inglese di ambienti, abbigliamenti e adulti vengono dalla "Libreria prompt scene – Emovere":
// sono fissi, così ogni vignetta generata è coerente con la libreria disegnata.

export const AI_MODELS = {
  /** Modello immagini (endpoint images/edits con fogli di riferimento). Verificato sulla documentazione OpenAI. */
  image: 'gpt-image-2.5-sunburst',
  /** Modello di testo economico: traduzione dell'azione, titoli e tag */
  text: 'gpt-6-luna',
  /** Guide per genitori e scuola: modello più capace (verificato sulla documentazione OpenAI, ottobre 2026) */
  guide: 'gpt-6.1-sol',
}

/** Guide: sforzo di ragionamento del modello (più alto = più lento e più caro) */
export const AI_GUIDE_REASONING = 'low'

/** Guide generate per centro al giorno (ogni "Rigenera questo punto" conta come una). Variabile AI_TEXT_LIMIT. */
export const AI_TEXT_LIMIT_DEFAULT = 40

/**
 * Versione da colorare: prompt fisso, la vignetta originale come unica immagine.
 * Si salva come PNG ("{CODICE}_{personaggio}_colorare.png") e si genera una sola volta per vignetta.
 */
export const COLORING_PROMPT =
  'Convert this illustration into a clean black-and-white coloring page for young children aged 3-8. Keep exactly the same composition, character, pose, objects and setting. Thick, smooth, closed black outlines, pure white fills, no colors, no gray, no shading, no textures. Simplify very small details so every area is easy to color. No text.'

/** Stima del costo di un'immagine (per la conferma dello script npm run coloring), in dollari */
export const AI_IMAGE_COST_ESTIMATE = { min: 0.05, max: 0.08 }

export const AI_IMAGE = {
  size: '1024x1024',
  quality: 'medium',
  /** WebP: file leggeri (anche per stare nei limiti delle risposte delle funzioni Vercel) */
  format: 'webp',
  compression: 90,
} as const

/**
 * Limite di immagini generate (ogni vignetta ne crea 2: bambina e bambino), per giorno o per mese.
 * Si cambia senza toccare il codice con le variabili d'ambiente AI_LIMIT (numero) e AI_LIMIT_PERIOD (giorno | mese).
 * Questi sono i valori usati se le variabili mancano.
 */
export const AI_LIMIT_DEFAULT = 30
export type AiLimitPeriod = 'giorno' | 'mese'
export const AI_LIMIT_PERIOD_DEFAULT: AiLimitPeriod = 'giorno'

type Option = { label: string; prompt: string }

export const AI_SETTINGS = {
  cameretta: {
    label: 'Cameretta',
    prompt:
      'simple bedroom with light cream walls, white bed with a lilac blanket, small wooden nightstand with a blue lamp, window with soft curtains.',
  },
  bagno: {
    label: 'Bagno',
    prompt: 'simple bathroom with white and light-blue tiles, white sink with a mirror, blue towel on a hook.',
  },
  cucina: {
    label: 'Cucina',
    prompt:
      'simple kitchen with a round wooden table, light-blue placemats, wooden chairs, white cupboards, window with daylight.',
  },
  sala: {
    label: 'Sala',
    prompt:
      'simple living room with a grey sofa with yellow and teal cushions, low wooden table, TV on a small cabinet.',
  },
  ingresso: {
    label: 'Ingresso',
    prompt: 'simple entrance with coat hooks, low shoe rack, small bench, front door.',
  },
  'angolo calma': {
    label: 'Angolo calma',
    prompt: 'calm corner with a soft rug, big cushions, a small fabric canopy, warm light.',
  },
  aula: {
    label: 'Aula',
    prompt: 'simple classroom with small desks and chairs, green board, tidy shelves, large window.',
  },
  'ingresso scuola': {
    label: 'Ingresso scuola',
    prompt:
      'school entrance with a front door, small porch, path and one tree; other children only as blurred background shapes.',
  },
  cortile: {
    label: 'Cortile',
    prompt: 'schoolyard with grass, a small slide, a bench and a tree.',
  },
  parco: {
    label: 'Parco',
    prompt: 'park with grass, a path, a slide, a swing, trees.',
  },
  auto: {
    label: 'Auto',
    prompt: 'car back seat with a grey child car seat, window view of a quiet street.',
  },
  dottore: {
    label: 'Dottore',
    prompt: "bright clean doctor's room with an examination bed with a paper sheet and a desk.",
  },
  supermercato: {
    label: 'Supermercato',
    prompt: 'wide supermarket aisle with fruit and simple packages without text.',
  },
  'sfondo neutro': {
    label: 'Sfondo neutro',
    prompt: 'none. Background: plain very light warm color, no setting, no objects.',
  },
} satisfies Record<string, Option>

export const AI_OUTFITS = {
  casa: { label: 'Casa', prompt: 'exactly the clothes in the reference.' },
  pigiama: { label: 'Pigiama', prompt: 'pale blue pyjamas with small white stars (no pink, no hearts).' },
  grembiule: { label: 'Grembiule', prompt: 'blue school smock with white round collar over the reference clothes.' },
  uscita: { label: 'Uscita', prompt: 'the reference clothes plus a light-green zip jacket.' },
} satisfies Record<string, Option>

/** Non presenti nella libreria prompt: aggiunti per la scelta dell'espressione */
export const AI_EXPRESSIONS = {
  serena: { label: 'Serena', prompt: 'calm and relaxed, gentle look.' },
  felice: { label: 'Felice', prompt: 'happy, with a warm smile.' },
  triste: { label: 'Triste', prompt: 'a little sad, eyes slightly down, no tears.' },
  arrabbiata: { label: 'Arrabbiata', prompt: 'a little angry, frowning, arms tense, not scary.' },
  spaventata: { label: 'Spaventata', prompt: 'a little scared, eyes wide, not dramatic.' },
  concentrata: { label: 'Concentrata', prompt: 'focused on the task, attentive eyes.' },
  orgogliosa: { label: 'Orgogliosa', prompt: 'proud of themself, chin slightly up, bright smile.' },
} satisfies Record<string, Option>

/** Adulti: fogli di riferimento in public/library/refs/ (nomi dalla libreria prompt) */
export const AI_ADULTS = {
  mamma: { label: 'Mamma', ref: 'mamma_ref.png', prompt: 'the mother' },
  papa: { label: 'Papà', ref: 'papa_ref.png', prompt: 'the father' },
  maestra: { label: 'Maestra', ref: 'maestra_ref.png', prompt: 'the teacher' },
} satisfies Record<string, Option & { ref: string }>

export const CHILD_REFS = { bambina: 'bambina_ref.png', bambino: 'bambino_ref.png' } as const

export type AiSetting = keyof typeof AI_SETTINGS
export type AiOutfit = keyof typeof AI_OUTFITS
export type AiExpression = keyof typeof AI_EXPRESSIONS
export type AiAdult = keyof typeof AI_ADULTS

export interface AiRequest {
  setting: AiSetting
  outfit: AiOutfit
  expression: AiExpression
  adult: AiAdult | null
  /** Cosa fa il bambino, in italiano (es. "si allaccia le scarpe da solo") */
  description: string
}

/**
 * Prompt dell'immagine: template fisso composto dal server, mai scritto dall'utente.
 * `action` è la frase d'azione in inglese prodotta dal modello di testo.
 */
export function buildImagePrompt(action: string, req: Omit<AiRequest, 'description'>): string {
  const lines = [
    `Using the attached reference, illustrate one scene: ${action}`,
    'Keep the child identical to the reference (face, hair, hair accessories).',
    `Expression: ${AI_EXPRESSIONS[req.expression].prompt}`,
    `Outfit: ${AI_OUTFITS[req.outfit].prompt}`,
    `Setting: ${AI_SETTINGS[req.setting].prompt}`,
  ]
  if (req.adult) {
    lines.push(
      `Also in the scene: ${AI_ADULTS[req.adult].prompt}, identical to the second attached reference, kind and calm, at child height when interacting (kneeling or sitting).`,
    )
  }
  lines.push(
    "Nothing else in the scene: no pictures on walls, no extra toys or decorations. Simple uncluttered background, soft children's book style, square, no text.",
  )
  return lines.join('\n')
}

export function isAiRequest(value: unknown): value is AiRequest {
  const v = value as Partial<AiRequest> | null
  return (
    !!v &&
    typeof v.description === 'string' &&
    typeof v.setting === 'string' &&
    v.setting in AI_SETTINGS &&
    typeof v.outfit === 'string' &&
    v.outfit in AI_OUTFITS &&
    typeof v.expression === 'string' &&
    v.expression in AI_EXPRESSIONS &&
    (v.adult === null || (typeof v.adult === 'string' && v.adult in AI_ADULTS))
  )
}
