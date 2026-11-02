import { useEffect, useState } from 'react'
import { materialsApi, shareUrl, type MaterialShare } from '../lib/materials'
import { longDate } from '../lib/childApi'
import { Modal } from './Modal'
import { Button } from './ui'

// Link per la famiglia: il PDF WhatsApp della scheda, apribile senza account da chi ha il link.
// Il link scade (7 o 30 giorni) e si può revocare; se la scheda va nel cestino smette di funzionare.
// Il PDF è quello del momento: se la scheda cambia, serve un nuovo link.

export function ShareDialog({
  materialId,
  testData,
  makePdf,
  onClose,
}: {
  materialId: string
  /** "Privacy verificata" non attiva: solo dati di prova */
  testData: boolean
  /** PDF WhatsApp della scheda come data URL */
  makePdf: () => Promise<string>
  onClose: () => void
}) {
  const [days, setDays] = useState<7 | 30>(7)
  const [shares, setShares] = useState<MaterialShare[] | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    materialsApi
      .shares(materialId)
      .then(setShares)
      .catch(() => setShares([]))
  }, [materialId])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const pdf = await makePdf()
      const { token, share } = await materialsApi.share(materialId, pdf, days)
      setCreated(shareUrl(token))
      setCopied(false)
      setShares((list) => [...(list ?? []), share])
    } catch (err) {
      const message = (err as Error).message
      setError(
        message.includes('non trovata')
          ? 'La scheda si sta ancora salvando: riprova tra qualche secondo.'
          : message.includes('vignette')
            ? message
            : message || 'Non è stato possibile creare il link.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revocare il link? Chi lo apre non vedrà più la scheda.')) return
    try {
      await materialsApi.revokeShare(materialId, id)
      setShares((list) => (list ?? []).filter((s) => s.id !== id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal title="Link per la famiglia" onClose={busy ? undefined : onClose} size="sm">
      <div className="flex flex-col gap-4">
        <p className="leading-relaxed text-muted">
          La famiglia (o la scuola) apre la scheda in PDF dal telefono, senza account. È la scheda di adesso: se la modifichi, crea un nuovo
          link.
        </p>
        {testData && (
          <p className="rounded-2xl bg-butter p-4 text-sm leading-relaxed">
            <strong>Solo dati di prova.</strong> Finché il centro non ha attivato “Privacy verificata”, non mandare link a famiglie vere.
          </p>
        )}
        <p className="rounded-2xl bg-cream p-4 text-sm leading-relaxed">
          Chiunque abbia il link può aprire la scheda finché non scade: mandalo solo alla famiglia, in privato. Il nome sulla scheda è quello
          che vedi nel PDF.
        </p>

        {created ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
            <span className="text-sm font-bold">Ecco il link</span>
            <input readOnly value={created} onFocus={(e) => e.target.select()} className="rounded-xl bg-cream px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-2">
              <Button tone="primary" onClick={() => void copy()}>
                {copied ? 'Copiato ✓' : 'Copia il link'}
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Ecco la scheda da usare a casa: ${created}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-full bg-accent-soft px-4 font-bold text-accent"
              >
                Manda con WhatsApp
              </a>
            </div>
            <span className="text-xs text-muted">Il link si vede solo adesso: se lo perdi, revocalo e creane un altro.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold">Valido per</span>
              {([7, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  className={`min-h-11 rounded-full px-4 font-bold ${days === d ? 'bg-accent text-white' : 'bg-cream'}`}
                >
                  {d} giorni
                </button>
              ))}
            </div>
            <Button tone="primary" disabled={busy} onClick={() => void create()}>
              {busy ? 'Preparo il PDF…' : 'Crea il link'}
            </Button>
          </div>
        )}

        {error && <p className="text-sm font-bold text-[#b5513a]">{error}</p>}

        {shares && shares.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">Link attivi di questa scheda</span>
            <ul className="flex flex-col gap-1.5">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-3 py-2 text-sm">
                  <span>
                    Creato il {longDate(s.createdAt.slice(0, 10))} · scade il {longDate(s.expiresAt.slice(0, 10))}
                  </span>
                  <button onClick={() => void revoke(s.id)} className="min-h-11 shrink-0 font-bold text-[#b5513a]">
                    Revoca
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button disabled={busy} onClick={onClose}>
            Chiudi
          </Button>
        </div>
      </div>
    </Modal>
  )
}
