// /api/organization — impostazioni del centro riservate al titolare, registro degli accessi, pulizia notturna.
//   PATCH { privacyVerified?: boolean, dataController?: string, settings?: {…} } → { privacyVerifiedAt, dataController, settings }
//   GET ?resource=audit [&before={id}&child={id}&user={id}&action=…] → { entries, next }  (solo titolare, 100 per volta)
//   GET ?action=purge  → { childrenDeleted, materialsDeleted }  solo Vercel Cron (Authorization: Bearer CRON_SECRET)
// settings: impostazioni dell'app per tutto il centro (logo come immagine PNG ridotta, nome del centro, stampatello).
// "Privacy verificata" si attiva solo dopo il parere del consulente (vedi CLAUDE.md, prerequisiti):
// finché è spenta l'app mostra l'avviso "Solo dati di prova".
import { timingSafeEqual } from 'node:crypto'
import { env, requireUser } from './_lib/auth.js'
import { asSystem, asUser, audit, requireMembership } from './_lib/db.js'
import { UserError, handle, json } from './_lib/http.js'
import { isUuid } from './_lib/input.js'

const AUDIT_ACTIONS = ['crea', 'legge', 'modifica', 'esporta', 'elimina', 'ripristina', 'importa']
const AUDIT_PAGE = 100

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const params = new URL(request.url).searchParams
    if (params.get('action') === 'purge') return json(await purge(request))
    if (params.get('resource') !== 'audit') throw new UserError('Richiesta non valida.')

    const user = await requireUser(request)
    const before = params.get('before')
    const child = params.get('child')
    const member = params.get('user')
    const action = params.get('action')
    if ((before !== null && !/^\d{1,18}$/.test(before)) || (child !== null && !isUuid(child)) || (member !== null && !isUuid(member))) {
      throw new UserError('Richiesta non valida.')
    }
    if (action !== null && !AUDIT_ACTIONS.includes(action)) throw new UserError('Richiesta non valida.')

    return json(
      await asUser(user.id, async (tx) => {
        const { orgId } = await requireMembership(tx, user.id, 'titolare')
        const rows = await tx<
          {
            id: string
            created_at: Date
            action: string
            entity: string
            entity_id: string | null
            child_id: string | null
            user_id: string | null
            details: Record<string, unknown>
            child_code: string | null
            child_pseudonym: string | null
            user_name: string | null
          }[]
        >`
          select a.id::text, a.created_at, a.action, a.entity, a.entity_id, a.child_id, a.user_id, a.details,
                 c.code as child_code, c.pseudonym as child_pseudonym,
                 coalesce(nullif(m.display_name, ''), m.email) as user_name
          from app.audit_log a
          left join app.children c on c.id = a.child_id
          left join app.memberships m on m.org_id = a.org_id and m.user_id = a.user_id
          where a.org_id = ${orgId}
            ${before === null ? tx`` : tx`and a.id < ${before}`}
            ${child === null ? tx`` : tx`and a.child_id = ${child}`}
            ${member === null ? tx`` : tx`and a.user_id = ${member}`}
            ${action === null ? tx`` : tx`and a.action = ${action}`}
          order by a.id desc
          limit ${AUDIT_PAGE + 1}`
        const page = rows.slice(0, AUDIT_PAGE)
        return {
          entries: page.map((r) => ({
            id: r.id,
            at: r.created_at,
            action: r.action,
            entity: r.entity,
            entityId: r.entity_id,
            // Bambino eliminato: resta solo l'identificativo
            child: r.child_id ? { id: r.child_id, code: r.child_code, pseudonym: r.child_pseudonym } : null,
            // null = pulizia automatica; name null = persona non più nel centro
            user: r.user_id ? { id: r.user_id, name: r.user_name } : null,
            details: r.details,
          })),
          next: rows.length > AUDIT_PAGE ? page[page.length - 1].id : null,
        }
      }),
    )
  })
}

/** Pulizia notturna del cestino (vercel.json → crons). Vercel manda il CRON_SECRET come token. */
async function purge(request: Request) {
  const expected = Buffer.from(`Bearer ${env('CRON_SECRET')}`)
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UserError('Non autorizzato.', 401)
  const [row] = await asSystem((tx) => tx<{ children_deleted: number; materials_deleted: number }[]>`
    select * from private.purge_deleted(30)`)
  return { childrenDeleted: row.children_deleted, materialsDeleted: row.materials_deleted }
}

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
