// Genera miniature leggere (webp 400px) per la griglia della libreria.
// Uso: npm run thumbs  (rigenerare quando si aggiungono vignette)
import { readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC = 'public/library/scenes'
const OUT = 'public/library/thumbs'
const SCENE_FILE = /^[A-H]\d{2}_(bambina|bambino)\.png$/

for (const character of ['bambina', 'bambino']) {
  await mkdir(join(OUT, character), { recursive: true })
  const files = (await readdir(join(SRC, character))).filter((f) => SCENE_FILE.test(f))
  for (const file of files) {
    await sharp(join(SRC, character, file))
      .resize(400, 400, { fit: 'inside' })
      .webp({ quality: 80 })
      .toFile(join(OUT, character, file.replace(/\.png$/, '.webp')))
  }
  console.log(`${character}: ${files.length} miniature`)
}
