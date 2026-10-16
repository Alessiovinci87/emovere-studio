// Utente della richiesta: login valido e secondo fattore (MFA) obbligatorio per tutti.
import { createClient } from '@supabase/supabase-js'
import { UserError } from './http.js'
import { accessTokenFrom, verifyAccessToken } from './session.js'

export interface AuthUser {
  id: string
  email: string
}

/** Variabile d'ambiente obbligatoria (impostata su Vercel). */
export function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new UserError(`Configurazione del server incompleta (manca ${name}).`, 503)
  return value
}

export function supabaseUrl(): string {
  return process.env.SUPABASE_URL || env('VITE_SUPABASE_URL')
}

export async function requireUser(request: Request): Promise<AuthUser> {
  const url = supabaseUrl()
  const token = accessTokenFrom(request, url)
  const claims = token ? await verifyAccessToken(token, url) : null
  if (!claims) throw new UserError('Sessione scaduta: accedi di nuovo.', 401)
  if (claims.aal !== 'aal2') throw new UserError('Serve il codice dell’app di autenticazione.', 403)
  return { id: claims.sub, email: claims.email ?? '' }
}

/** API di amministrazione di Supabase Auth (inviti, secondo fattore). Solo lato server. */
export function adminAuth() {
  return createClient(supabaseUrl(), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth.admin
}
