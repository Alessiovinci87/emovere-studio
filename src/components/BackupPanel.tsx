import { useRef } from 'react'
import { Button } from './ui'

/** Esporta / importa tutte le cartelle e le schede in un file JSON. */
export function BackupPanel({ onExport, onImport }: { onExport: () => void; onImport: (file: File) => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <h3 className="font-bold">Backup</h3>
      <p className="text-sm leading-relaxed text-muted">
        Cartelle e schede restano solo in questo browser. Scarica ogni tanto un backup: serve per non perderle
        e per spostarle su un altro computer.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button tone="soft" onClick={onExport}>
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
    </section>
  )
}
