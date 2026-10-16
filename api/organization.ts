// /api/organization — impostazioni del centro riservate al titolare.
//   PATCH { privacyVerified?: boolean, dataController?: string } → { privacyVerifiedAt, dataController }
// "Privacy verificata" si attiva solo dopo il parere del consulente (vedi CLAUDE.md, prerequisiti):
// finché è spenta l'app mostra l'avviso "Solo dati di prova".
import { requireUser } from './_lib/auth.js'
import { asUser, audit, requireMembership } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as { privacyVerified?: unknown; dataController?: unknown } | null
    const privacy = typeof body?.privacyVerified === 'boolean' ? body.privacyVerified : undefined
    const controller = typeof body?.dataController === 'string' ? body.dataController.trim().slice(0, 200) : undefined
    if (privacy === undefined && controller === undefined) throw new UserError('Richiesta non valida.')

    return json(
      await asUser(user.id, async (tx) => {
        const { orgId } = await requireMembership(tx, user.id, 'titolare')
        const [row] = await tx<{ privacy_verified_at: Date | null; data_controller: string | null }[]>`
          update app.organizations set
            privacy_verified_at = ${privacy === undefined ? tx`privacy_verified_at` : privacy ? tx`now()` : null},
            data_controller = ${controller === undefined ? tx`data_controller` : controller || null}
          where id = ${orgId}
          returning privacy_verified_at, data_controller`
        if (!row) throw new UserError('Questa operazione è riservata al titolare.', 403)
        await audit(tx, {
          orgId,
          action: 'modifica',
          entity: 'organizations',
          entityId: orgId,
          details: { fields: [...(privacy === undefined ? [] : ['privacy_verified_at']), ...(controller === undefined ? [] : ['data_controller'])] },
        })
        return { privacyVerifiedAt: row.privacy_verified_at?.toISOString() ?? null, dataController: row.data_controller }
      }),
    )
  })
}
