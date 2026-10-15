// /api/image?p=bambina/X001_bambina.webp — serve un'immagine generata dal Blob privato.
// Stesso dominio dell'app (niente CORS per l'export PDF) e dietro la stessa password.
import { fail } from './_lib/http.js'
import { readImage } from './_lib/storage.js'

const IMAGE_PATH = /^(bambina|bambino)\/X\d{3,}_(bambina|bambino)\.webp$/
const COLORING_PATH = /^coloring\/([A-H]\d{2}|X\d{3,})_(bambina|bambino)_colorare\.png$/

export async function GET(request: Request): Promise<Response> {
  const pathname = new URL(request.url).searchParams.get('p') ?? ''
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
