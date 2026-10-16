// Server di prova locale per le funzioni /api: usa le funzioni vere (compilate in .apitest) e un
// PostgreSQL locale con stub_supabase.sql e le migrazioni. Il login è simulato: ogni richiesta senza
// token riceve quello dell'utente di prova (titolare), firmato con una chiave generata all'avvio.
// Le funzioni che chiamano OpenAI, Vercel Blob o le API di amministrazione di Supabase qui non funzionano.
//
// Uso (due terminali):
//   npm run dev:api        → compila le funzioni e avvia questo server su http://localhost:8787
//   npm run dev:server     → app con Vite; /api va a questo server (vite --mode devapi)
// Variabili: DEV_DATABASE_URL (predefinito postgres://postgres@localhost:5432/emovere_dev)
// Intestazione facoltativa x-dev-user: 'b' per agire come secondo utente (operatore, se aggiunto al centro).
import http from 'node:http'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

const PORT = Number(process.env.DEV_API_PORT ?? 8787)
const BASE = `http://localhost:${PORT}`
process.env.VITE_SUPABASE_URL = BASE
process.env.DATABASE_URL = process.env.DEV_DATABASE_URL ?? 'postgres://postgres@localhost:5432/emovere_dev'
// Chiave fissa solo per il server di prova (i dati sono di prova)
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 42).toString('base64')

const USERS = {
  a: { id: '00000000-0000-0000-0000-0000000000a1', email: 'titolare@prova.local' },
  b: { id: '00000000-0000-0000-0000-0000000000b2', email: 'operatore@prova.local' },
}

const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'dev', alg: 'ES256', use: 'sig' }

const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} })
for (const u of Object.values(USERS)) {
  await sql`insert into auth.users (id, email) values (${u.id}, ${u.email}) on conflict do nothing`
}

async function tokenFor(user) {
  return new SignJWT({ email: user.email, aal: 'aal2', role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'dev' })
    .setSubject(user.id)
    .setIssuer(`${BASE}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

const modules = new Map()
async function handler(name) {
  if (!modules.has(name)) modules.set(name, await import(`../.apitest/api/${name}.js`))
  return modules.get(name)
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, BASE)
      if (url.pathname === '/auth/v1/.well-known/jwks.json') {
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ keys: [jwk] }))
      }
      const match = url.pathname.match(/^\/api\/([a-z]+)$/)
      if (!match) {
        res.statusCode = 404
        return res.end('non trovato')
      }
      const mod = await handler(match[1]).catch(() => null)
      const fn = mod?.[req.method]
      if (!fn) {
        res.statusCode = 405
        return res.end('metodo non disponibile')
      }
      const chunks = []
      for await (const c of req) chunks.push(c)
      const headers = new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'))
      if (!headers.has('authorization')) {
        headers.set('authorization', `Bearer ${await tokenFor(USERS[headers.get('x-dev-user') ?? 'a'] ?? USERS.a)}`)
      }
      const body = ['GET', 'HEAD', 'DELETE'].includes(req.method) || chunks.length === 0 ? undefined : Buffer.concat(chunks)
      const response = await fn(new Request(url, { method: req.method, headers, body }))
      res.statusCode = response.status
      response.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'Errore del server di prova.' }))
    }
  })
  .listen(PORT, () => console.log(`Server /api di prova su ${BASE} (database: ${process.env.DATABASE_URL})`))
