import { useCallback, useEffect, useState } from 'react'
import { Composer } from './components/Composer'
import { Library } from './components/Library'
import { Modal } from './components/Modal'
import { createSheet, loadDraft, saveDraft } from './lib/sheet'
import type { Character, Scene, Sheet } from './types'

type View = 'scheda' | 'libreria'

export default function App() {
  const [view, setView] = useState<View>('scheda')
  const [sheet, setSheet] = useState<Sheet>(() => loadDraft() ?? createSheet())
  const [libraryCharacter, setLibraryCharacter] = useState<Character>(sheet.character)
  const [pickingIndex, setPickingIndex] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => saveDraft(sheet), [sheet])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const updateSheet = useCallback((patch: Partial<Sheet>) => {
    setSheet((s) => ({ ...s, ...patch, updatedAt: Date.now() }))
  }, [])

  function placeScene(index: number, scene: Scene) {
    updateSheet({
      cells: sheet.cells.map((c, i) => (i === index ? { ...c, code: scene.code, text: null } : c)),
    })
  }

  /** Dalla libreria: la vignetta va nel primo riquadro vuoto. */
  function addToSheet(scene: Scene) {
    const index = sheet.cells.findIndex((c) => !c.code)
    if (index === -1) {
      setToast('La scheda è piena: svuota un riquadro per aggiungere altre vignette.')
      return
    }
    placeScene(index, scene)
    setToast(`Aggiunta al riquadro ${index + 1}`)
  }

  const closePicker = useCallback(() => setPickingIndex(null), [])

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <h1 className="text-xl font-bold">
          Emovere <span className="text-peach">Studio</span>
        </h1>
        <nav className="inline-flex rounded-full bg-sand p-1">
          {(['scheda', 'libreria'] as const).map((v) => (
            <button
              key={v}
              onClick={() => {
                if (v === 'libreria') setLibraryCharacter(sheet.character)
                setView(v)
              }}
              aria-current={view === v ? 'page' : undefined}
              className={`rounded-full px-5 py-2 font-bold capitalize transition ${
                view === v ? 'bg-white shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {v}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        {view === 'scheda' ? (
          <Composer
            sheet={sheet}
            onChange={updateSheet}
            onChooseScene={setPickingIndex}
            onReset={() => setSheet(createSheet())}
          />
        ) : (
          <Library character={libraryCharacter} onCharacterChange={setLibraryCharacter} onPick={addToSheet} />
        )}
      </main>

      {pickingIndex !== null && (
        <Modal title={`Scegli la vignetta per il riquadro ${pickingIndex + 1}`} onClose={closePicker}>
          <Library
            character={sheet.character}
            onPick={(scene) => {
              placeScene(pickingIndex, scene)
              closePicker()
            }}
          />
        </Modal>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
