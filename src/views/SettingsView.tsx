import { useRef } from 'react'
import { Page, SectionHeader } from '../components/AppShell'
import { Button, PRIVACY_TEXT } from '../components/ui'

interface Props {
  lastBackup: string | null
  folders: number
  sheets: number
  onExport: () => void
  onImport: (file: File) => void
}

export function SettingsView({ lastBackup, folders, sheets, onExport, onImport }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <Page>
      <SectionHeader title="Impostazioni" />
      <div className="flex max-w-2xl flex-col gap-6">
        <Card title="Backup">
          <p className="leading-relaxed text-muted">
            Cartelle e schede restano solo in questo browser ({folders} {folders === 1 ? 'cartella' : 'cartelle'},{' '}
            {sheets} {sheets === 1 ? 'scheda' : 'schede'}). Scarica un backup ogni settimana: serve per non perderle e
            per spostarle su un altro computer.
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
            <Button onClick={() => fileInput.current?.click()}>Importa backup</Button>
            <input
              ref={fileInput}
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
