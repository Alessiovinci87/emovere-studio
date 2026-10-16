// Collaudo delle funzioni del login contro un PostgreSQL locale con stub_supabase.sql e le migrazioni.
// Prima: tsc -p tsconfig.api.json --noEmit false --outDir .apitest --rootDir .
// Uso: TEST_DATABASE_URL=postgres://postgres@localhost:5432/emo_api node scripts/test-api.mjs
// (database usa e getta con gli utenti ...0a e ...0b in auth.users; le chiavi JWT le genera il test)
import http from 'node:http'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' }
const server = http
  .createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ keys: [jwk] }))
  })
  .listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://localhost:${server.address().port}`
process.env.VITE_SUPABASE_URL = base
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/emo_api'
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
async function token(sub, aal = 'aal2', issuer = `${base}/auth/v1`) {
  return new SignJWT({ email: sub === A ? 'a@test' : 'b@test', aal, role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}
function req(method, path, tok, body, extraHeaders = {}) {
  return new Request(`http://app${path}`, {
    method,
    headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), 'content-type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  })
}
async function call(mod, method, path, tok, body, h) {
  const r = await mod[method](req(method, path, tok, body, h))
  return { status: r.status, body: await r.json() }
}

const me = await import('../.apitest/api/me.js')
const setup = await import('../.apitest/api/setup.js')
const org = await import('../.apitest/api/organization.js')
const members = await import('../.apitest/api/members.js')
const session = await import('../.apitest/api/_lib/session.js')
const crypto = await import('../.apitest/api/_lib/crypto.js')

// Sessione e token
let r = await call(me, 'GET', '/api/me', null)
assert.equal(r.status, 401)
r = await call(me, 'GET', '/api/me', await token(A, 'aal1'))
assert.equal(r.status, 403, 'senza MFA niente dati')
r = await call(me, 'GET', '/api/me', await token(A, 'aal2', 'http://altro/auth/v1'))
assert.equal(r.status, 401, 'issuer sbagliato')
r = await call(me, 'GET', '/api/me', 'abc.def.ghi')
assert.equal(r.status, 401)
const ta = await token(A)
const tb = await token(B)
r = await call(me, 'GET', '/api/me', ta)
assert.equal(r.status, 200)
assert.equal(r.body.organization, null)
assert.equal(r.body.setupAvailable, true)

// Token dal cookie di @supabase/ssr (anche diviso in pezzi)
const ref = new URL(base).hostname.split('.')[0]
const value =
  'base64-' + Buffer.from(JSON.stringify({ access_token: ta, refresh_token: 'x', user: { pad: 'é'.repeat(3000) } })).toString('base64url')
const half = Math.floor(value.length / 2)
const cookie = `altro=1; sb-${ref}-auth-token.0=${encodeURIComponent(value.slice(0, half))}; sb-${ref}-auth-token.1=${encodeURIComponent(value.slice(half))}`
assert.equal(session.accessTokenFrom(new Request('http://app/', { headers: { cookie } }), base), ta, 'cookie a pezzi')
assert.equal(
  session.accessTokenFrom(new Request('http://app/', { headers: { cookie: `sb-${ref}-auth-token=${encodeURIComponent(value)}` } }), base),
  ta,
  'cookie intero',
)
r = await call(me, 'GET', '/api/me', null, undefined, { cookie })
assert.equal(r.status, 200, 'me dal cookie')

// Crea il centro
r = await call(setup, 'POST', '/api/setup', ta, { name: '  ', displayName: '' })
assert.equal(r.status, 400)
r = await call(setup, 'POST', '/api/setup', ta, { name: 'Centro Emovere', displayName: 'Martina' })
assert.equal(r.status, 200, JSON.stringify(r.body))
r = await call(setup, 'POST', '/api/setup', tb, { name: 'Secondo' })
assert.equal(r.status, 409)
assert.match(r.body.error, /esiste già/)
r = await call(me, 'GET', '/api/me', ta)
assert.equal(r.body.organization.role, 'titolare')
assert.equal(r.body.organization.dataController, 'Centro Emovere')
assert.equal(r.body.organization.privacyVerifiedAt, null)
assert.equal(r.body.setupAvailable, false)
r = await call(me, 'GET', '/api/me', tb)
assert.equal(r.body.organization, null)
assert.equal(r.body.setupAvailable, false)

// Chiave dati del centro: cifrata con DATA_ENCRYPTION_KEY, si decifra
const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL)
const [{ dek_wrapped, id: orgId }] = await sql`select dek_wrapped, id from app.organizations`
const dek = crypto.unwrapDek(dek_wrapped)
assert.equal(dek.length, 32)
const enc = crypto.encryptField(dek, 'Difficoltà nelle transizioni', 'child_profile_entries.text_enc:123')
assert.match(enc, /^ev1:[0-9]{1,5}:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{24,}={0,2}$/, 'formato accettato dal dominio')
assert.equal(crypto.decryptField(dek, enc, 'child_profile_entries.text_enc:123'), 'Difficoltà nelle transizioni')
assert.throws(() => crypto.decryptField(dek, enc, 'child_profile_entries.text_enc:456'), 'contesto diverso: non si decifra')
await sql`select ${enc}::app.encrypted_text`

// Membri e privacy: B operatore
await sql`insert into app.memberships (org_id, user_id, role, email) values (${orgId}, ${B}, 'operatore', 'b@test')`
r = await call(members, 'GET', '/api/members', tb)
assert.equal(r.status, 200)
assert.equal(r.body.members.length, 2)
assert.equal(r.body.members[0].pending, undefined, 'operatore: niente dati di amministrazione')
r = await call(org, 'PATCH', '/api/organization', tb, { privacyVerified: true })
assert.equal(r.status, 403)
r = await call(members, 'POST', '/api/members', tb, { email: 'c@test.it', role: 'operatore' })
assert.equal(r.status, 403, 'operatore non invita')
r = await call(members, 'PATCH', '/api/members', tb, { userId: A, role: 'operatore' })
assert.equal(r.status, 403)
r = await call(members, 'PATCH', '/api/members', ta, { userId: A, role: 'operatore' })
assert.equal(r.status, 409, 'ultimo titolare')
assert.match(r.body.error, /almeno un titolare/)
r = await call(members, 'PATCH', '/api/members', ta, { userId: B, displayName: 'Bea' })
assert.equal(r.status, 200)
r = await call(org, 'PATCH', '/api/organization', ta, { privacyVerified: true })
assert.equal(r.status, 200)
assert.ok(r.body.privacyVerifiedAt)
r = await call(me, 'GET', '/api/me', tb)
assert.ok(r.body.organization.privacyVerifiedAt, 'B vede la privacy verificata')
r = await call(org, 'PATCH', '/api/organization', ta, { privacyVerified: false })
assert.equal(r.body.privacyVerifiedAt, null)
r = await call(members, 'DELETE', `/api/members?user=${B}`, ta)
assert.equal(r.status, 200)
r = await call(me, 'GET', '/api/me', tb)
assert.equal(r.body.organization, null, 'B tolto dal centro')
const log = await sql`select action, entity from app.audit_log order by id`
assert.deepEqual(
  log.map((a) => `${a.action}:${a.entity}`),
  ['crea:organizations', 'modifica:memberships', 'modifica:organizations', 'modifica:organizations', 'elimina:memberships'],
)
console.log('API: tutti i test superati')
await sql.end()
server.close()
process.exit(0)
