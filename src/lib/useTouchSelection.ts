import { useEffect, useState } from 'react'
import { useCoarsePointer } from './useCoarsePointer'

/**
 * Selezione con un tocco, solo su schermi touch: un tocco su un elemento con `data-cell-id`
 * lo seleziona, un tocco fuori lo deseleziona. Su desktop non seleziona nulla (resta l'hover).
 */
export function useTouchSelection() {
  const touch = useCoarsePointer()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId) return
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(`[data-cell-id="${selectedId}"]`)) setSelectedId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [selectedId])

  return {
    isSelected: (id: string) => touch && selectedId === id,
    /** undefined su desktop: niente selezione */
    selectHandler: (id: string) => (touch ? () => setSelectedId(id) : undefined),
  }
}
