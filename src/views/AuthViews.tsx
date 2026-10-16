import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button, inputClass } from '../components/ui'
import { accountApi } from '../lib/account'
import { authMessage, passwordProblem, supabase } from '../lib/supabase'
import { setPendingPassword, type PasswordReason } from '../lib/useAuth'

// Schermate di accesso: login, codice MFA, nuova password, attivazione MFA, creazione del centro.

/** Cornice comune: card bianca al centro su sfondo crema. */
function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-3xl bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xl font-bold">
          Emovere <span className="text-accent">Studio</span>
        </p>
        <h1 className="text-2xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm font-bold text-[#a2472f]">
      {children}
    </p>
  )
}

function TextField({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <input {...props} className={`${inputClass} min-h-11`} />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** Esegue un'azione del modulo con stato di attesa ed errore. */
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(event: FormEvent, action: () => Promise<void>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : authMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

export function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream text-muted" aria-busy="true">
      Caricamento…
    </main>
  )
}

export function LoginView({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const { busy, error, setError, run } = useSubmit()

  if (forgot) {
    return (
      <AuthCard title="Password dimenticata">
        {sent ? (
          <p className="leading-relaxed text-muted">
            Se <strong className="text-ink">{email}</strong> ha un account, riceverai un’email con il link per scegliere una
            nuova password. Il link vale 24 ore.
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) =>
              run(e, async () => {
                const { error } = await supabase!.auth.resetPasswordForEmail(email.trim())
                if (error) throw error
                setSent(true)
              })
            }
          >
            <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" tone="primary" disabled={busy} className="min-h-11">
              Mandami il link
            </Button>
          </form>
        )}
        <Button
          onClick={() => {
            setForgot(false)
            setSent(false)
            setError(null)
          }}
          className="min-h-11"
        >
          Torna all’accesso
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Accedi">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) =>
          run(e, async () => {
            const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
            if (error) throw error
            onDone()
          })
        }
      >
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" tone="primary" disabled={busy} className="min-h-11">
          Entra
        </Button>
      </form>
      <button onClick={() => setForgot(true)} className="min-h-11 self-start text-sm font-bold text-accent hover:underline">
        Password dimenticata?
      </button>
      <p className="text-xs leading-relaxed text-muted">
        Gli account si creano solo su invito del titolare del centro.
      </p>
    </AuthCard>
  )
}

/** Campo per il codice a 6 cifre dell'app di autenticazione. */
function CodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <TextField
      label="Codice a 6 cifre"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6}"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      required
      autoFocus
      style={{ letterSpacing: '0.3em', fontSize: '1.25rem' }}
    />
  )
}

export function MfaVerifyView({ factorId, onDone, onSignOut }: { factorId: string; onDone: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState('')
  const { busy, error, run } = useSubmit()
  return (
    <AuthCard title="Codice di verifica">
      <p className="leading-relaxed text-muted">Apri l’app di autenticazione sul telefono e scrivi il codice di Emovere Studio.</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) =>
          run(e, async () => {
            const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code })
            if (error) throw error
            onDone()
          })
        }
      >
        <CodeField value={code} onChange={setCode} />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" tone="primary" disabled={busy || code.length !== 6} className="min-h-11">
          Conferma
        </Button>
      </form>
      <p className="text-xs leading-relaxed text-muted">
        Hai perso il telefono? Chiedi al titolare del centro di azzerare il secondo fattore.
      </p>
      <Button onClick={onSignOut} className="min-h-11">
        Esci
      </Button>
    </AuthCard>
  )
}

export function SetPasswordView({ reason, onDone, onSignOut }: { reason: PasswordReason; onDone: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const { busy, error, setError, run } = useSubmit()
  return (
    <AuthCard title={reason === 'invite' ? 'Scegli la tua password' : 'Nuova password'}>
      <p className="leading-relaxed text-muted">
        {reason === 'invite'
          ? 'Scegli la password del tuo account. Subito dopo attiverai il codice di verifica sul telefono.'
          : 'Scegli la nuova password del tuo account.'}
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) =>
          run(e, async () => {
            const problem = passwordProblem(password)
            if (problem) return setError(problem)
            if (password !== repeat) return setError('Le due password non sono uguali.')
            const { error } = await supabase!.auth.updateUser({ password })
            if (error) throw error
            setPendingPassword(null)
            onDone()
          })
        }
      >
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Almeno 12 caratteri, con maiuscole, minuscole e numeri."
          required
          autoFocus
        />
        <TextField label="Ripeti la password" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" tone="primary" disabled={busy} className="min-h-11">
          Salva la password
        </Button>
      </form>
      <Button onClick={onSignOut} className="min-h-11">
        Annulla ed esci
      </Button>
    </AuthCard>
  )
}

export function MfaEnrollView({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const { busy, error, setError, run } = useSubmit()
  const started = useRef(false)

  useEffect(() => {
    // Una sola registrazione anche se il componente si monta due volte (StrictMode)
    if (started.current) return
    started.current = true
    void (async () => {
      const client = supabase!
      // Registrazioni lasciate a metà (es. pagina chiusa prima del codice) si tolgono
      const { data: list } = await client.auth.mfa.listFactors()
      for (const f of list?.all ?? []) {
        if (f.status === 'unverified') await client.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'App di autenticazione' })
      if (error || !data) return setError(authMessage(error))
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    })()
  }, [setError])

  return (
    <AuthCard title="Codice di verifica sul telefono">
      <ol className="flex list-decimal flex-col gap-2 pl-5 leading-relaxed text-muted">
        <li>
          Installa un’app di autenticazione sul telefono (Google Authenticator, Microsoft Authenticator, 1Password…).
        </li>
        <li>Nell’app tocca “+” e inquadra il codice qui sotto.</li>
        <li>Scrivi il codice a 6 cifre che compare nell’app.</li>
      </ol>
      {factor ? (
        <>
          <img src={factor.qr} alt="Codice QR da inquadrare con l’app di autenticazione" className="mx-auto h-48 w-48" />
          <details className="text-sm text-muted">
            <summary className="cursor-pointer font-bold">Non riesci a inquadrarlo?</summary>
            <p className="mt-2">Nell’app scegli “Inserisci chiave” e scrivi:</p>
            <p className="mt-1 break-all font-mono text-ink">{factor.secret}</p>
          </details>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) =>
              run(e, async () => {
                const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
                if (error) throw error
                onDone()
              })
            }
          >
            <CodeField value={code} onChange={setCode} />
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" tone="primary" disabled={busy || code.length !== 6} className="min-h-11">
              Attiva
            </Button>
          </form>
        </>
      ) : error ? (
        <ErrorText>{error}</ErrorText>
      ) : (
        <p className="text-muted">Preparo il codice…</p>
      )}
      <p className="text-xs leading-relaxed text-muted">
        Il codice serve a ogni accesso: protegge i dati dei bambini anche se qualcuno scopre la password.
      </p>
      <Button onClick={onSignOut} className="min-h-11">
        Esci
      </Button>
    </AuthCard>
  )
}

export function SetupView({ email, onDone, onSignOut }: { email: string; onDone: () => void; onSignOut: () => void }) {
  const [name, setName] = useState('Centro Emovere')
  const [displayName, setDisplayName] = useState('')
  const { busy, error, run } = useSubmit()
  return (
    <AuthCard title="Crea il centro">
      <p className="leading-relaxed text-muted">
        Sei il primo accesso: crea il centro e ne diventi titolare ({email}). Poi potrai invitare le colleghe e i colleghi
        da Impostazioni.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) =>
          run(e, async () => {
            await accountApi.setup(name, displayName)
            onDone()
          })
        }
      >
        <TextField label="Nome del centro" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        <TextField
          label="Il tuo nome (facoltativo)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
          hint="Lo vedono gli altri membri del centro."
        />
        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" tone="primary" disabled={busy || !name.trim()} className="min-h-11">
          Crea il centro
        </Button>
      </form>
      <Button onClick={onSignOut} className="min-h-11">
        Esci
      </Button>
    </AuthCard>
  )
}

export function MessageView({
  title,
  message,
  actionLabel,
  onAction,
  onSignOut,
}: {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  onSignOut?: () => void
}) {
  return (
    <AuthCard title={title}>
      <p className="leading-relaxed text-muted">{message}</p>
      {actionLabel && onAction && (
        <Button tone="primary" onClick={onAction} className="min-h-11">
          {actionLabel}
        </Button>
      )}
      {onSignOut && (
        <Button onClick={onSignOut} className="min-h-11">
          Esci
        </Button>
      )}
    </AuthCard>
  )
}
