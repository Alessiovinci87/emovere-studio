// /api/setup — crea il primo centro e rende titolare chi lo crea (una sola volta: poi solo inviti).
//   POST { name, displayName } → { organizationId }
import { requireUser } from './_lib/auth.js'
import { newWrappedDek } from './_lib/crypto.js'
import { asUser, audit } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as { name?: unknown; displayName?: unknown } | null
    const name = clean(body?.name, 120)
    const displayName = clean(body?.displayName, 80) || null
    if (!name) throw new UserError('Scrivi il nome del centro.')

    const organizationId = await asUser(user.id, async (tx) => {
      const [{ id }] = await tx<{ id: string }[]>`
        select app.create_organization(${name}, ${newWrappedDek()}, ${user.email}, ${displayName}) as id`
      await audit(tx, { orgId: id, action: 'crea', entity: 'organizations', entityId: id })
      return id
    })
    return json({ organizationId })
  })
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
