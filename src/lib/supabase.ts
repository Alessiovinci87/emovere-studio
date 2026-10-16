import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Login con Supabase Auth. La sessione sta in un cookie (@supabase/ssr), così il middleware di Vercel
// può proteggere anche immagini e funzioni. URL e publishable key non sono segreti.
//
// Online il login è sempre attivo. In locale (npm run dev) le funzioni /api non girano, quindi il login
// resta spento e l'app funziona come prima; per provarlo in locale: VITE_AUTH_DEV=1 con `vercel dev`.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const enabled = Boolean(url && key) && (import.meta.env.PROD || import.meta.env.VITE_AUTH_DEV === '1')

export const supabase: SupabaseClient | null = enabled
  ? createBrowserClient(url!, key!, {
      cookieOptions: { path: '/', sameSite: 'lax', secure: location.protocol === 'https:' },
    })
  : null

/** Messaggi di Supabase Auth in italiano (codici: https://supabase.com/docs/guides/auth/debugging/error-codes) */
export function authMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  switch (code) {
    case 'invalid_credentials':
      return 'Email o password non corretti.'
    case 'email_not_confirmed':
      return 'Account non ancora attivato: apri il link nell’email d’invito.'
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
      return 'Codice non corretto o scaduto. Controlla l’app di autenticazione e riprova.'
    case 'weak_password':
      return 'Password troppo debole: almeno 12 caratteri, con maiuscole, minuscole e numeri.'
    case 'same_password':
      return 'La nuova password deve essere diversa da quella attuale.'
    case 'otp_expired':
      return 'Il link è scaduto o è già stato usato.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Troppi tentativi in poco tempo. Aspetta qualche minuto e riprova.'
    case 'reauthentication_needed':
    case 'insufficient_aal':
      return 'Per sicurezza esci e rientra, poi riprova.'
    case 'user_banned':
      return 'Questo account è sospeso.'
    default:
      return (error as Error | null)?.message?.includes('fetch')
        ? 'Connessione non riuscita. Controlla internet e riprova.'
        : 'Qualcosa non ha funzionato. Riprova.'
  }
}

/** Stesse regole impostate su Supabase (Authentication → Providers → Email). */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'Almeno 12 caratteri.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Servono maiuscole, minuscole e numeri.'
  }
  return null
}
