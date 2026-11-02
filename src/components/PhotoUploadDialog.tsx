import { useId, useState } from 'react'
import { aiApi } from '../lib/ai'
import type { Scene } from '../types'
import { Modal } from './Modal'
import { Button, inputClass } from './ui'

// Foto del centro in libreria: ritaglio quadrato al centro, ridotta a 1024 px e convertita in WebP nel browser.
// Sul server resta cifrata e visibile solo al centro. Si usa come le vignette (stessa foto per bambina e bambino).

const SIZE = 1024

export function PhotoUploadDialog({ onSaved, onClose }: { onSaved: (scene: Scene) => void; onClose: () => void }) {
  const [image, setImage] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const fileId = useId()

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setImage(await squareWebp(file))
    } catch {
      setError('Non riesco a leggere questa immagine. Prova con una foto JPG o PNG.')
    }
  }

  async function save() {
    if (!image || !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const scene = await aiApi.savePhoto({
        title: title.trim(),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        image,
      })
      onSaved(scene)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Aggiungi una foto del centro" onClose={busy ? undefined : onClose} size="sm">
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-butter p-4 text-sm leading-relaxed">
          Meglio foto di <strong>luoghi e oggetti</strong> (il bagno di casa, lo zaino, l’aula). Evita volti riconoscibili e nomi scritti. La foto
          resta solo nel tuo centro, cifrata. Per foto di persone serve il loro consenso (per i bambini, quello dei genitori).
        </p>
        <label htmlFor={fileId} className="flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-line bg-white p-4 text-center">
          {image ? (
            <img src={image} alt="Anteprima della foto" className="aspect-square w-56 rounded-2xl object-cover" />
          ) : (
            <span className="py-8 font-bold text-accent">Scegli o scatta una foto</span>
          )}
          {image && <span className="text-xs text-muted">Tocca per cambiarla · ritaglio quadrato al centro</span>}
        </label>
        <input id={fileId} type="file" accept="image/*" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Titolo (la frase sotto la foto)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Es. Il bagno di casa" className={inputClass} />
          <span className="text-xs text-muted">Niente nomi di bambini, solo cosa si vede.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Parole per la ricerca (facoltative, separate da virgole)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={200} placeholder="bagno, casa, lavandino" className={inputClass} />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#3f74b8]" />
          <span>La foto non mostra persone riconoscibili, oppure ho il consenso di chi è ritratto.</span>
        </label>
        {error && <p className="text-sm font-bold text-[#b5513a]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            Annulla
          </Button>
          <Button tone="primary" disabled={busy || !image || !title.trim() || !consent} onClick={() => void save()}>
            {busy ? 'Salvo…' : 'Salva in libreria'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Ritaglio quadrato al centro, 1024 px, WebP o JPEG dove il WebP non c'è (Safari); qualità scalata sotto ~900 KB */
async function squareWebp(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  const type = canvas.toDataURL('image/webp', 0.1).startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg'
  for (const quality of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL(type, quality)
    if (url.length * 0.75 < 900_000) return url
  }
  return canvas.toDataURL(type, 0.45)
}
