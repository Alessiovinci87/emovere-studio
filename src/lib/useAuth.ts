import { useCallback, useEffect, useState } from 'react'
import { accountApi, type Account } from './account'
import { authMessage, supabase } from './supabase'

// Percorso di accesso, un passo alla volta:
//   link dell'email (invito o reimposta password) → login → codice MFA (se già attivo)
//   → nuova password (dopo invito o reimposta) → attivazione MFA (obbligatoria) → centro → app
export type AuthStep =
  | { step: 'off' }
  | { step: 'loading' }
  | { step: 'login' }
  | { step: 'link-error'; message: string }
  | { step: 'mfa-verify'; factorId: string }
  | { step: 'password'; reason: PasswordReason }
  | { step: 'mfa-enroll' }
  | { step: 'setup'; email: string }
  | { step: 'no-center'; email: string }
  | { step: 'error'; message: string }
  | { step: 'ready'; account: Account }

export type PasswordReason = 'invite' | 'recovery'

// Le email di Supabase portano a /benvenuto o /reimposta-password con token_hash (vedi supabase/templates)
const LINK_PATHS: Record<string, PasswordReason> = { '/benvenuto': 'invite', '/reimposta-password': 'recovery' }
const PENDING_PASSWORD = 'emovere.auth.password'

export function setPendingPassword(reason: PasswordReason | null) {
  try {
    if (reason) sessionStorage.setItem(PENDING_PASSWORD, reason)
    else sessionStorage.removeItem(PENDING_PASSWORD)
  } catch {
    // sessionStorage non disponibile: si chiede la password solo in questa schermata
  }
}

function pendingPassword(): PasswordReason | null {
  try {
    const value = sessionStorage.getItem(PENDING_PASSWORD)
    return value === 'invite' || value === 'recovery' ? value : null
  } catch {
    return null
  }
}

/**
 * Link dell'email (invito o reimposta password): lo verifica una sola volta anche se il componente
 * si monta due volte (StrictMode). Restituisce il messaggio d'errore, o null.
 */
let emailLink: Promise<string | null> | null = null

function handleEmailLink(client: NonNullable<typeof supabase>): Promise<string | null> {
  emailLink ??= (async () => {
    const reason = LINK_PATHS[location.pathname]
    const tokenHash = new URLSearchParams(location.search).get('token_hash')
    if (!reason || !tokenHash) return null
    // Il link si usa una volta sola: lo si toglie subito dall'URL
    window.history.replaceState({ depth: 0 }, '', '/oggi')
    await client.auth.signOut({ scope: 'local' })
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: reason })
    if (!error) {
      setPendingPassword(reason)
      return null
    }
    if (error.code !== 'otp_expired') return authMessage(error)
    return reason === 'invite'
      ? 'Il link d’invito è scaduto o è già stato usato. Chiedi al titolare del centro di invitarti di nuovo.'
      : 'Il link per reimpostare la password è scaduto o è già stato usato. Chiedine uno nuovo.'
  })()
  return emailLink
}

/** Server di prova locale (npm run dev:server): login simulato, si chiede subito /api/me */
const devApi = !supabase && import.meta.env.VITE_DEV_API === '1'

async function accountStep(): Promise<AuthStep> {
  try {
    const account = await accountApi.me()
    if (account.organization) return { step: 'ready', account }
    if (account.setupAvailable) return { step: 'setup', email: account.user.email }
    return { step: 'no-center', email: account.user.email }
  } catch (err) {
    return { step: 'error', message: (err as Error).message }
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthStep>(supabase || devApi ? { step: 'loading' } : { step: 'off' })

  const evaluate = useCallback(async () => {
    if (!supabase) {
      if (devApi) setState(await accountStep())
      return
    }
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setState({ step: 'login' })
      return
    }
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ])
    const verified = factors?.totp.find((f) => f.status === 'verified')
    if (verified && aal?.currentLevel !== 'aal2') {
      setState({ step: 'mfa-verify', factorId: verified.id })
      return
    }
    const reason = pendingPassword()
    if (reason) {
      setState({ step: 'password', reason })
      return
    }
    if (!verified) {
      setState({ step: 'mfa-enroll' })
      return
    }
    setState(await accountStep())
  }, [])

  useEffect(() => {
    if (!supabase) {
      if (devApi) void evaluate()
      return
    }
    const client = supabase
    let cancelled = false

    async function start() {
      const linkError = await handleEmailLink(client)
      if (cancelled) return
      if (linkError) setState({ step: 'link-error', message: linkError })
      else await evaluate()
    }
    void start()

    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState({ step: 'login' })
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [evaluate])

  const signOut = useCallback(async () => {
    setPendingPassword(null)
    await supabase?.auth.signOut()
    setState({ step: 'login' })
  }, [])

  return { state, refresh: evaluate, signOut }
}
