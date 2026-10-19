// Flusso guidato "Nuovo materiale": chiamata della proposta di sequenza e costruzione della scheda.
import type { AgeBand } from '../config/guide'
import { sortProfileLines, type ProfileLine, type SequenceInput, type SequenceProposal } from '../config/flow'
import type { Sheet } from '../types'
import { call, send } from './account'
import type { ProfileEntry } from './childApi'
import type { ProfileRequest } from './guide'
import { createSheet, titleWithName } from './sheet'

export const flowApi = {
  proposeSequence: (sequence: SequenceInput, profile?: ProfileRequest) =>
    call<SequenceProposal>('/api/guide', send('POST', { sequence, ...profile })),
}

/** Fascia d'età proposta dall'anno di nascita (null se non c'è) */
export function ageBandFor(birthYear: number | null, now = new Date()): AgeBand | null {
  if (!birthYear) return null
  return now.getFullYear() - birthYear <= 5 ? '3-5' : '6-8'
}

/**
 * Voci scelte, come le compone il server: solo quelle non archiviate, nell'ordine delle sezioni
 * (dentro la sezione: data e creazione, lo stesso ordine del dettaglio del bambino).
 */
export function chosenProfileLines(entries: ProfileEntry[], ids: ReadonlySet<string>): ProfileLine[] {
  return sortProfileLines(
    entries.filter((e) => ids.has(e.id) && !e.archivedAt).map((e) => ({ section: e.section, source: e.source, text: e.text })),
  )
}

/** Scheda Routine della misura scelta, con le frasi e le vignette della proposta (tutto modificabile) */
export function sheetFromProposal(proposal: SequenceProposal, input: SequenceInput, childName: string, uppercase: boolean): Sheet {
  const sheet = createSheet(`routine-${input.steps}`, childName)
  return {
    ...sheet,
    character: input.character,
    title: titleWithName(proposal.title.trim() || sheet.title, childName),
    cells: sheet.cells.map((cell, i) => {
      const step = proposal.steps[i]
      return step ? { ...cell, code: step.code, text: step.text.trim() || null } : cell
    }),
    // Chi comprende soprattutto le immagini: solo vignette (le frasi restano salvate)
    sequence: { ...sheet.sequence, show: input.comprehension === 'immagini' ? 'images' : 'both' },
    uppercase,
  }
}
