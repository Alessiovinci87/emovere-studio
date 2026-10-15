// Dagli originali PNG genera:
//   public/library/webp/{personaggio}/*.webp    dimensione piena, qualità 90 (schermo e PDF WhatsApp)
//   public/library/thumbs/{personaggio}/*.webp  400 px (griglia della libreria)
// Rigenera solo i file mancanti o più vecchi dell'originale.
// Parte da solo prima di `npm run dev` e `npm run build`; a mano: `npm run images`.
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC = 'public/library/scenes'
const SCENE_FILE = /^[A-H]\d{2}_(bambina|bambino)\.png$/
const OUTPUTS = [
  { dir: 'public/library/webp', make: (img) => img.webp({ quality: 90 }) },
  {
    dir: 'public/library/thumbs',
    make: (img) => img.resize(400, 400, { fit: 'inside' }).webp({ quality: 80 }),
  },
]

async function mtime(path) {
  try {
    return (await stat(path)).mtimeMs
  } catch {
    return 0
  }
}

let made = 0
let total = 0
for (const character of ['bambina', 'bambino']) {
  const files = (await readdir(join(SRC, character))).filter((f) => SCENE_FILE.test(f))
  for (const { dir } of OUTPUTS) await mkdir(join(dir, character), { recursive: true })

  for (const file of files) {
    const src = join(SRC, character, file)
    const srcTime = await mtime(src)
    for (const { dir, make } of OUTPUTS) {
      total++
      const out = join(dir, character, file.replace(/\.png$/, '.webp'))
      if ((await mtime(out)) >= srcTime) continue
      await make(sharp(src)).toFile(out)
      made++
    }
  }
}
console.log(`Immagini: ${made} generate, ${total - made} già aggiornate`)
