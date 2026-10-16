// Sessione di Supabase Auth: lettura del token e verifica della firma.
// Usato sia da middleware.ts (Edge) sia dalle funzioni /api: niente moduli di Node qui.
//
// Il token arriva nell'intestazione Authorization (chiamate dell'app a /api) oppure nel cookie
// scritto da @supabase/ssr nel browser (immagini, link diretti): `sb-{ref}-auth-token`, a volte diviso
// in pezzi `.0`, `.1`…, con il valore "base64-" + JSON della sessione codificato in base64url.
// La firma si verifica con le chiavi pubbliche del progetto (JWKS): nessun segreto condiviso.
import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface SessionClaims {
  /** id dell'utente (auth.users.id) */
  sub: string
  email: string | null
  /** aal2 = ha inserito anche il codice dell'app di autenticazione */
  aal: string
}

const BASE64_PREFIX = 'base64-'

export function accessTokenFrom(request: Request, supabaseUrl: string): string | null {
  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null

  const name = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  const cookies = parseCookies(request.headers.get('cookie') ?? '')
  let raw = cookies.get(name)
  if (raw === undefined) {
    const chunks: string[] = []
    for (let i = 0; cookies.has(`${name}.${i}`); i++) chunks.push(cookies.get(`${name}.${i}`)!)
    if (chunks.length === 0) return null
    raw = chunks.join('')
  }
  try {
    const text = raw.startsWith(BASE64_PREFIX) ? fromBase64Url(raw.slice(BASE64_PREFIX.length)) : raw
    const session = JSON.parse(text) as { access_token?: unknown }
    return typeof session.access_token === 'string' ? session.access_token : null
  } catch {
    return null
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
let jwksIssuer = ''

/** Claims del token se la firma è valida e non è scaduto; altrimenti null. */
export async function verifyAccessToken(token: string, supabaseUrl: string): Promise<SessionClaims | null> {
  const issuer = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
  if (!jwks || jwksIssuer !== issuer) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    jwksIssuer = issuer
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' })
    if (typeof payload.sub !== 'string') return null
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      aal: typeof payload.aal === 'string' ? payload.aal : 'aal1',
    }
  } catch {
    return null
  }
}

function parseCookies(header: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    let value = part.slice(eq + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      // valore non codificato: si usa così com'è
    }
    if (key && !map.has(key)) map.set(key, value)
  }
  return map
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}
