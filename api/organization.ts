// /api/organization — impostazioni del centro riservate al titolare.
//   PATCH { privacyVerified?: boolean, dataController?: string, settings?: {…} } → { privacyVerifiedAt, dataController, settings }
// settings: impostazioni dell'app per tutto il centro (logo come immagine PNG ridotta, nome del centro, stampatello).
// "Privacy verificata" si attiva solo dopo il parere del consulente (vedi CLAUDE.md, prerequisiti):
// finché è spenta l'app mostra l'avviso "Solo dati di prova".
import { requireUser } from './_lib/auth.js'
import { asUser, audit, requireMembership } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const body = (await request.json().catch(() => null)) as { privacyVerified?: unknown; dataController?: unknown; settings?: unknown } | null
    const privacy = typeof body?.privacyVerified === 'boolean' ? body.privacyVerified : undefined
    const controller = typeof body?.dataController === 'string' ? body.dataController.trim().slice(0, 200) : undefined
    const settings = body?.settings === undefined ? undefined : cleanSettings(body.settings)
    if (privacy === undefined && controller === undefined && settings === undefined) throw new UserError('Richiesta non valida.')

    return json(
      await asUser(user.id, async (tx) => {
        const { orgId } = await requireMembership(tx, user.id, 'titolare')
        const [row] = await tx<{ privacy_verified_at: Date | null; data_controller: string | null; settings: Record<string, unknown> }[]>`
          update app.organizations set
            privacy_verified_at = ${privacy === undefined ? tx`privacy_verified_at` : privacy ? tx`now()` : null},
            data_controller = ${controller === undefined ? tx`data_controller` : controller || null},
            settings = ${settings === undefined ? tx`settings` : tx.json(settings as never)}
          where id = ${orgId}
          returning privacy_verified_at, data_controller, settings`
        if (!row) throw new UserError('Questa operazione è riservata al titolare.', 403)
        await audit(tx, {
          orgId,
          action: 'modifica',
          entity: 'organizations',
          entityId: orgId,
          details: {
            fields: [
              ...(privacy === undefined ? [] : ['privacy_verified_at']),
              ...(controller === undefined ? [] : ['data_controller']),
              ...(settings === undefined ? [] : ['settings']),
            ],
          },
        })
        return { privacyVerifiedAt: row.privacy_verified_at?.toISOString() ?? null, dataController: row.data_controller, settings: row.settings }
      }),
    )
  })
}

/** Impostazioni del centro: solo i campi noti, logo come data URL PNG/JPEG di dimensioni contenute. */
function cleanSettings(value: unknown): Record<string, unknown> {
  const v = value as { logo?: unknown; centerName?: unknown; uppercaseDefault?: unknown } | null
  if (!v || typeof v !== 'object') throw new UserError('Impostazioni non valide.')
  const logo = v.logo === null || v.logo === undefined ? null : v.logo
  if (logo !== null && (typeof logo !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(logo) || logo.length > 1_500_000)) {
    throw new UserError('Logo non valido o troppo grande.')
  }
  return {
    logo,
    centerName: typeof v.centerName === 'string' ? v.centerName.trim().slice(0, 80) : '',
    uppercaseDefault: v.uppercaseDefault === true,
  }
}
