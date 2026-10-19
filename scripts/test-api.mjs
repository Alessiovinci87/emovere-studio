// Collaudo delle funzioni /api (login, centro, membri, bambini, profilo, obiettivi, materiali, guida con OpenAI simulato)
// contro un PostgreSQL locale. Le chiavi JWT le genera il test; le API di amministrazione di Supabase
// (inviti, azzera MFA) non sono coperte.
// Prima: database usa e getta con supabase/tests/stub_supabase.sql e le migrazioni, poi
//   tsc -p tsconfig.api.json --noEmit false --outDir .apitest --rootDir .
// Uso: TEST_DATABASE_URL=postgres://postgres@localhost:5432/emo_api node scripts/test-api.mjs
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
const C = '00000000-0000-0000-0000-00000000000c'
async function token(sub, aal = 'aal2', issuer = `${base}/auth/v1`) {
  return new SignJWT({ email: `${sub.slice(-1)}@test`, aal, role: 'authenticated' })
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

const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} })
await sql`insert into auth.users (id, email) values (${A}, 'a@test'), (${B}, 'b@test'), (${C}, 'c@test') on conflict do nothing`

const me = await import('../.apitest/api/me.js')
const setup = await import('../.apitest/api/setup.js')
const org = await import('../.apitest/api/organization.js')
const members = await import('../.apitest/api/members.js')
const session = await import('../.apitest/api/_lib/session.js')
const children = await import('../.apitest/api/children.js')
const materials = await import('../.apitest/api/materials.js')
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
const [{ dek_wrapped, id: orgId }] = await sql`select dek_wrapped, id from app.organizations`
const dek = crypto.unwrapDek(dek_wrapped)
assert.equal(dek.length, 32)
const enc = crypto.encryptField(dek, 'Difficoltà nelle transizioni', 'child_profile_entries.text_enc:123')
assert.match(enc, /^ev1:[0-9]{1,5}:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22,}={0,2}$/, 'formato accettato dal dominio')
assert.equal(crypto.decryptField(dek, enc, 'child_profile_entries.text_enc:123'), 'Difficoltà nelle transizioni')
assert.throws(() => crypto.decryptField(dek, enc, 'child_profile_entries.text_enc:456'), 'contesto diverso: non si decifra')
await sql`select ${enc}::app.encrypted_text`
// Ogni lunghezza di testo produce un valore accettato dal database (anche 1 carattere)
for (let n = 1; n <= 40; n++) {
  await sql`select ${crypto.encryptField(dek, 'x'.repeat(n), 'prova')}::app.encrypted_text`
}

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

// ——— Bambini, profilo, obiettivi ———
await sql`insert into app.memberships (org_id, user_id, role, email) values (${orgId}, ${B}, 'operatore', 'b@test')`
// Centro di C (creato come amministratore: dall'app si crea solo il primo)
const [{ id: org2 }] = await sql`insert into app.organizations (name, dek_wrapped) values ('Altro', ${crypto.newWrappedDek()}) returning id`
await sql`insert into app.memberships (org_id, user_id, role, email) values (${org2}, ${C}, 'titolare', 'c@test')`
const tc = await token(C)

r = await call(children, 'POST', '/api/children', ta, { pseudonym: '' })
assert.equal(r.status, 400)
r = await call(children, 'POST', '/api/children', tb, { pseudonym: 'Stella', realName: 'Sofia Rossi' })
assert.equal(r.status, 403, 'operatore non inserisce il nome reale')
r = await call(children, 'POST', '/api/children', ta, {
  pseudonym: 'Stella',
  birthYear: 2020,
  developmentLevel: 'Comprensione di frasi semplici',
  materialName: 'Sofia',
  realName: 'Sofia Rossi',
})
assert.equal(r.status, 200, JSON.stringify(r.body))
const child = r.body.child
assert.equal(child.code, 'B-0001')
assert.equal(child.realName, 'Sofia Rossi')
assert.equal(child.materialName, 'Sofia')
// Nel database solo testo cifrato
const [raw] = await sql`
  select c.development_level_enc, c.material_name_enc, i.real_name_enc
  from app.children c join app.child_identity i on i.child_id = c.id`
for (const v of Object.values(raw)) {
  assert.match(v, /^ev1:/)
  assert.ok(!v.includes('Sofia') && !v.includes('Comprensione'))
}
r = await call(children, 'POST', '/api/children', ta, { pseudonym: 'Luna', legacyId: 'cartella-1' })
const child2 = r.body.child
r = await call(children, 'POST', '/api/children', ta, { pseudonym: 'Luna bis', legacyId: 'cartella-1' })
assert.equal(r.body.existing, true, 'importazione senza doppioni')
assert.equal(r.body.child.id, child2.id)
// Valore cifrato copiato su un'altra riga: non si decifra (contesto diverso)
await sql`update app.children set material_name_enc = ${raw.material_name_enc} where id = ${child2.id}`
const consoleError = console.error
console.error = () => {}
r = await call(children, 'GET', `/api/children?id=${child2.id}`, ta)
console.error = consoleError
assert.equal(r.status, 500, 'valore spostato: non si decifra')
await sql`update app.children set material_name_enc = null where id = ${child2.id}`

r = await call(children, 'GET', `/api/children?id=${child.id}`, tb)
assert.equal(r.status, 200)
assert.equal(r.body.child.realName, undefined, 'operatore non vede il nome reale')
assert.equal(r.body.child.developmentLevel, 'Comprensione di frasi semplici')
r = await call(children, 'GET', `/api/children?id=${child.id}`, tc)
assert.equal(r.status, 404, 'altro centro: non esiste')
r = await call(children, 'GET', '/api/children', tc)
assert.equal(r.body.children.length, 0)
r = await call(children, 'PATCH', '/api/children', tc, { id: child.id, pseudonym: 'Rubato' })
assert.equal(r.status, 404)
r = await call(children, 'PATCH', '/api/children', tb, { id: child.id, realName: 'X' })
assert.equal(r.status, 403)
r = await call(children, 'PATCH', '/api/children', ta, { id: child.id, realName: null, materialName: 'Sofi' })
assert.equal(r.body.child.realName, null)
assert.equal(r.body.child.materialName, 'Sofi')

// Profilo
r = await call(children, 'POST', '/api/children?resource=profile', tb, {
  childId: child.id,
  section: 'interessi',
  text: 'Dinosauri',
  source: 'genitori',
})
assert.equal(r.status, 200, JSON.stringify(r.body))
const entry = r.body.entry
assert.equal(entry.text, 'Dinosauri')
r = await call(children, 'POST', '/api/children?resource=profile', tb, { childId: child.id, section: 'diagnosi', text: 'x', source: 'osservato' })
assert.equal(r.status, 400)
r = await call(children, 'POST', '/api/children?resource=profile', tc, { childId: child.id, section: 'interessi', text: 'x', source: 'osservato' })
assert.equal(r.status, 404, 'C non scrive nel profilo di un bambino del centro 1')
r = await call(children, 'PATCH', '/api/children?resource=profile', tb, { id: entry.id, text: 'Dinosauri e treni', archived: true })
assert.equal(r.body.entry.text, 'Dinosauri e treni')
assert.ok(r.body.entry.archivedAt)

// Obiettivi con storico
r = await call(children, 'POST', '/api/children?resource=goals', tb, { childId: child.id, title: 'Aspettare il turno', area: 'abilita_sociali' })
const goal = r.body.goal
assert.equal(goal.status, 'attivo')
r = await call(children, 'PATCH', '/api/children?resource=goals', tb, { id: goal.id, status: 'raggiunto', note: 'Tre settimane di fila' })
assert.equal(r.body.goal.status, 'raggiunto')
assert.ok(r.body.goal.closedOn)
r = await call(children, 'GET', `/api/children?id=${child.id}`, ta)
assert.equal(r.body.profile.length, 1)
assert.deepEqual(r.body.goals[0].events.map((e) => e.kind), ['creato', 'stato'])
assert.equal(r.body.goals[0].events[1].note, 'Tre settimane di fila')
r = await call(children, 'DELETE', `/api/children?resource=goals&id=${goal.id}`, tb)
assert.equal(r.status, 403, 'operatore non elimina obiettivi')

// ——— Materiali ———
const sheet = {
  id: 'loc-1',
  folderId: 'f1',
  template: 'routine-6',
  title: 'La mattina di Sofi',
  childName: 'Sofi',
  notes: 'appunto',
  cells: [],
  status: 'pronta',
}
r = await call(materials, 'POST', '/api/materials', tb, {
  childId: child.id,
  title: 'La mia mattina',
  content: sheet,
  notes: 'Da plastificare',
  reminder: { date: '2026-10-20', kind: 'stampare' },
})
assert.equal(r.status, 200, JSON.stringify(r.body))
const mat = r.body.material
assert.equal(mat.content.childName, undefined, 'nome del bambino tolto dal contenuto')
assert.equal(mat.content.notes, undefined)
assert.equal(mat.content.id, undefined)
assert.equal(mat.content.template, 'routine-6')
assert.equal(mat.notes, 'Da plastificare')
assert.equal(mat.revision, 1)
assert.deepEqual(mat.reminder, { date: '2026-10-20', kind: 'stampare', done: false })
const [rawMat] = await sql`select notes_enc from app.materials where id = ${mat.id}`
assert.match(rawMat.notes_enc, /^ev1:/)

// Revisione: due dispositivi partono dalla revisione 1
r = await call(materials, 'PATCH', '/api/materials', tb, { id: mat.id, title: 'Mattina' })
assert.equal(r.status, 400, 'senza revisione')
r = await call(materials, 'PATCH', '/api/materials', tb, { id: mat.id, baseRevision: 1, content: { ...sheet, cells: [{ id: 'c1' }] } })
assert.equal(r.status, 200)
assert.equal(r.body.material.revision, 2)
r = await call(materials, 'PATCH', '/api/materials', ta, { id: mat.id, baseRevision: 1, title: 'Altro titolo' })
assert.equal(r.status, 409, 'conflitto')
assert.equal(r.body.conflict, true)
assert.equal(r.body.current.revision, 2)
assert.equal(r.body.current.content.cells.length, 1)
r = await call(materials, 'PATCH', '/api/materials', ta, { id: mat.id, status: 'in-lavorazione', opened: true })
assert.equal(r.status, 200, 'stato e apertura non richiedono la revisione')
assert.equal(r.body.material.revision, 2)
assert.ok(r.body.material.openedAt)

// "Pronta" crea una versione fissa; export ne aggiunge un'altra
r = await call(materials, 'PATCH', '/api/materials', tb, { id: mat.id, status: 'pronta' })
assert.equal(r.body.material.currentVersion, 1)
r = await call(materials, 'POST', '/api/materials?action=version', tb, { id: mat.id, reason: 'export' })
assert.equal(r.body.versionNo, 2)
r = await call(materials, 'GET', `/api/materials?id=${mat.id}`, tb)
assert.deepEqual(r.body.versions.map((v) => v.reason), ['export', 'pronta'])
r = await call(materials, 'GET', `/api/materials?id=${mat.id}&version=1`, tb)
assert.equal(r.body.version.content.cells.length, 1)

// Obiettivi collegati; spostando la scheda i collegamenti si tolgono
r = await call(children, 'POST', '/api/children?resource=goals', ta, { childId: child.id, title: 'Vestirsi da solo' })
const goal2 = r.body.goal
r = await call(children, 'POST', '/api/children?resource=goals', ta, { childId: child2.id, title: 'Obiettivo di Luna' })
const goalLuna = r.body.goal
r = await call(materials, 'PATCH', '/api/materials', tb, { id: mat.id, goalIds: [goal2.id] })
assert.deepEqual(r.body.material.goalIds, [goal2.id])
r = await call(materials, 'PATCH', '/api/materials', tb, { id: mat.id, goalIds: [goalLuna.id] })
assert.equal(r.status, 404, 'obiettivo di un altro bambino')
r = await call(materials, 'GET', `/api/materials?id=${mat.id}`, tb)
assert.deepEqual(r.body.material.goalIds, [goal2.id], 'la richiesta fallita non cambia niente')
r = await call(materials, 'PATCH', '/api/materials', tb, { id: mat.id, childId: child2.id })
assert.equal(r.body.material.childId, child2.id)
assert.deepEqual(r.body.material.goalIds, [])

// Duplica (riparte da Da fare, appunti cifrati di nuovo), generici, liste
r = await call(materials, 'POST', '/api/materials?action=duplicate', tb, { id: mat.id })
const copy = r.body.material
assert.equal(copy.title, 'La mia mattina (copia)')
assert.equal(copy.status, 'da-fare')
assert.equal(copy.reminder, null)
assert.equal(copy.notes, 'Da plastificare')
r = await call(materials, 'POST', '/api/materials', ta, { title: 'Bozza', content: { template: 'routine-4' } })
const draft = r.body.material
assert.equal(draft.isGeneric, true)
assert.equal(draft.childId, null)
r = await call(materials, 'GET', '/api/materials?generic=1', tb)
assert.deepEqual(r.body.materials.map((m) => m.id), [draft.id])
assert.equal(r.body.materials[0].notes, '', 'appunti anche nell’elenco (vuoti per questa scheda)')
r = await call(materials, 'GET', `/api/materials?child=${child2.id}`, tb)
assert.equal(r.body.materials.length, 2)
r = await call(materials, 'GET', '/api/materials', tc)
assert.equal(r.body.materials.length, 0, 'altro centro')
r = await call(materials, 'POST', '/api/materials', tc, { childId: child.id, title: 'x', content: {} })
assert.equal(r.status, 404, 'C non crea materiali per bambini del centro 1')
r = await call(children, 'GET', '/api/children', ta)
assert.deepEqual(r.body.children.find((c) => c.id === child2.id).counts, { 'da-fare': 1, pronta: 1 })

// Cestino: l'operatore sposta, solo il titolare elimina per sempre
r = await call(materials, 'DELETE', `/api/materials?id=${copy.id}`, tb)
assert.equal(r.status, 403)
r = await call(materials, 'PATCH', '/api/materials', tb, { id: copy.id, trashed: true })
assert.ok(r.body.material.deletedAt)
r = await call(materials, 'GET', '/api/materials?trash=1', tb)
assert.deepEqual(r.body.materials.map((m) => m.id), [copy.id])
r = await call(materials, 'DELETE', `/api/materials?id=${copy.id}`, ta)
assert.equal(r.status, 200)
r = await call(children, 'PATCH', '/api/children', tb, { id: child2.id, trashed: true })
assert.ok(r.body.child.deletedAt)
r = await call(materials, 'GET', '/api/materials', tb)
assert.deepEqual(r.body.materials.map((m) => m.id), [draft.id], 'materiali di un bambino nel cestino nascosti')
r = await call(children, 'DELETE', `/api/children?id=${child2.id}`, tb)
assert.equal(r.status, 403)
r = await call(children, 'DELETE', `/api/children?id=${child2.id}`, ta)
assert.equal(r.status, 200)
const [{ n }] = await sql`select count(*)::int as n from app.materials where child_id = ${child2.id}`
assert.equal(n, 0, 'eliminando il bambino spariscono i suoi materiali')

// Registro: letture e modifiche, mai contenuti
const entries = await sql`select action, entity, details from app.audit_log where child_id = ${child.id} order by id`
assert.ok(entries.some((a) => a.action === 'legge' && a.entity === 'children'))
assert.ok(!JSON.stringify(entries).includes('Dinosauri') && !JSON.stringify(entries).includes('Sofi'))


// ——— Punto 4: appunti del bambino, id dall'app, generica/personalizzata, impostazioni del centro ———
const myChildId = globalThis.crypto.randomUUID()
r = await call(children, 'POST', '/api/children', tb, { id: myChildId, pseudonym: 'Riccio', notes: 'Preferisce i dinosauri' })
assert.equal(r.status, 200, JSON.stringify(r.body))
assert.equal(r.body.child.id, myChildId, 'id generato dall’app')
assert.equal(r.body.child.notes, 'Preferisce i dinosauri')
r = await call(children, 'POST', '/api/children', tb, { id: myChildId, pseudonym: 'Riccio' })
assert.equal(r.status, 409, 'stesso id due volte: già creato')
const [rawNotes] = await sql`select notes_enc from app.children where id = ${myChildId}`
assert.match(rawNotes.notes_enc, /^ev1:/)
r = await call(children, 'PATCH', '/api/children', tb, { id: myChildId, notes: 'Treni' })
assert.equal(r.body.child.notes, 'Treni')
r = await call(children, 'GET', '/api/children', tb)
assert.equal(r.body.children.find((c) => c.id === myChildId).notes, 'Treni', 'appunti anche nell’elenco')

const myMatId = globalThis.crypto.randomUUID()
r = await call(materials, 'POST', '/api/materials', tb, { id: myMatId, title: 'Generica', content: { template: 'routine-4' }, notes: 'nota' })
assert.equal(r.body.material.id, myMatId)
assert.equal(r.body.material.isGeneric, true)
r = await call(materials, 'GET', '/api/materials', tb)
assert.equal(r.body.materials.find((m) => m.id === myMatId).notes, 'nota', 'appunti anche nell’elenco')
r = await call(materials, 'PATCH', '/api/materials', tb, { id: myMatId, childId: myChildId })
assert.equal(r.body.material.isGeneric, false, 'spostata in un bambino: personalizzata')
r = await call(materials, 'PATCH', '/api/materials', tb, { id: myMatId, childId: null })
assert.equal(r.body.material.isGeneric, true, 'tolta dal bambino: generica')

r = await call(org, 'PATCH', '/api/organization', tb, { settings: { centerName: 'X' } })
assert.equal(r.status, 403, 'impostazioni del centro: solo il titolare')
r = await call(org, 'PATCH', '/api/organization', ta, { settings: { centerName: '  Centro Emovere ', uppercaseDefault: true, logo: 'javascript:alert(1)' } })
assert.equal(r.status, 400, 'logo non valido')
r = await call(org, 'PATCH', '/api/organization', ta, { settings: { centerName: '  Centro Emovere ', uppercaseDefault: true, logo: 'data:image/png;base64,AAAA', extra: 'no' } })
assert.deepEqual(r.body.settings, { logo: 'data:image/png;base64,AAAA', centerName: 'Centro Emovere', uppercaseDefault: true })
r = await call(me, 'GET', '/api/me', tb)
assert.equal(r.body.organization.settings.centerName, 'Centro Emovere', 'impostazioni visibili a tutto il centro')

// ——— Guida (OpenAI simulato) ———
const guideApi = await import('../.apitest/api/guide.js')
const realFetch = globalThis.fetch
const openaiCalls = []
process.env.OPENAI_API_KEY = 'test'
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.openai.com')) return realFetch(url, init)
  const body = JSON.parse(init.body)
  openaiCalls.push(body)
  const name = body.text.format.name
  const points = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`punto_${i + 1}`, `**Testo** ${i + 1}\n\n\n- riga`]))
  const value = name === 'guide' ? { famiglia: points, scuola: points } : { testo: 'Punto riscritto' }
  return new Response(
    JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
      usage: { input_tokens: 1000, output_tokens: 3000 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}
const input = { difficulty: 'Lancia gli oggetti quando deve smettere di giocare', goal: 'Accettare la fine del gioco', situations: '', ageBand: '3-5', familyLanguage: 'semplice' }

r = await call(guideApi, 'POST', '/api/guide', ta, { input: { ...input, goal: '' } })
assert.equal(r.status, 400)
r = await call(guideApi, 'POST', '/api/guide', ta, { input: { ...input, situations: 'scrivere a mamma@esempio.it' } })
assert.equal(r.status, 400)
assert.match(r.body.error, /indirizzo email/)
r = await call(guideApi, 'POST', '/api/guide', ta, { input: { ...input, difficulty: 'Stella lancia gli oggetti' } })
assert.equal(r.status, 400, 'pseudonimo di un bambino del centro')
assert.match(r.body.error, /Stella/)
r = await call(guideApi, 'POST', '/api/guide', ta, { input: { ...input, difficulty: 'Sofi lancia gli oggetti' } })
assert.equal(r.status, 400, 'nome sui materiali (cifrato) di un bambino del centro')
assert.equal(openaiCalls.length, 0, 'niente chiamate con dati identificativi')

r = await call(guideApi, 'POST', '/api/guide', tb, { input })
assert.equal(r.status, 200, JSON.stringify(r.body))
assert.equal(r.body.family.length, 10)
assert.equal(r.body.school.length, 10)
assert.equal(r.body.family[0], 'Testo 1\n\n- riga', 'testo ripulito')
assert.equal(openaiCalls[0].model, 'gpt-6.1-sol')
assert.equal(openaiCalls[0].store, false)
assert.equal(openaiCalls[0].input[1].content, 'Difficoltà osservata: Lancia gli oggetti quando deve smettere di giocare\nObiettivo: Accettare la fine del gioco\nFascia d\'età: 3-5 anni\nLinguaggio per la famiglia: semplice')
r = await call(guideApi, 'POST', '/api/guide', tb, { input, point: { version: 'scuola', index: 3, current: 'vecchio testo' } })
assert.equal(r.body.text, 'Punto riscritto')
assert.match(openaiCalls[1].input[1].content, /Versione attuale del punto:\nvecchio testo/)
r = await call(guideApi, 'POST', '/api/guide', tb, { input, point: { version: 'scuola', index: 3, current: 'chiamare il 333 1234567' } })
assert.equal(r.status, 400, 'anche il punto attuale si controlla')
const logged = await sql`select kind, fields_sent, model, input_tokens, output_tokens, cost_estimate_usd from app.ai_requests where model = 'gpt-6.1-sol' order by created_at`
assert.equal(logged.length, 2)
assert.deepEqual(logged[0].fields_sent, ['difficolta', 'obiettivo', 'fascia_eta', 'linguaggio'])
assert.deepEqual(logged[1].fields_sent, ['difficolta', 'obiettivo', 'fascia_eta', 'linguaggio', 'punto_attuale'])
assert.equal(Number(logged[0].cost_estimate_usd), 0.032)
assert.ok(!JSON.stringify(logged).includes('Lancia'), 'mai il contenuto nel registro')
// Limite giornaliero
process.env.AI_TEXT_LIMIT = '2'
r = await call(guideApi, 'POST', '/api/guide', tb, { input })
assert.equal(r.status, 429)
assert.match(r.body.error, /Limite giornaliero/)
delete process.env.AI_TEXT_LIMIT
// Senza centro: niente
r = await call(guideApi, 'POST', '/api/guide', await token('00000000-0000-0000-0000-0000000000dd'), { input })
assert.equal(r.status, 403)
globalThis.fetch = realFetch

// ——— Punto 6: esportazione, registro degli accessi, pulizia notturna ———
r = await call(children, 'GET', `/api/children?id=${child.id}&export=1`, tb)
assert.equal(r.status, 403, 'esportare: solo il titolare')
r = await call(children, 'GET', `/api/children?id=${child.id}&export=1`, tc)
assert.equal(r.status, 404, 'altro centro')
await sql`
  insert into app.observations (org_id, child_id, behavior_enc)
  select ${orgId}, ${child.id}, null`
r = await call(materials, 'POST', '/api/materials', tb, { childId: child.id, title: 'Per l’export', content: {}, notes: 'nota' })
await call(materials, 'PATCH', '/api/materials', tb, { id: r.body.material.id, status: 'pronta' })
r = await call(children, 'GET', `/api/children?id=${child.id}&export=1`, ta)
assert.equal(r.status, 200, JSON.stringify(r.body))
assert.equal(r.body.child.pseudonym, 'Stella')
assert.equal(r.body.child.realName, null)
assert.equal(r.body.profile[0].text, 'Dinosauri e treni', 'anche le voci archiviate')
assert.equal(r.body.goals[0].events[1].note, 'Tre settimane di fila')
const forExport = r.body.materials.find((m) => m.title === 'Per l’export')
assert.equal(forExport.notes, 'nota')
assert.equal(forExport.versions.length, 1, 'con le versioni fisse')
assert.ok(r.body.materials.every((m) => Array.isArray(m.versions) && typeof m.notes === 'string'))
assert.equal(r.body.observations.length, 1)
const [exported] = await sql`select user_id from app.audit_log where action = 'esporta' and child_id = ${child.id}`
assert.equal(exported.user_id, A, 'esportazione nel registro')

r = await call(org, 'GET', '/api/organization?resource=audit', tb)
assert.equal(r.status, 403, 'registro: solo il titolare')
r = await call(org, 'GET', '/api/organization?resource=audit&child=nonvalido', ta)
assert.equal(r.status, 400)
r = await call(org, 'GET', '/api/organization?resource=audit', ta)
assert.equal(r.status, 200)
const allEntries = r.body.entries
assert.ok(allEntries.length > 0 && allEntries.length <= 100)
assert.ok(allEntries.every((e, i) => i === 0 || Number(e.id) < Number(allEntries[i - 1].id)), 'dal più recente')
assert.equal(allEntries[0].action, 'esporta')
assert.deepEqual(allEntries[0].child, { id: child.id, code: 'B-0001', pseudonym: 'Stella' })
assert.equal(allEntries[0].user.name, 'Martina')
r = await call(org, 'GET', `/api/organization?resource=audit&user=${B}&action=legge`, ta)
assert.ok(r.body.entries.length > 0 && r.body.entries.every((e) => e.user.id === B && e.action === 'legge'))
r = await call(org, 'GET', `/api/organization?resource=audit&child=${child2.id}`, ta)
assert.ok(r.body.entries.length > 0, 'bambino eliminato: le righe restano')
assert.ok(r.body.entries.every((e) => e.child.id === child2.id && e.child.pseudonym === null))
// Pagine: "before" continua da dove si era arrivati
const [{ total }] = await sql`select count(*)::int as total from app.audit_log where org_id = ${orgId}`
let seen = 0
let before = null
for (;;) {
  r = await call(org, 'GET', `/api/organization?resource=audit${before ? `&before=${before}` : ''}`, ta)
  seen += r.body.entries.length
  if (!r.body.next) break
  before = r.body.next
}
assert.equal(seen, total, 'tutte le righe, pagina dopo pagina')
r = await call(org, 'GET', '/api/organization?resource=audit', tc)
assert.ok(r.body.entries.every((e) => e.child === null || e.child.id !== child.id), 'altro centro: non vede il registro del centro 1')

// Pulizia: solo con il CRON_SECRET
r = await call(org, 'GET', '/api/organization?action=purge', null)
assert.equal(r.status, 503, 'senza CRON_SECRET non parte')
process.env.CRON_SECRET = 'segreto-di-prova'
r = await call(org, 'GET', '/api/organization?action=purge', null, undefined, { authorization: 'Bearer sbagliato' })
assert.equal(r.status, 401)
r = await call(org, 'GET', '/api/organization?action=purge', ta)
assert.equal(r.status, 401, 'nemmeno con il token di un utente')
await sql`update app.materials set deleted_at = now() - interval '31 days' where id = ${myMatId}`
r = await call(org, 'GET', '/api/organization?action=purge', null, undefined, { authorization: 'Bearer segreto-di-prova' })
assert.equal(r.status, 200, JSON.stringify(r.body))
assert.deepEqual(r.body, { childrenDeleted: 0, materialsDeleted: 1 })
r = await call(org, 'GET', '/api/organization?resource=audit', ta)
assert.equal(r.body.entries[0].user, null, 'pulizia automatica: senza utente')
assert.equal(r.body.entries[0].details.automatico, true)
delete process.env.CRON_SECRET

// ——— Fase 1: collegamenti nello storico degli obiettivi ———
r = await call(children, 'POST', '/api/children?resource=goals', tb, { childId: child.id, title: 'Lavarsi le mani' })
const goalB = r.body.goal
assert.deepEqual(goalB.events.map((e) => e.kind), ['creato'], 'il nuovo obiettivo arriva con lo storico')
r = await call(children, 'PATCH', '/api/children?resource=goals', tb, { id: goalB.id, note: 'Inizia con il modello' })
assert.deepEqual(r.body.goal.events.map((e) => e.kind), ['creato', 'nota'])
assert.equal(r.body.goal.events[1].note, 'Inizia con il modello')
r = await call(materials, 'POST', '/api/materials', tb, { childId: child.id, title: 'Le mani pulite', content: {} })
const linkMat = r.body.material
r = await call(materials, 'PATCH', '/api/materials', tb, { id: linkMat.id, goalIds: [goal.id, goalB.id] })
assert.equal(r.status, 200, JSON.stringify(r.body))
assert.deepEqual(r.body.material.goalIds.sort(), [goal.id, goalB.id].sort())
assert.deepEqual(
  r.body.goalEvents.map((g) => [g.goalId, g.event.materialAction, g.event.materialTitle]).sort(),
  [[goal.id, 'collegato', 'Le mani pulite'], [goalB.id, 'collegato', 'Le mani pulite']].sort(),
)
r = await call(materials, 'PATCH', '/api/materials', tb, { id: linkMat.id, goalIds: [goalB.id] })
assert.deepEqual(r.body.goalEvents.map((g) => [g.goalId, g.event.materialAction]), [[goal.id, 'scollegato']], 'solo ciò che cambia')
r = await call(materials, 'PATCH', '/api/materials', tb, { id: linkMat.id, goalIds: [goalB.id] })
assert.deepEqual(r.body.goalEvents, [], 'nessun cambiamento, nessun evento')
r = await call(children, 'GET', `/api/children?id=${child.id}`, tb)
const historyB = r.body.goals.find((g) => g.id === goalB.id).events
assert.deepEqual(historyB.map((e) => e.materialAction ?? e.kind), ['creato', 'nota', 'collegato'])
// Spostata in un altro bambino: scollegata (nello storico) e senza obiettivi
r = await call(materials, 'PATCH', '/api/materials', tb, { id: linkMat.id, childId: myChildId })
assert.deepEqual(r.body.goalEvents.map((g) => [g.goalId, g.event.materialAction]), [[goalB.id, 'scollegato']])
assert.deepEqual(r.body.material.goalIds, [])
// Obiettivo di un altro bambino: rifiutato, niente storico
r = await call(materials, 'PATCH', '/api/materials', tb, { id: linkMat.id, goalIds: [goalB.id] })
assert.equal(r.status, 404)
const [{ links }] = await sql`select count(*)::int as links from app.goal_events where kind = 'materiale' and goal_id = ${goalB.id}`
assert.equal(links, 2)
r = await call(children, 'GET', `/api/children?id=${child.id}&export=1`, ta)
assert.ok(r.body.goals.find((g) => g.id === goalB.id).events.some((e) => e.materialTitle === 'Le mani pulite'), 'anche nell’esportazione')

console.log('API: tutti i test superati')
await sql.end()
server.close()
process.exit(0)
