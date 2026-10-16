// /api/me — chi sono e in quale centro.
//   GET → { user, organization | null, setupAvailable }
//   setupAvailable = nessun centro esiste ancora: l'app propone "Crea il centro"
import { requireUser } from './_lib/auth.js'
import { asUser } from './_lib/db.js'
import { handle, json } from './_lib/http.js'

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    return json(
      await asUser(user.id, async (tx) => {
        const [org] = await tx<
          {
            id: string
            name: string
            data_controller: string | null
            privacy_verified_at: Date | null
            role: 'titolare' | 'operatore'
            display_name: string | null
          }[]
        >`
          select o.id, o.name, o.data_controller, o.privacy_verified_at, m.role, m.display_name
          from app.memberships m join app.organizations o on o.id = m.org_id
          where m.user_id = ${user.id}
          order by m.created_at
          limit 1`
        const [{ available }] = await tx<{ available: boolean }[]>`select app.setup_available() as available`
        return {
          user: { id: user.id, email: user.email },
          organization: org
            ? {
                id: org.id,
                name: org.name,
                dataController: org.data_controller,
                privacyVerifiedAt: org.privacy_verified_at?.toISOString() ?? null,
                role: org.role,
                displayName: org.display_name,
              }
            : null,
          setupAvailable: available,
        }
      }),
    )
  })
}
