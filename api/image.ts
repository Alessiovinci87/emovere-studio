// /api/image?p=bambina/X001_bambina.webp — serve un'immagine generata dal Blob privato.
// Stesso dominio dell'app (niente CORS per l'export PDF) e dietro la stessa password.
import { requireUser } from './_lib/auth.js'
import { asUser, requireMembership } from './_lib/db.js'
import { UserError, fail } from './_lib/http.js'
import { readPhoto } from './_lib/photos.js'
import { readImage } from './_lib/storage.js'

const IMAGE_PATH = /^(bambina|bambino)\/X\d{3,}_(bambina|bambino)\.webp$/
const COLORING_PATH = /^coloring\/([A-H]\d{2}|X\d{3,})_(bambina|bambino)_colorare\.png$/
/** Foto del centro: foto/{id del centro}/P001.enc, solo per i membri di quel centro */
const PHOTO_PATH = /^foto\/([0-9a-f-]{36})\/(P\d{3,})\.enc$/

async function photoResponse(request: Request, orgId: string, code: string): Promise<Response> {
  try {
    const user = await requireUser(request)
    const photo = await asUser(user.id, async (tx) => {
      const membership = await requireMembership(tx, user.id)
      if (membership.orgId !== orgId) return null
      return readPhoto(tx, orgId, code)
    })
    if (!photo) return fail('Immagine non trovata.', 404)
    return new Response(new Uint8Array(photo.bytes), {
      headers: { 'Content-Type': photo.type, 'Cache-Control': 'private, max-age=86400' },
    })
  } catch (err) {
    if (err instanceof UserError) return fail(err.message, err.status)
    throw err
  }
}

export async function GET(request: Request): Promise<Response> {
  const pathname = new URL(request.url).searchParams.get('p') ?? ''
  const photo = pathname.match(PHOTO_PATH)
  if (photo) return photoResponse(request, photo[1], photo[2])
  const coloring = COLORING_PATH.test(pathname)
  if (!coloring && !IMAGE_PATH.test(pathname)) return fail('Immagine non valida.', 400)
  const result = await readImage(pathname)
  if (!result || result.statusCode !== 200) return fail('Immagine non trovata.', 404)
  return new Response(result.stream, {
    headers: {
      'Content-Type': coloring ? 'image/png' : 'image/webp',
      // I nomi non vengono mai riusati: il browser può tenerla in cache a lungo
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
