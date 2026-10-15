import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  size?: 'sm' | 'lg'
  children: ReactNode
}

export function Modal({ title, onClose, size = 'lg', children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 p-3 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-3xl bg-cream shadow-xl ${
          size === 'sm' ? 'max-w-md' : 'max-w-5xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full px-3 py-1 text-muted hover:bg-sand hover:text-ink"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}
