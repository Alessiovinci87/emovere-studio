import { useCallback, useEffect, useState } from 'react'
import type { Session } from '../AuthGate'
import { accountApi, type Member, type Role } from '../lib/account'
import { authMessage, passwordProblem, supabase } from '../lib/supabase'
import { Button, inputClass } from './ui'

// Impostazioni legate al login: account, membri del centro, "Privacy verificata".

const roleLabel: Record<Role, string> = { titolare: 'Titolare', operatore: 'Operatore' }

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm font-bold text-[#a2472f]">
      {children}
    </p>
  )
}

export function AccountPanel({ session }: { session: Session }) {
  const account = session.account!
  const org = account.organization!
  const [changing, setChanging] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password) ?? (password !== repeat ? 'Le due password non sono uguali.' : null)
    if (problem) return setMessage({ error: true, text: problem })
    setBusy(true)
    const { error } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMessage({ error: true, text: authMessage(error) })
    setChanging(false)
    setPassword('')
    setRepeat('')
    setMessage({ error: false, text: 'Password cambiata.' })
  }

  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Email</dt>
        <dd className="break-all font-bold">{account.user.email}</dd>
        {org.displayName && (
          <>
            <dt className="text-muted">Nome</dt>
            <dd className="font-bold">{org.displayName}</dd>
          </>
        )}
        <dt className="text-muted">Centro</dt>
        <dd className="font-bold">
          {org.name} · {roleLabel[org.role]}
        </dd>
        <dt className="text-muted">Verifica</dt>
        <dd className="font-bold">Codice sul telefono attivo</dd>
      </dl>
      {changing ? (
        <form onSubmit={savePassword} className="flex flex-col gap-3">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nuova password"
            aria-label="Nuova password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Ripeti la nuova password"
            aria-label="Ripeti la nuova password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className={inputClass}
            required
          />
          <p className="text-xs text-muted">Almeno 12 caratteri, con maiuscole, minuscole e numeri.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" tone="primary" disabled={busy}>
              Salva
            </Button>
            <Button type="button" onClick={() => setChanging(false)}>
              Annulla
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button tone="soft" onClick={() => (setChanging(true), setMessage(null))}>
            Cambia password
          </Button>
          <Button onClick={() => void session.signOut()}>Esci</Button>
        </div>
      )}
      {message && (message.error ? <ErrorText>{message.text}</ErrorText> : <p className="text-sm font-bold">{message.text}</p>)}
    </>
  )
}

export function MembersPanel({ session }: { session: Session }) {
  const me = session.account!.user.id
  const isOwner = session.account!.organization!.role === 'titolare'
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('operatore')

  const load = useCallback(async () => {
    try {
      setMembers(await accountApi.members())
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])
  useEffect(() => void load(), [load])

  async function act(action: () => Promise<unknown>, done?: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (done) setNotice(done)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {members === null && !error && <p className="text-muted">Caricamento…</p>}
      {members && (
        <ul className="flex flex-col divide-y divide-line/70">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold">
                  {m.displayName || m.email}
                  {m.userId === me && <span className="font-normal text-muted"> (tu)</span>}
                </span>
                {m.displayName && <span className="truncate text-sm text-muted">{m.email}</span>}
                {isOwner && (
                  <span className="text-xs text-muted">
                    {m.pending ? 'Invito in attesa' : m.mfa ? 'Codice sul telefono attivo' : 'Codice sul telefono da attivare'}
                  </span>
                )}
              </span>
              {isOwner && m.userId !== me ? (
                <span className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Ruolo di ${m.displayName || m.email}`}
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => void act(() => accountApi.updateMember(m.userId, { role: e.target.value as Role }))}
                    className={`${inputClass} w-auto py-1 text-sm`}
                  >
                    <option value="operatore">Operatore</option>
                    <option value="titolare">Titolare</option>
                  </select>
                  {m.mfa && (
                    <Button
                      small
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Azzerare il codice sul telefono di ${m.displayName || m.email}? Al prossimo accesso lo attiverà di nuovo.`))
                          void act(() => accountApi.resetMfa(m.userId), 'Codice azzerato.')
                      }}
                    >
                      Azzera codice
                    </Button>
                  )}
                  <Button
                    small
                    tone="danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Togliere ${m.displayName || m.email} dal centro? Non vedrà più nessun dato.`))
                        void act(() => accountApi.removeMember(m.userId))
                    }}
                  >
                    Togli
                  </Button>
                </span>
              ) : (
                <span className="text-sm font-bold text-muted">{roleLabel[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <form
          className="flex flex-col gap-3 rounded-2xl bg-cream p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void act(async () => {
              await accountApi.invite(email.trim(), role, name.trim())
              setEmail('')
              setName('')
            }, `Invito mandato a ${email.trim()}. Il link vale 24 ore.`)
          }}
        >
          <p className="font-bold">Invita una persona</p>
          <input
            type="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            required
          />
          <input
            placeholder="Nome (facoltativo)"
            aria-label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={inputClass}
          />
          <select aria-label="Ruolo" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            <option value="operatore">Operatore: lavora su bambini, materiali e osservazioni</option>
            <option value="titolare">Titolare: in più gestisce membri, privacy ed eliminazioni</option>
          </select>
          <Button type="submit" tone="primary" disabled={busy} className="self-start">
            Manda l’invito
          </Button>
        </form>
      )}
      {notice && <p className="text-sm font-bold">{notice}</p>}
      {error && <ErrorText>{error}</ErrorText>}
    </>
  )
}

export function PrivacyVerifiedPanel({ session }: { session: Session }) {
  const org = session.account!.organization!
  const verified = Boolean(org.privacyVerifiedAt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    const question = verified
      ? 'Spegnere “Privacy verificata”? Tornerà l’avviso “Solo dati di prova”.'
      : 'Confermi che sono fatti tutti i prerequisiti?\n\n' +
        '• Supabase Pro e Vercel Pro\n' +
        '• DPA firmati (Supabase, OpenAI e fornitore dei testi)\n' +
        '• Parere del consulente privacy (informativa e consenso dei genitori, registro dei trattamenti, DPIA)\n' +
        '• Nuova password del database Supabase\n\n' +
        'Da questo momento si potranno inserire dati reali.'
    if (!confirm(question)) return
    setBusy(true)
    setError(null)
    try {
      await accountApi.setPrivacyVerified(!verified)
      await session.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="text-sm">
        <span className="text-muted">Titolare del trattamento: </span>
        <span className="font-bold">{org.dataController || 'da indicare'}</span>
      </p>
      <p className="text-sm font-bold">
        {verified
          ? `Privacy verificata il ${new Date(org.privacyVerifiedAt!).toLocaleDateString('it-IT', { dateStyle: 'long' })}.`
          : 'Privacy non ancora verificata: usa solo dati di prova.'}
      </p>
      {org.role === 'titolare' ? (
        <Button tone={verified ? 'ghost' : 'soft'} disabled={busy} onClick={() => void toggle()} className="self-start">
          {verified ? 'Spegni “Privacy verificata”' : 'Segna “Privacy verificata”'}
        </Button>
      ) : (
        <p className="text-xs text-muted">Solo il titolare del centro può cambiarlo.</p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </>
  )
}
