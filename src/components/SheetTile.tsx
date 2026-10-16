import { sceneThumb } from '../lib/catalog'
import { statusInfo, templates } from '../lib/sheet'
import type { Folder, Sheet } from '../types'

/** Card compatta di una scheda (sezione Oggi): miniatura, titolo, cartella, stato. Un clic la apre. */
export function SheetTile({ sheet, folder, onOpen }: { sheet: Sheet; folder: Folder | undefined; onOpen: () => void }) {
  const first = sheet.cells.find((c) => c.code)
  const status = statusInfo(sheet.status)
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-sand">
        {first && <img src={sceneThumb(first.code!, sheet.character)} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-bold">{sheet.title || 'Senza titolo'}</span>
        <span className="truncate text-sm text-muted">
          {folder ? `📁 ${folder.name}` : 'Senza bambino'} · {templates[sheet.template].label}
        </span>
        <span className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: status.soft }}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
          {status.label}
        </span>
      </span>
    </button>
  )
}
