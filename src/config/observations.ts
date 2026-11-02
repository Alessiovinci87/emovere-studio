// Osservazioni (specifica di Martina, sezione 13): valori uguali ai vincoli del database.
// Il livello di aiuto va da "fisico totale" (più aiuto) ad "autonomo" (nessun aiuto): è la scala dell'andamento.

export type ObservationContext = 'studio' | 'casa' | 'scuola' | 'altro'
export type PromptLevel = 'autonomo' | 'verbale' | 'gestuale' | 'modello' | 'fisico_parziale' | 'fisico_totale'

export const OBS_CONTEXTS: { id: ObservationContext; label: string }[] = [
  { id: 'studio', label: 'Studio / centro' },
  { id: 'casa', label: 'Casa' },
  { id: 'scuola', label: 'Scuola' },
  { id: 'altro', label: 'Altro' },
]

/** Dal meno autonomo al più autonomo: l'indice è il punteggio nell'andamento (0-5) */
export const PROMPT_LEVELS: { id: PromptLevel; label: string; hint: string }[] = [
  { id: 'fisico_totale', label: 'Aiuto fisico totale', hint: 'L’adulto guida tutto il movimento' },
  { id: 'fisico_parziale', label: 'Aiuto fisico parziale', hint: 'L’adulto accompagna una parte del movimento' },
  { id: 'modello', label: 'Modello', hint: 'L’adulto mostra come si fa' },
  { id: 'gestuale', label: 'Aiuto gestuale', hint: 'Indica, mostra con un gesto' },
  { id: 'verbale', label: 'Aiuto verbale', hint: 'Una parola o una frase' },
  { id: 'autonomo', label: 'Autonomo', hint: 'Nessun aiuto' },
]

export function promptScore(level: PromptLevel | null): number | null {
  if (!level) return null
  return PROMPT_LEVELS.findIndex((p) => p.id === level)
}

export function promptLabel(level: PromptLevel | null): string {
  return PROMPT_LEVELS.find((p) => p.id === level)?.label ?? ''
}
