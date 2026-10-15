import type { ReactNode } from 'react'
import { Page, SectionHeader } from '../components/AppShell'
import { SheetTile } from '../components/SheetTile'
import { TodoList } from '../components/TodoPanel'
import type { DueItem } from '../lib/reminders'
import type { Folder, Sheet } from '../types'

interface Props {
  due: DueItem[]
  backup: { lastExport: string | null } | null
  /** Schede salvate e bozza */
  sheets: Sheet[]
  folders: Folder[]
  onBackup: () => void
  onOpen: (sheetId: string) => void
  onReminderDone: (sheetId: string) => void
}

/** Schermata iniziale: cosa c'è da fare, cosa è in lavorazione, cosa si è aperto di recente. */
export function TodayView({ due, backup, sheets, folders, onBackup, onOpen, onReminderDone }: Props) {
  const folderOf = (s: Sheet) => folders.find((f) => f.id === s.folderId)
  const inProgress = sheets.filter((s) => s.status === 'in-lavorazione').sort((a, b) => b.updatedAt - a.updatedAt)
  const recent = sheets
    .filter((s) => s.openedAt)
    .sort((a, b) => b.openedAt! - a.openedAt!)
    .slice(0, 6)
  const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <Page>
      <SectionHeader title="Oggi" subtitle={today.charAt(0).toUpperCase() + today.slice(1)} />
      <div className="flex flex-col gap-10">
        <Block title="Da fare">
          <TodoList items={due} backup={backup} onBackup={onBackup} onOpen={onOpen} onDone={onReminderDone} />
        </Block>

        <Block title="In lavorazione">
          {inProgress.length === 0 ? (
            <Empty>Nessuna scheda in lavorazione.</Empty>
          ) : (
            <Tiles>
              {inProgress.map((s) => (
                <SheetTile key={s.id} sheet={s} folder={folderOf(s)} onOpen={() => onOpen(s.id)} />
              ))}
            </Tiles>
          )}
        </Block>

        <Block title="Aperte di recente">
          {recent.length === 0 ? (
            <Empty>Le ultime schede che apri compariranno qui.</Empty>
          ) : (
            <Tiles>
              {recent.map((s) => (
                <SheetTile key={s.id} sheet={s} folder={folderOf(s)} onOpen={() => onOpen(s.id)} />
              ))}
            </Tiles>
          )}
        </Block>
      </div>
    </Page>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-3xl border border-dashed border-line px-6 py-8 text-center text-muted">{children}</p>
}
