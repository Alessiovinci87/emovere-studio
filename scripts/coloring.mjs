// npm run coloring — genera le versioni "da colorare" mancanti per tutte le vignette del catalogo
// (src/data/catalog.json, bambina e bambino) e le salva su Vercel Blob come la funzione /api/coloring.
//
// Variabili d'ambiente (le stesse della funzione AI), lette anche da .env.local / .env:
//   OPENAI_API_KEY         chiave OpenAI (su Vercel è "Sensitive": va impostata a mano in locale)
//   BLOB_READ_WRITE_TOKEN  token dello store Blob (vercel env pull --environment=production .env.local)
//
// Prima di generare mostra quante immagini creerà e il costo stimato, e chiede conferma.
// Opzione --yes per non chiedere. Le immagini generate qui non contano nel limite giornaliero dell'app.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { list, put } from '@vercel/blob'
import { AI_IMAGE, AI_IMAGE_COST_ESTIMATE, AI_MODELS, COLORING_PROMPT } from '../src/config/ai.ts'

const CONCURRENCY = 3
const characters = ['bambina', 'bambino']

loadEnvFiles(['.env.local', '.env'])
for (const name of ['OPENAI_API_KEY', 'BLOB_READ_WRITE_TOKEN']) {
  if (!process.env[name]) {
    console.error(`Manca ${name}.`)
    console.error(
      name === 'OPENAI_API_KEY'
        ? 'In PowerShell: $env:OPENAI_API_KEY="sk-..." poi rilancia npm run coloring.'
        : 'Scaricala con: npx vercel env pull --environment=production .env.local',
    )
    process.exit(1)
  }
}

const catalog = JSON.parse(readFileSync('src/data/catalog.json', 'utf8'))
const existing = await listExisting()
const missing = []
for (const scene of catalog.scenes) {
  for (const character of characters) {
    if (!scene.characters.includes(character)) continue
    const source = join('public/library/scenes', character, `${scene.code}_${character}.png`)
    if (!existsSync(source)) continue
    if (!existing.has(`${scene.code}_${character}`)) missing.push({ code: scene.code, character, source })
  }
}

if (missing.length === 0) {
  console.log(`Tutte le ${existing.size} versioni da colorare ci sono già. Niente da fare.`)
  process.exit(0)
}

const min = (missing.length * AI_IMAGE_COST_ESTIMATE.min).toFixed(2)
const max = (missing.length * AI_IMAGE_COST_ESTIMATE.max).toFixed(2)
console.log(`Versioni da colorare già pronte: ${existing.size}`)
console.log(`Da generare: ${missing.length} immagini (${AI_MODELS.image}, qualità ${AI_IMAGE.quality})`)
console.log(`Costo stimato: circa ${min}–${max} $ (il costo reale è nella pagina Usage di OpenAI)`)
if (!process.argv.includes('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('Procedo? (s/N) ')).trim().toLowerCase()
  rl.close()
  if (answer !== 's' && answer !== 'si' && answer !== 'sì') {
    console.log('Annullato.')
    process.exit(0)
  }
}

let done = 0
let failed = 0
const queue = [...missing]
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const png = await toColoring(readFileSync(item.source), `${item.code}_${item.character}.png`)
        await put(`coloring/${item.code}_${item.character}_colorare.png`, png, {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'image/png',
        })
        done++
        console.log(`✓ ${item.code}_${item.character}  (${done + failed}/${missing.length})`)
      } catch (err) {
        failed++
        console.error(`✗ ${item.code}_${item.character}: ${err.message}`)
      }
    }
  }),
)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
console.log(
  `Fatto: ${plural(done, 'creata', 'create')}${failed ? `, ${plural(failed, 'non riuscita', 'non riuscite')} (rilancia lo script per riprovare)` : ''}.`,
)

async function toColoring(bytes, name) {
  const form = new FormData()
  form.append('model', AI_MODELS.image)
  form.append('prompt', COLORING_PROMPT)
  form.append('size', AI_IMAGE.size)
  form.append('quality', AI_IMAGE.quality)
  form.append('output_format', 'png')
  form.append('n', '1')
  form.append('image[]', new Blob([bytes], { type: 'image/png' }), name)
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message ?? `HTTP ${response.status}`)
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('risposta senza immagine')
  return Buffer.from(b64, 'base64')
}

async function listExisting() {
  const keys = new Set()
  let cursor
  do {
    const page = await list({ prefix: 'coloring/', cursor, limit: 1000 })
    for (const blob of page.blobs) {
      const match = blob.pathname.match(/^coloring\/(.+)_colorare\.png$/)
      if (match) keys.add(match[1])
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return keys
}

/** Legge KEY=valore da file .env senza sovrascrivere le variabili già impostate. */
function loadEnvFiles(files) {
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
}
