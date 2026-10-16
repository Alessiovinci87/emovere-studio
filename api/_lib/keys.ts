// Chiave dati del centro e cifratura dei singoli campi.
// Il contesto di ogni valore è "{tabella}.{colonna}:{id riga}": un valore spostato in un'altra riga
// o colonna non si decifra (vedi crypto.ts).
import { decryptField, encryptField, unwrapDek } from './crypto.js'
import type { Tx } from './db.js'

export type Sealer = {
  seal: (value: string | null | undefined, table: string, column: string, id: string) => string | null | undefined
  open: (value: string | null, table: string, column: string, id: string) => string | null
}

/** Cifra e decifra con la chiave del centro (letta una volta per richiesta, sotto RLS). */
export async function sealerFor(tx: Tx, orgId: string): Promise<Sealer> {
  const [row] = await tx<{ dek_wrapped: string; dek_key_version: number }[]>`
    select dek_wrapped, dek_key_version from app.organizations where id = ${orgId}`
  if (!row) throw new Error('Centro non leggibile')
  const dek = unwrapDek(row.dek_wrapped)
  const context = (table: string, column: string, id: string) => `${table}.${column}:${id}`
  return {
    // undefined resta undefined (campo non modificato); null o vuoto = nessun valore
    seal: (value, table, column, id) =>
      value === undefined ? undefined : value ? encryptField(dek, value, context(table, column, id), row.dek_key_version) : null,
    open: (value, table, column, id) => (value ? decryptField(dek, value, context(table, column, id)) : null),
  }
}
