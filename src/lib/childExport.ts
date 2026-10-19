// "Esporta i dati del bambino": un archivio ZIP con tutto ciò che il centro conserva su di lui
// (dati.json, decifrato dal server) e il PDF di ogni scheda e guida. Riservato al titolare; l'esportazione
// finisce nel registro degli accessi. Il nome del file contiene solo il codice interno (B-0001), mai nomi.
import type { GuideVersion } from '../config/guide'
import { downloadBlob } from './download'
import { guidePdf } from './exportGuide'
import { fileTitle, sheetPdf, type ExportContext } from './exportPdf'
import { normalizeGuide, unconfirmed } from './guide'
import type { ServerMaterial } from './materials'
import { todayISO } from './reminders'
import { childrenApi, childToFolder, materialToSheet } from './serverData'
import { makeZip, type ZipEntry } from './zip'

export interface ExportProgress {
  done: number
  total: number
}

export async function exportChildData(childId: string, ctx: ExportContext, onProgress: (p: ExportProgress) => void): Promise<void> {
  const data = await childrenApi.exportData(childId)
  const folder = childToFolder(data.child)
  const printable = data.materials.filter((m) => !m.deletedAt && (m.kind === 'scheda' || m.kind === 'guida'))
  const entries: ZipEntry[] = [{ name: 'dati.json', data: JSON.stringify(data, null, 2) }]
  const skipped: string[] = []
  const used = new Set<string>()

  onProgress({ done: 0, total: printable.length })
  for (const [i, m] of printable.entries()) {
    const n = String(i + 1).padStart(2, '0')
    try {
      if (m.kind === 'scheda') {
        const material = { ...m, childId, revision: 0, currentVersion: 0, openedAt: null } as ServerMaterial
        const sheet = materialToSheet(material, folder)
        const blob = await sheetPdf(sheet, 'whatsapp', { type: 'full' }, ctx)
        entries.push({ name: unique(used, `schede/${n}_${fileTitle(m.title, 'Scheda')}.pdf`), data: new Uint8Array(await blob.arrayBuffer()) })
      } else {
        // Le guide si stampano solo con tutti i punti confermati (le altre restano in dati.json)
        const guide = normalizeGuide(m.content)
        const versions = (['famiglia', 'scuola'] as GuideVersion[]).filter((v) => unconfirmed(guide, v) === 0)
        if (versions.length === 0) throw new Error('punti da confermare')
        const { blob } = await guidePdf(m.title || 'Guida', guide, versions, 'whatsapp', ctx.settings)
        entries.push({ name: unique(used, `guide/${n}_${fileTitle(m.title, 'Guida')}.pdf`), data: new Uint8Array(await blob.arrayBuffer()) })
      }
    } catch (err) {
      skipped.push(`${m.title || 'Senza titolo'}: ${(err as Error).message}`)
    }
    onProgress({ done: i + 1, total: printable.length })
  }

  entries.push({ name: 'LEGGIMI.txt', data: readme(data.child.code, data.exportedAt, skipped) })
  downloadBlob(makeZip(entries), `emovere-dati_${data.child.code}_${todayISO()}.zip`)
}

function unique(used: Set<string>, name: string): string {
  let candidate = name
  for (let k = 2; used.has(candidate); k++) candidate = name.replace(/\.pdf$/, `_${k}.pdf`)
  used.add(candidate)
  return candidate
}

function readme(code: string, exportedAt: string, skipped: string[]): string {
  const when = new Date(exportedAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })
  return [
    `Emovere Studio – dati del bambino ${code}`,
    `Esportati il ${when}.`,
    '',
    'dati.json: tutto ciò che il centro conserva sul bambino (anche gli elementi nel cestino):',
    '  child          pseudonimo, codice, anno di nascita, nome sulle schede, nome reale, appunti',
    '  profile        voci del profilo con sezione e provenienza (osservato, genitori, scuola, ipotesi)',
    '  goals          obiettivi con lo storico dei cambi di stato e delle note',
    '  materials      schede e altri materiali, con appunti, obiettivi collegati e versioni fisse',
    '  observations   osservazioni registrate',
    'schede/, guide/: il PDF di ogni materiale (qualità leggera).',
    '',
    'Contiene dati personali di un minore: conservalo in un luogo protetto e consegnalo solo a chi ne ha diritto.',
    ...(skipped.length > 0 ? ['', 'Senza PDF (i dati sono comunque in dati.json):', ...skipped.map((s) => `  - ${s}`)] : []),
    '',
  ].join('\r\n')
}
