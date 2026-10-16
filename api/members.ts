// /api/members — membri del centro. L'elenco lo vedono tutti; il resto è riservato al titolare.
//   GET                                         → { members }
//   POST   { email, role, displayName }         → invita (email di Supabase Auth) e aggiunge al centro
//   POST   { action: 'reset-mfa', userId }      → azzera il secondo fattore (telefono perso)
//   PATCH  { userId, role?, displayName? }      → cambia ruolo o nome
//   DELETE ?user={id}                           → toglie dal centro
// Un membro tolto può ancora accedere, ma non vede più nessun dato (nessun centro).
import { adminAuth, requireUser } from './_lib/auth.js'
import { asUser, audit, requireMembership } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'

type Role = 'titolare' | 'operatore'

interface MemberRow {
  user_id: string
  email: string | null
  display_name: string | null
  role: Role
  created_at: Date
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const { role, rows } = await asUser(user.id, async (tx) => {
      const { orgId, role } = await requireMembership(tx, user.id)
      const rows = await tx<MemberRow[]>`
        select user_id, email, display_name, role, created_at from app.memberships
        where org_id = ${orgId} order by role desc, created_at`
      return { role, rows }
    })
    // Solo il titolare vede invito in attesa e secondo fattore (servono le API di amministrazione)
    const admin = role === 'titolare' ? adminAuth() : null
    const members = await Promise.all(
      rows.map(async (row) => {
        const base = {
          userId: row.user_id,
          email: row.email,
          displayName: row.display_name,
          role: row.role,
          createdAt: row.created_at.toISOString(),
        }
        if (!admin) return base
        const { data } = await admin.getUserById(row.user_id)
        return {
          ...base,
          pending: !data.user?.last_sign_in_at,
          mfa: (data.user?.factors ?? []).some((f) => f.status === 'verified'),
        }
      }),
    )
    return json({ members })
  })
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (body?.action === 'reset-mfa') return resetMfa(user.id, String(body.userId ?? ''))

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = parseRole(body?.role)
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 80) || null : null
    if (!EMAIL.test(email) || email.length > 320) throw new UserError('Scrivi un indirizzo email valido.')
    if (!role) throw new UserError('Scegli il ruolo: titolare o operatore.')

    // Prima i permessi, poi l'email: un operatore non deve poter far partire inviti
    const { orgId } = await asUser(user.id, (tx) => requireMembership(tx, user.id, 'titolare'))

    const admin = adminAuth()
    const { data, error } = await admin.inviteUserByEmail(email, { data: { display_name: displayName } })
    if (error || !data.user) {
      if (error?.code === 'email_exists') {
        throw new UserError('Questa email ha già un account. Se fa già parte del centro, la trovi nell’elenco.', 409)
      }
      if (error?.code === 'over_email_send_rate_limit') {
        throw new UserError('Troppe email inviate in poco tempo. Riprova tra qualche minuto.', 429)
      }
      console.error('invito non riuscito', error)
      throw new UserError('Invito non riuscito. Controlla l’indirizzo e riprova.', 502)
    }
    const invited = data.user

    try {
      await asUser(user.id, async (tx) => {
        await tx`
          insert into app.memberships (org_id, user_id, role, display_name, email)
          values (${orgId}, ${invited.id}, ${role}, ${displayName}, ${email})`
        await audit(tx, { orgId, action: 'crea', entity: 'memberships', entityId: invited.id, details: { role } })
      })
    } catch (err) {
      // Account appena creato ma non collegato al centro: lo si toglie, così l'invito si può ripetere
      await admin.deleteUser(invited.id).catch(() => undefined)
      throw err
    }
    return json({ ok: true })
  })
}

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const userId = String(body?.userId ?? '')
    if (!UUID.test(userId)) throw new UserError('Richiesta non valida.')
    const role = body?.role === undefined ? undefined : parseRole(body.role)
    if (role === null) throw new UserError('Scegli il ruolo: titolare o operatore.')
    const displayName =
      typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 80) || null : undefined

    await asUser(user.id, async (tx) => {
      const { orgId } = await requireMembership(tx, user.id, 'titolare')
      const updated = await tx`
        update app.memberships set
          role = ${role === undefined ? tx`role` : role},
          display_name = ${displayName === undefined ? tx`display_name` : displayName}
        where org_id = ${orgId} and user_id = ${userId}
        returning user_id`
      if (updated.length === 0) throw new UserError('Questa persona non fa parte del centro.', 404)
      await audit(tx, { orgId, action: 'modifica', entity: 'memberships', entityId: userId, details: { role: role ?? null } })
    })
    return json({ ok: true })
  })
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const userId = new URL(request.url).searchParams.get('user') ?? ''
    if (!UUID.test(userId)) throw new UserError('Richiesta non valida.')
    await asUser(user.id, async (tx) => {
      const { orgId } = await requireMembership(tx, user.id, 'titolare')
      const removed = await tx`delete from app.memberships where org_id = ${orgId} and user_id = ${userId} returning user_id`
      if (removed.length === 0) throw new UserError('Questa persona non fa parte del centro.', 404)
      await audit(tx, { orgId, action: 'elimina', entity: 'memberships', entityId: userId })
    })
    return json({ ok: true })
  })
}

async function resetMfa(ownerId: string, userId: string): Promise<Response> {
  if (!UUID.test(userId)) throw new UserError('Richiesta non valida.')
  const orgId = await asUser(ownerId, async (tx) => {
    const { orgId } = await requireMembership(tx, ownerId, 'titolare')
    const [member] = await tx`select 1 from app.memberships where org_id = ${orgId} and user_id = ${userId}`
    if (!member) throw new UserError('Questa persona non fa parte del centro.', 404)
    return orgId
  })
  const admin = adminAuth()
  const { data, error } = await admin.mfa.listFactors({ userId })
  if (error) throw new UserError('Non è stato possibile leggere il secondo fattore. Riprova.', 502)
  for (const factor of data.factors) {
    const { error: deleteError } = await admin.mfa.deleteFactor({ userId, id: factor.id })
    if (deleteError) throw new UserError('Non è stato possibile azzerare il secondo fattore. Riprova.', 502)
  }
  await asUser(ownerId, (tx) =>
    audit(tx, { orgId, action: 'modifica', entity: 'memberships', entityId: userId, details: { mfa: 'azzerata' } }),
  )
  return json({ ok: true })
}

function parseRole(value: unknown): Role | null {
  return value === 'titolare' || value === 'operatore' ? value : null
}
