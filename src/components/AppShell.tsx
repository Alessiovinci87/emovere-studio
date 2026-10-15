import type { ReactNode } from 'react'
import type { Section } from '../lib/router'
import { BackIcon, ChildrenIcon, CreateIcon, LibraryIcon, SettingsIcon, SunIcon } from './Icons'

const sections: { id: Section; label: string; icon: (p: { className?: string }) => ReactNode }[] = [
  { id: 'oggi', label: 'Oggi', icon: SunIcon },
  { id: 'bambini', label: 'Bambini', icon: ChildrenIcon },
  { id: 'crea', label: 'Crea', icon: CreateIcon },
  { id: 'libreria', label: 'Libreria', icon: LibraryIcon },
  { id: 'impostazioni', label: 'Impostazioni', icon: SettingsIcon },
]

interface Props {
  active: Section
  /** Promemoria di oggi/scaduti + backup: badge sulla voce "Oggi" */
  todoCount: number
  onNavigate: (section: Section) => void
  children: ReactNode
}

/**
 * Cornice dell'app. Desktop (≥ 1024 px): barra laterale fissa a sinistra.
 * Tablet e telefono: barra fissa in basso. Voci con icona e nome, aree touch ≥ 44 px.
 */
export function AppShell({ active, todoCount, onNavigate, children }: Props) {
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-8 border-r border-line/70 bg-white px-4 py-6 lg:flex">
        <button onClick={() => onNavigate('oggi')} className="px-3 text-left text-xl font-bold" title="Oggi">
          Emovere <span className="text-accent">Studio</span>
        </button>
        <nav aria-label="Sezioni" className="flex flex-col gap-1">
          {sections.map((s) => (
            <NavItem key={s.id} section={s} active={active === s.id} badge={s.id === 'oggi' ? todoCount : 0} onClick={() => onNavigate(s.id)} />
          ))}
        </nav>
      </aside>

      <div className="pb-24 lg:pb-0">{children}</div>

      <nav
        aria-label="Sezioni"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {sections.map((s) => (
          <NavItem key={s.id} section={s} active={active === s.id} badge={s.id === 'oggi' ? todoCount : 0} onClick={() => onNavigate(s.id)} compact />
        ))}
      </nav>
    </div>
  )
}

function NavItem({
  section,
  active,
  badge,
  onClick,
  compact,
}: {
  section: (typeof sections)[number]
  active: boolean
  badge: number
  onClick: () => void
  compact?: boolean
}) {
  const IconComponent = section.icon
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center font-bold transition ${
        compact
          ? 'min-h-16 flex-1 flex-col justify-center gap-1 text-[11px]'
          : 'min-h-11 gap-3 rounded-2xl px-3 text-[15px]'
      } ${
        active
          ? compact
            ? 'text-accent'
            : 'bg-accent-soft text-accent'
          : 'text-muted hover:text-ink' + (compact ? '' : ' hover:bg-cream')
      }`}
    >
      <span className="relative">
        <IconComponent className="h-6 w-6" />
        {badge > 0 && (
          <span
            className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white"
            aria-label={`${badge} da fare`}
          >
            {badge}
          </span>
        )}
      </span>
      {section.label}
    </button>
  )
}

/** Intestazione di una sezione: titolo grande, Indietro se c'è una schermata precedente, azioni a destra. */
export function SectionHeader({
  title,
  subtitle,
  onBack,
  actions,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-6 lg:pt-10">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Indietro"
            title="Indietro"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-white hover:text-ink"
          >
            <BackIcon />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

/** Contenitore delle sezioni: larghezza comoda e margini generosi. */
export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-8">{children}</main>
}
