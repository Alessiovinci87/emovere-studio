// Impostazioni dell'app (in questo browser): stampatello predefinito, logo e nome del centro.
// Sono incluse nel backup ("Esporta tutto" / "Importa backup").

export interface AppSettings {
  /** Stampatello maiuscolo attivo sulle nuove schede */
  uppercaseDefault: boolean
  /** Nome del centro, nel piè di pagina */
  centerName: string
  /** Logo come data URL PNG, al massimo 600 px di lato; null = nessun logo */
  logo: string | null
}

const KEY = 'emovere.settings.v1'
const DEFAULTS: AppSettings = { uppercaseDefault: false, centerName: '', logo: null }

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: AppSettings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

export function normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    uppercaseDefault: raw?.uppercaseDefault === true,
    centerName: typeof raw?.centerName === 'string' ? raw.centerName.slice(0, 80) : '',
    logo: typeof raw?.logo === 'string' && raw.logo.startsWith('data:image/') ? raw.logo : null,
  }
}

const LOGO_MAX = 600

/** Legge un logo PNG/JPG/SVG e lo riduce a 600 px sul lato lungo, come PNG (mantiene la trasparenza). */
export async function readLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) {
    throw new Error('Formato non supportato: usa un file PNG, JPG o SVG.')
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // Gli SVG senza dimensioni dichiarate possono risultare 0×0: in quel caso si usa il lato massimo
    const w = img.naturalWidth || LOGO_MAX
    const h = img.naturalHeight || LOGO_MAX
    const scale = Math.min(1, LOGO_MAX / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    throw new Error('Non è stato possibile leggere l’immagine del logo.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
