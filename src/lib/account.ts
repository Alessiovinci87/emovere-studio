// Account, centro e membri: chiamate dell'app alle funzioni /api (con il token della sessione).
import { supabase } from './supabase'

export type Role = 'titolare' | 'operatore'

export interface Organization {
  id: string
  name: string
  /** Titolare del trattamento */
  dataController: string | null
  /** null = privacy non ancora verificata: si lavora solo con dati di prova */
  privacyVerifiedAt: string | null
  role: Role
  displayName: string | null
  /** Impostazioni dell'app per il centro (logo, nome, stampatello); {} se mai salvate */
  settings?: Record<string, unknown>
}

export interface Account {
  user: { id: string; email: string }
  organization: Organization | null
  /** Nessun centro esiste ancora: si può creare il primo */
  setupAvailable: boolean
}

export interface Member {
  userId: string
  email: string | null
  displayName: string | null
  role: Role
  createdAt: string
  /** Solo per il titolare: invito non ancora accettato */
  pending?: boolean
  /** Solo per il titolare: secondo fattore attivo */
  mfa?: boolean
}

export type AuditAction = 'crea' | 'legge' | 'modifica' | 'esporta' | 'elimina' | 'ripristina' | 'importa'

export interface AuditEntry {
  id: string
  at: string
  action: AuditAction
  entity: string
  entityId: string | null
  /** pseudonym null = bambino eliminato (resta solo l'identificativo) */
  child: { id: string; code: string | null; pseudonym: string | null } | null
  /** null = pulizia automatica; name null = persona non più nel centro */
  user: { id: string; name: string | null } | null
  details: Record<string, unknown>
}

export interface AuditFilter {
  child?: string
  user?: string
  action?: AuditAction
}

/** Risposta di /api: `network` = server irraggiungibile (offline), `status` 0 in quel caso. */
export interface ApiResult {
  ok: boolean
  status: number
  body: Record<string, unknown>
  network?: boolean
}

/** Chiamata a /api con il token della sessione; non lancia errori: decide chi chiama. */
export async function apiRequest(url: string, init: RequestInit = {}): Promise<ApiResult> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch {
    return { ok: false, status: 0, network: true, body: { error: 'Connessione non riuscita. Controlla internet e riprova.' } }
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return { ok: false, status: response.status, body: { error: 'Il server non risponde: le funzioni /api girano solo nella versione online.' } }
  }
  return { ok: response.ok, status: response.status, body: (await response.json()) as Record<string, unknown> }
}

export async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const result = await apiRequest(url, init)
  if (!result.ok) throw new Error((result.body.error as string | undefined) ?? 'Qualcosa non ha funzionato. Riprova.')
  return result.body as T
}

export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const accountApi = {
  me: () => call<Account>('/api/me'),
  setup: (name: string, displayName: string) => call<{ organizationId: string }>('/api/setup', send('POST', { name, displayName })),
  saveSettings: (settings: { logo: string | null; centerName: string; uppercaseDefault: boolean }) =>
    call<{ settings: Record<string, unknown> }>('/api/organization', send('PATCH', { settings })),
  setPrivacyVerified: (privacyVerified: boolean) =>
    call<{ privacyVerifiedAt: string | null }>('/api/organization', send('PATCH', { privacyVerified })),
  members: async () => (await call<{ members: Member[] }>('/api/members')).members,
  invite: (email: string, role: Role, displayName: string) =>
    call<{ ok: true }>('/api/members', send('POST', { email, role, displayName })),
  updateMember: (userId: string, patch: { role?: Role; displayName?: string }) =>
    call<{ ok: true }>('/api/members', send('PATCH', { userId, ...patch })),
  removeMember: (userId: string) => call<{ ok: true }>(`/api/members?user=${encodeURIComponent(userId)}`, send('DELETE')),
  resetMfa: (userId: string) => call<{ ok: true }>('/api/members', send('POST', { action: 'reset-mfa', userId })),
  /** Registro degli accessi (solo titolare), 100 righe per volta dal più recente */
  audit: (filter: AuditFilter, before?: string) => {
    const query = new URLSearchParams({ resource: 'audit' })
    for (const [key, value] of Object.entries(filter)) if (value) query.set(key, value)
    if (before) query.set('before', before)
    return call<{ entries: AuditEntry[]; next: string | null }>(`/api/organization?${query}`)
  },
}
