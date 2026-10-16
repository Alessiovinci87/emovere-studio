import type { ReactNode } from 'react'
import type { Account } from './lib/account'
import { useAuth } from './lib/useAuth'
import {
  AuthLoading,
  LoginView,
  MessageView,
  MfaEnrollView,
  MfaVerifyView,
  SetPasswordView,
  SetupView,
} from './views/AuthViews'

export interface Session {
  /** null = login spento (in locale con npm run dev) */
  account: Account | null
  /** Ricarica account e centro (es. dopo "Privacy verificata") */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

/** L'app si apre solo dopo login, secondo fattore e centro. */
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const { state, refresh, signOut } = useAuth()
  const done = () => void refresh()
  const exit = () => void signOut()

  switch (state.step) {
    case 'off':
      return children({ account: null, refresh, signOut })
    case 'ready':
      return children({ account: state.account, refresh, signOut })
    case 'loading':
      return <AuthLoading />
    case 'login':
      return <LoginView onDone={done} />
    case 'link-error':
      return <MessageView title="Link non valido" message={state.message} actionLabel="Vai all’accesso" onAction={exit} />
    case 'mfa-verify':
      return <MfaVerifyView factorId={state.factorId} onDone={done} onSignOut={exit} />
    case 'password':
      return <SetPasswordView reason={state.reason} onDone={done} onSignOut={exit} />
    case 'mfa-enroll':
      return <MfaEnrollView onDone={done} onSignOut={exit} />
    case 'setup':
      return <SetupView email={state.email} onDone={done} onSignOut={exit} />
    case 'no-center':
      return (
        <MessageView
          title="Nessun centro"
          message={`L’account ${state.email} non fa parte di nessun centro. Chiedi al titolare di invitarti.`}
          onSignOut={exit}
        />
      )
    case 'error':
      return <MessageView title="Accesso non riuscito" message={state.message} actionLabel="Riprova" onAction={done} onSignOut={exit} />
  }
}
