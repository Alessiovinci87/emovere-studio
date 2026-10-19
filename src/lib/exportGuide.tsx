import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { PageFooter } from '../components/SheetParts'
import { GUIDE_POINTS, GUIDE_VERSIONS, type GuideVersion } from '../config/guide'
import { downloadBlob } from './download'
import { fileTitle, renderPdf, type ExportKind, type Page } from './exportPdf'
import type { GuideContent } from './guide'
import type { AppSettings } from './settings'

// PDF della guida: A4 verticale, testo in Atkinson Hyperlegible. Ogni versione parte da una pagina nuova;
// i 10 punti si distribuiscono sulle pagine misurandone l'altezza (un punto non si spezza tra due pagine).

const PAGE = { w: 210, h: 297, margin: 15 }
const FOOTER_H = 8
const HEADER_FIRST_H = 30
const HEADER_OTHER_H = 9
const GAP = 5
const PX_PER_MM = 96 / 25.4
const mm = (n: number) => `${n}mm`

type Footer = { logo: string | null; name: string } | null

function PointBlock({ index, text }: { index: number; text: string }) {
  return (
    <section className="flex flex-col gap-[1.5mm]" style={{ breakInside: 'avoid' }}>
      <h3 className="flex items-center gap-[2.5mm] text-[4.6mm] font-bold leading-tight">
        <span className="flex h-[7mm] w-[7mm] shrink-0 items-center justify-center rounded-full bg-[#3f74b8] text-[3.8mm] text-white">
          {index + 1}
        </span>
        {GUIDE_POINTS[index]}
      </h3>
      <p className="whitespace-pre-wrap pl-[9.5mm] text-[4.1mm] leading-[1.45]">{text.trim()}</p>
    </section>
  )
}

function GuidePage({
  title,
  version,
  first,
  pageNo,
  pageCount,
  footer,
  children,
}: {
  title: string
  version: GuideVersion
  first: boolean
  pageNo: number
  pageCount: number
  footer: Footer
  children: ReactNode
}) {
  return (
    <div
      className="relative flex flex-col bg-white font-sans text-ink"
      style={{ width: mm(PAGE.w), height: mm(PAGE.h), padding: mm(PAGE.margin), gap: mm(GAP) }}
    >
      {first ? (
        <header className="flex shrink-0 flex-col justify-center gap-[1.5mm] border-b-[0.4mm] border-[#e4d9c8]" style={{ height: mm(HEADER_FIRST_H - GAP) }}>
          <p className="text-[3.6mm] font-bold uppercase tracking-wide text-[#3f74b8]">{GUIDE_VERSIONS[version]}</p>
          <h1 className="text-[7.5mm] font-bold leading-tight">{title}</h1>
        </header>
      ) : (
        <p className="shrink-0 text-[3.4mm] font-bold text-muted" style={{ height: mm(HEADER_OTHER_H - GAP) }}>
          {title} · {GUIDE_VERSIONS[version].toLowerCase()}
        </p>
      )}
      {children}
      <span className="absolute bottom-[4mm] right-[15mm] text-[3mm] font-bold text-muted">
        {pageNo} / {pageCount}
      </span>
      <PageFooter footer={footer} />
    </div>
  )
}

/** Altezza (mm) di ogni punto, misurata disegnandolo fuori schermo alla larghezza della pagina. */
async function measure(texts: string[]): Promise<number[]> {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;pointer-events:none;width:${PAGE.w - 2 * PAGE.margin}mm`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() =>
      root.render(
        <div className="font-sans">
          {texts.map((text, i) => (
            <div key={i} data-block>
              <PointBlock index={i} text={text} />
            </div>
          ))}
        </div>,
      ),
    )
    await document.fonts.ready
    return [...host.querySelectorAll('[data-block]')].map((el) => el.getBoundingClientRect().height / PX_PER_MM)
  } finally {
    root.unmount()
    host.remove()
  }
}

/** Raggruppa i punti per pagina: si va a pagina nuova quando il punto successivo non sta. */
export function paginate(heights: number[], firstAvailable: number, otherAvailable: number): number[][] {
  const pages: number[][] = [[]]
  let used = 0
  heights.forEach((h, i) => {
    const available = pages.length === 1 ? firstAvailable : otherAvailable
    const needed = (pages[pages.length - 1].length > 0 ? GAP : 0) + h
    if (pages[pages.length - 1].length > 0 && used + needed > available) {
      pages.push([])
      used = 0
    }
    used += (pages[pages.length - 1].length > 0 ? GAP : 0) + h
    pages[pages.length - 1].push(i)
  })
  return pages
}

export async function exportGuide(
  title: string,
  guide: GuideContent,
  versions: GuideVersion[],
  kind: ExportKind,
  settings: AppSettings,
): Promise<void> {
  const { blob, name } = await guidePdf(title, guide, versions, kind, settings)
  downloadBlob(blob, name)
}

/** PDF della guida (versioni scelte) e nome del file, senza download. */
export async function guidePdf(
  title: string,
  guide: GuideContent,
  versions: GuideVersion[],
  kind: ExportKind,
  settings: AppSettings,
): Promise<{ blob: Blob; name: string }> {
  const footer: Footer =
    settings.logo || settings.centerName.trim() ? { logo: settings.logo, name: settings.centerName.trim() } : null
  const body = PAGE.h - 2 * PAGE.margin - FOOTER_H
  const pages: Page[] = []
  for (const version of versions) {
    const texts = guide[version].map((p) => p.text)
    const groups = paginate(await measure(texts), body - HEADER_FIRST_H, body - HEADER_OTHER_H)
    groups.forEach((group, p) =>
      pages.push({
        orientation: 'portrait',
        element: (
          <GuidePage title={title} version={version} first={p === 0} pageNo={p + 1} pageCount={groups.length} footer={footer}>
            <div className="flex flex-col" style={{ gap: mm(GAP) }}>
              {group.map((i) => (
                <PointBlock key={i} index={i} text={texts[i]} />
              ))}
            </div>
          </GuidePage>
        ),
      }),
    )
  }
  const suffix = versions.length === 1 ? `_${versions[0]}` : ''
  return { blob: await renderPdf(pages, kind, title), name: `${fileTitle(title, 'Guida')}${suffix}${kind === 'whatsapp' ? '_whatsapp' : ''}.pdf` }
}
