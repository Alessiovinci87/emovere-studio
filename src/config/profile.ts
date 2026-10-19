// Cartella del bambino: sezioni del profilo, provenienza delle informazioni, aree e stati degli obiettivi
// (specifica di Martina, sezione 3). I valori coincidono con i vincoli del database.

export type ProfileSection =
  | 'comunicazione'
  | 'autonomie'
  | 'interessi'
  | 'difficolta'
  | 'contesti'
  | 'preferenze'
  | 'rinforzatori'
  | 'uso'
  | 'note'

export const PROFILE_SECTIONS: { id: ProfileSection; label: string; hint: string }[] = [
  { id: 'comunicazione', label: 'Comunicazione e comprensione', hint: 'Competenze comunicative e livello di comprensione' },
  { id: 'autonomie', label: 'Autonomie', hint: 'Autonomie e abilità già acquisite' },
  { id: 'interessi', label: 'Interessi', hint: 'Interessi, giochi e personaggi preferiti' },
  { id: 'difficolta', label: 'Difficoltà', hint: 'Difficoltà e situazioni critiche osservate' },
  { id: 'contesti', label: 'Contesti di vita', hint: 'Studio, casa, scuola e altri ambienti rilevanti' },
  { id: 'preferenze', label: 'Preferenze grafiche e comunicative', hint: 'Immagini, testo, simboli, colori, personaggi' },
  { id: 'rinforzatori', label: 'Rinforzatori', hint: 'Rinforzatori e attività motivanti individuati' },
  { id: 'uso', label: 'Note d’uso', hint: 'Come si usano i materiali e risposte osservate' },
]

/** Voci delle cartelle importate dalla versione precedente: si mostrano solo se ci sono */
export const OTHER_NOTES_SECTION = { id: 'note' as const, label: 'Altre note', hint: 'Appunti importati o da sistemare in una sezione' }

export type ProfileSource = 'osservato' | 'genitori' | 'scuola' | 'ipotesi'

/** Colori della provenienza: sono contenuto (come gli stati), non l'accento dell'interfaccia */
export const PROFILE_SOURCES: { id: ProfileSource; label: string; short: string; color: string; soft: string }[] = [
  { id: 'osservato', label: 'Osservato', short: 'Osservato', color: '#4f8a52', soft: '#e3f2e3' },
  { id: 'genitori', label: 'Riferito dai genitori', short: 'Genitori', color: '#b3623f', soft: '#fdebe4' },
  { id: 'scuola', label: 'Riferito dalla scuola', short: 'Scuola', color: '#3f6f9e', soft: '#e3eefa' },
  { id: 'ipotesi', label: 'Ipotesi · da verificare', short: 'Ipotesi', color: '#7a5aa8', soft: '#f1ecf8' },
]

export function sourceInfo(id: ProfileSource) {
  return PROFILE_SOURCES.find((s) => s.id === id)!
}

export type GoalArea = 'autonomie' | 'comunicazione' | 'emozioni' | 'abilita_sociali' | 'comportamento' | 'funzioni_esecutive' | 'scuola' | 'altro'

export const GOAL_AREAS: { id: GoalArea; label: string }[] = [
  { id: 'autonomie', label: 'Autonomie' },
  { id: 'comunicazione', label: 'Comunicazione' },
  { id: 'emozioni', label: 'Emozioni' },
  { id: 'abilita_sociali', label: 'Abilità sociali' },
  { id: 'comportamento', label: 'Comportamento' },
  { id: 'funzioni_esecutive', label: 'Funzioni esecutive' },
  { id: 'scuola', label: 'Scuola' },
  { id: 'altro', label: 'Altro' },
]

export type GoalStatus = 'attivo' | 'raggiunto' | 'archiviato'

export const GOAL_STATUSES: { id: GoalStatus; label: string; group: string; color: string; soft: string }[] = [
  { id: 'attivo', label: 'Attivo', group: 'Attivi', color: '#d9a23a', soft: '#fdf1d6' },
  { id: 'raggiunto', label: 'Raggiunto', group: 'Raggiunti', color: '#6aa86c', soft: '#e3f2e3' },
  { id: 'archiviato', label: 'Archiviato', group: 'Archiviati', color: '#a39aab', soft: '#efebf2' },
]

export function goalStatusInfo(id: GoalStatus) {
  return GOAL_STATUSES.find((s) => s.id === id)!
}
