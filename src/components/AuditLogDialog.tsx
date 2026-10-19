import { useCallback, useEffect, useState } from 'react'
import { accountApi, type AuditAction, type AuditEntry, type AuditFilter, type Member } from '../lib/account'
import type { Folder } from '../types'
import { Modal } from './Modal'
import { Button, inputClass } from './ui'

// Registro degli accessi (solo titolare): chi ha letto, modificato, esportato o eliminato cosa.
// Il registro contiene solo identificativi e nomi dei campi, mai i contenuti.

const ACTIONS: Record<AuditAction, string> = {
  crea: 'Creato',
  legge: 'Aperto',
  modifica: 'Modificato',
  esporta: 'Esportato',
  elimina: 'Eliminato',
  ripristina: 'Ripristinato',
  importa: 'Importato',
}

const ENTITIES: Record<string, string> = {
  children: 'bambino',
  child_profile_entries: 'voce del profilo',
  goals: 'obiettivo',
  materials: 'materiale',
  observations: 'osservazione',
  organizations: 'impostazioni del centro',
  memberships: 'membro del centro',
}

const FIELDS: Record<string, string> = {
  pseudonym: 'pseudonimo',
  birth_year: 'anno di nascita',
  development_level_enc: 'livello di sviluppo',
  material_name_enc: 'nome sulle schede',
  notes_enc: 'appunti',
  real_name_enc: 'nome reale',
  graphic_prefs: 'preferenze grafiche',
  status: 'stato',
  deleted_at: 'cestino',
  text_enc: 'testo',
  section: 'sezione',
  source: 'provenienza',
  recorded_on: 'data',
  archived_at: 'archivio',
  title_enc: 'titolo',
  description_enc: 'descrizione',
  area: 'area',
  closed_on: 'chiusura',
  title: 'titolo',
  content: 'contenuto',
  reminder_date: 'promemoria',
  reminder_kind: 'promemoria',
  reminder_done: 'promemoria',
  opened_at: 'apertura',
  child_id: 'bambino',
  is_generic: 'generico',
  goal_ids: 'obiettivi collegati',
  privacy_verified_at: 'privacy verificata',
  data_controller: 'titolare del trattamento',
  settings: 'impostazioni',
  role: 'ruolo',
  display_name: 'nome',
}

function describe(entry: AuditEntry): string {
  const d = entry.details
  const parts: string[] = []
  if (Array.isArray(d.fields) && d.fields.length > 0) {
    parts.push([...new Set((d.fields as string[]).map((f) => FIELDS[f] ?? f))].join(', '))
  }
  if (d.note) parts.push('nota')
  if (d.definitivo) parts.push('per sempre')
  if (d.copiaDi) parts.push('copia')
  return parts.join(' · ')
}

export function AuditLogDialog({ folders, onClose }: { folders: Folder[]; onClose: () => void }) {
  const [filter, setFilter] = useState<AuditFilter>({})
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    accountApi.members().then(setMembers, () => setMembers([]))
  }, [])

  const load = useCallback(async (f: AuditFilter, before?: string) => {
    setBusy(true)
    setError(null)
    try {
      const page = await accountApi.audit(f, before)
      setEntries((list) => (before && list ? [...list, ...page.entries] : page.entries))
      setNext(page.next)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])
  useEffect(() => void load(filter), [filter, load])

  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name, 'it'))

  return (
    <Modal title="Registro degli accessi" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-muted">
          Chi ha aperto, modificato, esportato o eliminato i dati dei bambini e del centro. Il registro conserva solo
          identificativi e nomi dei campi, mai i contenuti, e non si può modificare.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            aria-label="Bambino"
            value={filter.child ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, child: e.target.value || undefined }))}
            className={inputClass}
          >
            <option value="">Tutti i bambini</option>
            {sortedFolders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.code ? ` (${f.code})` : ''}
              </option>
            ))}
          </select>
          <select
            aria-label="Persona"
            value={filter.user ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, user: e.target.value || undefined }))}
            className={inputClass}
          >
            <option value="">Tutte le persone</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName || m.email}
              </option>
            ))}
          </select>
          <select
            aria-label="Azione"
            value={filter.action ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, action: (e.target.value || undefined) as AuditAction | undefined }))}
            className={inputClass}
          >
            <option value="">Tutte le azioni</option>
            {Object.entries(ACTIONS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="text-sm font-bold text-[#a2472f]">
            {error}
          </p>
        )}
        {entries === null && !error && <p className="text-muted">Caricamento…</p>}
        {entries && entries.length === 0 && <p className="rounded-2xl bg-sand/60 px-4 py-6 text-center text-muted">Nessuna voce.</p>}
        {entries && entries.length > 0 && (
          <ul className="flex flex-col divide-y divide-line/70 rounded-2xl bg-white px-4">
            {entries.map((e) => {
              const extra = describe(e)
              return (
                <li key={e.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <time dateTime={e.at} className="shrink-0 text-xs font-bold text-muted sm:w-32">
                    {new Date(e.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </time>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-bold">{ACTIONS[e.action] ?? e.action}</span> {ENTITIES[e.entity] ?? e.entity}
                    {e.child && (
                      <span className="text-muted">
                        {' · '}
                        {e.child.pseudonym ? `${e.child.pseudonym} (${e.child.code})` : 'bambino eliminato'}
                      </span>
                    )}
                    {extra && <span className="block text-xs text-muted">{extra}</span>}
                  </span>
                  <span className="shrink-0 text-sm text-muted">
                    {e.user ? (e.user.name ?? 'persona non più nel centro') : 'Pulizia automatica'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {next && (
          <Button disabled={busy} onClick={() => void load(filter, next)} className="self-center">
            Mostra le precedenti
          </Button>
        )}
      </div>
    </Modal>
  )
}
