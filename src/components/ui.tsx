import { useId, type ReactNode } from 'react'

export const PRIVACY_TEXT = 'Usa solo nome o iniziali. Non inserire diagnosi o dati clinici.'

/** Avviso privacy fisso, sotto ogni campo con nomi o appunti. */
export function PrivacyNote({ id }: { id?: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs leading-snug text-[#9a6a3c]">
      <span aria-hidden="true">🔒</span>
      {PRIVACY_TEXT}
    </p>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  )
}

export const inputClass =
  'w-full rounded-2xl border border-line bg-white px-4 py-2 outline-none focus:border-accent placeholder:text-[#bdb5c4]'

/** Campo di testo per nomi (cartella, bambino) con l'avviso privacy. */
export function NameInput({
  label,
  value,
  onChange,
  placeholder = 'Nome o iniziali',
  autoFocus,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={40}
        autoFocus={autoFocus}
        aria-describedby={id}
        className={inputClass}
      />
      <PrivacyNote id={id} />
    </label>
  )
}

/** Appunti liberi (cartella o scheda), con l'avviso privacy. */
export function NotesField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">Appunti</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Cosa funziona, cosa cambiare, a chi consegnarla…"
        aria-describedby={id}
        className={`${inputClass} resize-y leading-relaxed`}
      />
      <PrivacyNote id={id} />
    </label>
  )
}

type ButtonTone = 'primary' | 'soft' | 'ghost' | 'danger'

const tones: Record<ButtonTone, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  soft: 'bg-accent-soft text-accent hover:bg-accent/15',
  ghost: 'border border-line text-muted hover:bg-sand hover:text-ink',
  danger: 'border border-[#efc9bf] text-[#b5513a] hover:bg-peach-soft',
}

export function Button({
  tone = 'ghost',
  small,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; small?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded-full font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        small ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'
      } ${tones[tone]} ${className}`}
    />
  )
}
