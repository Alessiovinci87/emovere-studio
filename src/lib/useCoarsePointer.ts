import { useEffect, useState } from 'react'

const QUERY = '(pointer: coarse)'

/** true su schermi touch (dito come puntatore principale): lì non esiste l'hover. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setCoarse(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return coarse
}
