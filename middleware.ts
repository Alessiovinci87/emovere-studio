// Protezione con password per il deploy su Vercel (Routing Middleware).
// Gira sul server prima di ogni richiesta, quindi protegge anche le immagini in /library.
// La password sta nella variabile d'ambiente APP_PASSWORD (impostata su Vercel, mai nel codice).
// Dopo l'accesso il browser riceve un cookie valido un anno; cambiando la password i cookie vecchi decadono.
// In locale (npm run dev) il middleware non gira: l'app è aperta.
import { next } from '@vercel/functions'

declare const process: { env: Record<string, string | undefined> }

export const config = { matcher: '/:path*' }

const COOKIE = 'emovere_accesso'
const LOGIN_PATH = '/__accesso'
const ONE_YEAR = 60 * 60 * 24 * 365

export default async function middleware(request: Request): Promise<Response> {
  const password = process.env.APP_PASSWORD
  if (!password) {
    return loginPage('L’accesso non è ancora configurato (manca APP_PASSWORD).', 503)
  }
  const token = await tokenFor(password)
  const url = new URL(request.url)

  if (url.pathname === LOGIN_PATH && request.method === 'POST') {
    const form = await request.formData()
    if (form.get('password') !== password) {
      return loginPage('Password non corretta. Riprova.', 401)
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/',
        'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`,
      },
    })
  }

  if (readCookie(request, COOKIE) === token) return next()
  return loginPage(null, 401)
}

/** Valore del cookie: impronta SHA-256 della password (la password non viaggia nel cookie). */
async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`emovere-studio:${password}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return undefined
}

function loginPage(message: string | null, status: number): Response {
  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Emovere Studio</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
         background: #fbf7f0; color: #3b3846; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  form { width: 100%; max-width: 360px; background: #fff; border-radius: 24px; padding: 32px;
         box-shadow: 0 1px 3px rgba(59,56,70,.08); display: flex; flex-direction: column; gap: 16px; }
  h1 { margin: 0; font-size: 22px; }
  h1 span { color: #f4a78f; }
  p { margin: 0; color: #8a8394; font-size: 15px; line-height: 1.5; }
  input { font: inherit; padding: 12px 18px; border-radius: 999px; border: 1px solid #e4d9c8; outline: none; }
  input:focus { border-color: #6f9fd8; }
  button { font: inherit; font-weight: 700; padding: 12px; border: 0; border-radius: 999px;
           background: #e3eefa; color: #3b3846; cursor: pointer; }
  button:hover { background: #cfe0f4; }
  .error { color: #c0583f; font-weight: 600; }
</style>
</head>
<body>
<form method="post" action="${LOGIN_PATH}">
  <h1>Emovere <span>Studio</span></h1>
  <p>Prototipo riservato. Inserisci la password per entrare.</p>
  ${message ? `<p class="error" role="alert">${message}</p>` : ''}
  <input type="password" name="password" aria-label="Password" placeholder="Password" autocomplete="current-password" required autofocus>
  <button type="submit">Entra</button>
</form>
</body>
</html>`
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
