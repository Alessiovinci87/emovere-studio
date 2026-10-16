import { useCallback, useEffect, useState } from 'react'

// Ogni schermata ha il suo URL. La navigazione usa la cronologia del browser, così funzionano
// il tasto Indietro dell'app, quello del browser e il gesto "indietro" su tablet e telefono.

export type Route =
  | { name: 'oggi' }
  | { name: 'bambini' }
  | { name: 'cartella'; id: string }
  | { name: 'crea'; folderId?: string }
  | { name: 'libreria' }
  | { name: 'impostazioni' }
  /** id null = bozza (scheda non ancora salvata) */
  | { name: 'scheda'; id: string | null }
  /** Guida per genitori e scuola (sul server) */
  | { name: 'guida'; id: string }

/** Sezioni della navigazione principale */
export type Section = 'oggi' | 'bambini' | 'crea' | 'libreria' | 'impostazioni'

export function sectionOf(route: Route): Section | null {
  if (route.name === 'cartella') return 'bambini'
  if (route.name === 'scheda' || route.name === 'guida') return null
  return route.name
}

export function toPath(route: Route): string {
  switch (route.name) {
    case 'oggi':
      return '/oggi'
    case 'cartella':
      return `/bambini/${encodeURIComponent(route.id)}`
    case 'crea':
      return route.folderId ? `/crea?cartella=${encodeURIComponent(route.folderId)}` : '/crea'
    case 'scheda':
      return `/scheda/${route.id ? encodeURIComponent(route.id) : 'bozza'}`
    case 'guida':
      return `/guida/${encodeURIComponent(route.id)}`
    default:
      return `/${route.name}`
  }
}

export function parsePath(pathname: string, search = ''): Route {
  const [first, second] = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  switch (first) {
    case 'bambini':
      return second ? { name: 'cartella', id: second } : { name: 'bambini' }
    case 'crea': {
      const folderId = new URLSearchParams(search).get('cartella') ?? undefined
      return { name: 'crea', folderId }
    }
    case 'libreria':
    case 'impostazioni':
      return { name: first }
    case 'scheda':
      return { name: 'scheda', id: !second || second === 'bozza' ? null : second }
    case 'guida':
      return second ? { name: 'guida', id: second } : { name: 'crea' }
    default:
      return { name: 'oggi' }
  }
}

/** Profondità nella cronologia dell'app: > 0 = c'è una schermata a cui tornare con "Indietro". */
function currentDepth(): number {
  return (window.history.state as { depth?: number } | null)?.depth ?? 0
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parsePath(location.pathname, location.search))
  const [depth, setDepth] = useState(currentDepth)

  useEffect(() => {
    // Normalizza l'URL iniziale (es. "/" → "/oggi") senza creare una nuova voce
    window.history.replaceState({ depth: currentDepth() }, '', toPath(parsePath(location.pathname, location.search)))
    const onPop = () => {
      setRoute(parsePath(location.pathname, location.search))
      setDepth(currentDepth())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /** Va a una schermata. Con replace sostituisce quella attuale (es. dopo un'eliminazione o un salvataggio). */
  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    const path = toPath(next)
    if (options.replace) {
      window.history.replaceState({ depth: currentDepth() }, '', path)
    } else {
      if (path === location.pathname + location.search) return
      window.history.pushState({ depth: currentDepth() + 1 }, '', path)
    }
    setRoute(next)
    setDepth(currentDepth())
    window.scrollTo(0, 0)
  }, [])

  /** Indietro nella cronologia; se si è arrivati direttamente da un URL, va a `fallback`. */
  const back = useCallback(
    (fallback: Route) => {
      if (currentDepth() > 0) window.history.back()
      else navigate(fallback, { replace: true })
    },
    [navigate],
  )

  return { route, depth, navigate, back }
}
