import { useRef, useState } from 'react'
import type { Session } from '../AuthGate'
import { AccountPanel, MembersPanel, PrivacyVerifiedPanel } from '../components/AccountSettings'
import { Page, SectionHeader } from '../components/AppShell'
import { Button, PRIVACY_TEXT, inputClass } from '../components/ui'
import { readLogo, type AppSettings } from '../lib/settings'

interface Props {
  session: Session
  /** Logo e nome del centro valgono per tutti: li cambia il titolare */
  canEditCenter: boolean
  /** Cartelle e schede della versione precedente ancora in questo browser */
  localImport?: () => void
  /** Dopo l'importazione: togliere dal browser i dati della versione precedente */
  onForgetLocal?: () => void
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
  lastBackup: string | null
  folders: number
  sheets: number
  onExport: () => void
  onImport: (file: File) => void
  /** Solo titolare: registro degli accessi */
  onOpenAudit?: () => void
}

export function SettingsView({ session, canEditCenter, localImport, onForgetLocal, settings, onSettings, lastBackup, folders, sheets, onExport, onImport, onOpenAudit }: Props) {
  const backupInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  return (
    <Page>
      <SectionHeader title="Impostazioni" />
      <div className="flex max-w-2xl flex-col gap-6">
        {session.account?.organization && (
          <>
            <Card title="Account">
              <AccountPanel session={session} />
            </Card>
            <Card title="Membri del centro">
              <MembersPanel session={session} />
            </Card>
          </>
        )}
        <Card title="Centro">
          {!canEditCenter && <p className="text-sm font-bold text-muted">Logo e nome del centro valgono per tutti: li cambia il titolare.</p>}
          <fieldset disabled={!canEditCenter} className="flex min-w-0 flex-col gap-4 disabled:opacity-70">
          <p className="leading-relaxed text-muted">
            Logo e nome compaiono in un piè di pagina sottile nei PDF (si può spegnere scheda per scheda con “Mostra logo”).
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-40 items-center justify-center rounded-2xl border border-dashed border-line bg-cream p-2">
              {settings.logo ? (
                <img src={settings.logo} alt="Logo del centro" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-muted">Nessun logo</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button tone="soft" onClick={() => logoInput.current?.click()}>
                {settings.logo ? 'Cambia logo' : 'Carica logo'}
              </Button>
              {settings.logo && (
                <Button tone="danger" onClick={() => onSettings({ logo: null })}>
                  Togli logo
                </Button>
              )}
              <input
                ref={logoInput}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setLogoError(null)
                  try {
                    onSettings({ logo: await readLogo(file) })
                  } catch (err) {
                    setLogoError((err as Error).message)
                  }
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted">PNG, JPG o SVG. Viene ridotto a 600 px sul lato più lungo.</p>
          {logoError && <p className="text-sm font-bold text-[#a2472f]">{logoError}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Nome del centro</span>
            <input
              value={settings.centerName}
              onChange={(e) => onSettings({ centerName: e.target.value })}
              maxLength={80}
              placeholder="Es. Centro Emovere"
              className={inputClass}
            />
          </label>
          </fieldset>
        </Card>

        <Card title="Nuove schede">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="flex flex-col">
              <span className="font-bold">Testo in stampatello maiuscolo</span>
              <span className="text-sm text-muted">Valore iniziale delle nuove schede; si cambia anche scheda per scheda.</span>
            </span>
            <input
              type="checkbox"
              checked={settings.uppercaseDefault}
              onChange={(e) => onSettings({ uppercaseDefault: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-[#3f74b8]"
            />
          </label>
        </Card>

        <Card title="Backup">
          <p className="leading-relaxed text-muted">
            Cartelle e schede sono salvate nel centro ({folders} {folders === 1 ? 'cartella' : 'cartelle'},{' '}
            {sheets} {sheets === 1 ? 'scheda' : 'schede'}) e si ritrovano su ogni dispositivo dopo l’accesso. “Esporta
            tutto” scarica comunque una copia, con logo, nome del centro e impostazioni.
          </p>
          <p className="font-bold">
            Ultimo backup:{' '}
            {lastBackup
              ? new Date(lastBackup).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })
              : 'mai fatto'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" onClick={onExport}>
              Esporta tutto
            </Button>
            <Button onClick={() => backupInput.current?.click()}>Importa backup</Button>
            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onImport(file)
                e.target.value = ''
              }}
            />
          </div>
          <p className="text-sm text-muted">Importare un backup aggiunge cartelle e schede al centro, senza doppioni: non cancella niente.</p>
        </Card>

        {(localImport || onForgetLocal) && (
          <Card title="Versione precedente">
            {localImport ? (
              <>
                <p className="leading-relaxed text-muted">In questo browser ci sono cartelle e schede salvate prima del login.</p>
                <Button tone="primary" onClick={localImport} className="self-start">
                  Importale nel centro
                </Button>
              </>
            ) : (
              <>
                <p className="leading-relaxed text-muted">
                  Cartelle e schede di prima sono già importate nel centro, ma una copia è ancora in questo browser.
                </p>
                <Button tone="danger" onClick={onForgetLocal} className="self-start">
                  Elimina la copia da questo browser
                </Button>
              </>
            )}
          </Card>
        )}

        <Card title="Privacy">
          <p className="leading-relaxed text-muted">🔒 {PRIVACY_TEXT}</p>
          {session.account?.organization && <PrivacyVerifiedPanel session={session} />}
        </Card>

        {onOpenAudit && (
          <Card title="Registro degli accessi">
            <p className="leading-relaxed text-muted">
              Chi ha aperto, modificato, esportato o eliminato i dati dei bambini, con data e ora. Lo vede solo il titolare.
            </p>
            <Button tone="soft" onClick={onOpenAudit} className="self-start">
              Apri il registro
            </Button>
          </Card>
        )}

        <Card title="Informazioni">
          <p className="text-muted">
            Emovere Studio · versione <span className="font-bold text-ink">{__APP_VERSION__}</span> (prototipo)
          </p>
        </Card>
      </div>
    </Page>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}
