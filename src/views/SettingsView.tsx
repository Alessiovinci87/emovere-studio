import { useRef, useState } from 'react'
import type { Session } from '../AuthGate'
import { AccountPanel, MembersPanel, PrivacyVerifiedPanel } from '../components/AccountSettings'
import { Page, SectionHeader } from '../components/AppShell'
import { Button, PRIVACY_TEXT, inputClass } from '../components/ui'
import { readLogo, type AppSettings } from '../lib/settings'

interface Props {
  session: Session
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
  lastBackup: string | null
  folders: number
  sheets: number
  onExport: () => void
  onImport: (file: File) => void
}

export function SettingsView({ session, settings, onSettings, lastBackup, folders, sheets, onExport, onImport }: Props) {
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
            Cartelle e schede restano solo in questo browser ({folders} {folders === 1 ? 'cartella' : 'cartelle'},{' '}
            {sheets} {sheets === 1 ? 'scheda' : 'schede'}). Scarica un backup ogni settimana: serve per non perderle e
            per spostarle su un altro computer. Il backup contiene anche logo, nome del centro e impostazioni.
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
          <p className="text-sm text-muted">Importare un backup sostituisce tutte le cartelle e le schede attuali (con conferma).</p>
        </Card>

        <Card title="Privacy">
          <p className="leading-relaxed text-muted">🔒 {PRIVACY_TEXT}</p>
          {session.account?.organization && <PrivacyVerifiedPanel session={session} />}
        </Card>

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
