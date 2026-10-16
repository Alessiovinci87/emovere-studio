// Database (Supabase Postgres) dalle funzioni /api.
// Ogni operazione gira in una transazione con il ruolo emovere_app e l'utente verificato:
// la Row Level Security decide cosa si vede, anche se il codice del server sbagliasse una query.
import postgres from 'postgres'
import { env } from './auth.js'
import { UserError } from './http.js'

export type Tx = postgres.TransactionSql

let sql: postgres.Sql | null = null

function client(): postgres.Sql {
  // Pooler di Supabase in modalità transaction (porta 6543): niente prepared statement
  sql ??= postgres(env('DATABASE_URL'), { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 })
  return sql
}

export async function asUser<T>(userId: string, run: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return (await client().begin(async (tx) => {
      await tx`set local role emovere_app`
      await tx`select set_config('app.user_id', ${userId}, true)`
      return run(tx)
    })) as T
  } catch (err) {
    // Errori con messaggio in italiano sollevati dalle funzioni del database (raise exception)
    const code = (err as { code?: string }).code
    if (code === 'P0001' || code === 'P0002') throw new UserError((err as Error).message, 409)
    if (code === '42501') throw new UserError('Non hai i permessi per questa operazione.', 403)
    // Chiave esterna: collegamento a qualcosa di un altro centro o di un altro bambino, o già eliminato
    if (code === '23503') throw new UserError('Elemento collegato non trovato.', 404)
    if (code === '23505') throw new UserError('Esiste già.', 409)
    if (code === '23514') throw new UserError('Dati non validi.', 400)
    throw err
  }
}

export interface Membership {
  orgId: string
  role: 'titolare' | 'operatore'
}

/** Centro dell'utente (per ora uno solo per account). */
export async function membershipOf(tx: Tx, userId: string): Promise<Membership | null> {
  const [row] = await tx<{ org_id: string; role: Membership['role'] }[]>`
    select org_id, role from app.memberships where user_id = ${userId} order by created_at limit 1`
  return row ? { orgId: row.org_id, role: row.role } : null
}

export async function requireMembership(tx: Tx, userId: string, role?: Membership['role']): Promise<Membership> {
  const membership = await membershipOf(tx, userId)
  if (!membership) throw new UserError('Il tuo account non fa parte di nessun centro.', 403)
  if (role && membership.role !== role) throw new UserError('Questa operazione è riservata al titolare.', 403)
  return membership
}

/** Registro degli accessi: solo identificativi e nomi dei campi, mai contenuti. */
export async function audit(
  tx: Tx,
  entry: { orgId: string; action: string; entity: string; entityId?: string | null; childId?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await tx`
    insert into app.audit_log (org_id, action, entity, entity_id, child_id, details)
    values (${entry.orgId}, ${entry.action}, ${entry.entity}, ${entry.entityId ?? null}, ${entry.childId ?? null},
            ${tx.json((entry.details ?? {}) as postgres.JSONValue)})`
}
