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

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error('Connessione non riuscita. Controlla internet e riprova.')
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Il server non risponde: le funzioni /api girano solo nella versione online.')
  }
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? 'Qualcosa non ha funzionato. Riprova.')
  return body as T
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const accountApi = {
  me: () => call<Account>('/api/me'),
  setup: (name: string, displayName: string) => call<{ organizationId: string }>('/api/setup', send('POST', { name, displayName })),
  setPrivacyVerified: (privacyVerified: boolean) =>
    call<{ privacyVerifiedAt: string | null }>('/api/organization', send('PATCH', { privacyVerified })),
  members: async () => (await call<{ members: Member[] }>('/api/members')).members,
  invite: (email: string, role: Role, displayName: string) =>
    call<{ ok: true }>('/api/members', send('POST', { email, role, displayName })),
  updateMember: (userId: string, patch: { role?: Role; displayName?: string }) =>
    call<{ ok: true }>('/api/members', send('PATCH', { userId, ...patch })),
  removeMember: (userId: string) => call<{ ok: true }>(`/api/members?user=${encodeURIComponent(userId)}`, send('DELETE')),
  resetMfa: (userId: string) => call<{ ok: true }>('/api/members', send('POST', { action: 'reset-mfa', userId })),
}
