import { useEffect, useMemo, useRef, useState } from 'react'
import { visibleIndexes } from '../components/SheetView'
import { getScene, sceneImage, sceneTitle } from '../lib/catalog'
import { stepColors, templates } from '../lib/sheet'
import type { Sheet } from '../types'

// Modalità bambino: la scheda sul tablet, un passo alla volta o tutta insieme. Il bambino tocca il passaggio
// fatto (stellina), sente la frase letta a voce e vede il tempo che resta. Niente si salva: alla chiusura
// tutto torna come prima. Per uscire si tiene premuto il pulsante (il bambino non esce per sbaglio).

interface Step {
  key: string
  code: string | null
  text: string
}

type View = 'uno' | 'tutti'

const TIMER_OPTIONS = [1, 2, 3, 5, 10]

/** Passaggi da mostrare: riquadri visibili con una vignetta o una frase */
export function childSteps(sheet: Sheet): Step[] {
  const template = templates[sheet.template]
  return visibleIndexes(sheet, template)
    .map((i) => sheet.cells[i])
    .map((cell) => {
      const scene = cell.code ? getScene(cell.code) : undefined
      const text = cell.text ?? (scene && template.defaultText ? sceneTitle(scene, sheet.character) : '')
      return { key: cell.id, code: scene ? cell.code : null, text: text.trim() }
    })
    .filter((s) => s.code || s.text)
}

/** Modelli che si possono usare sul tablet (non l'agenda della settimana) */
export function canUseOnTablet(sheet: Sheet): boolean {
  return templates[sheet.template].layout !== 'agenda' && childSteps(sheet).length > 0
}

export function ChildModeView({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const steps = useMemo(() => childSteps(sheet), [sheet])
  const [view, setView] = useState<View>(steps.length > 1 ? 'uno' : 'tutti')
  const [current, setCurrent] = useState(0)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [voice, setVoice] = useState(true)
  const [timer, setTimer] = useState<{ total: number; end: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [timerMenu, setTimerMenu] = useState(false)
  const allDone = steps.length > 0 && steps.every((s) => done.has(s.key))
  const upper = sheet.uppercase ? 'uppercase' : ''
  const hasSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Schermo intero e niente spegnimento dello schermo, quando il browser lo permette
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l), () => {})
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      void lock?.release().catch(() => {})
      if (hasSpeech) window.speechSynthesis.cancel()
    }
  }, [hasSpeech])

  useEffect(() => {
    if (!timer) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timer])

  const left = timer ? Math.max(0, timer.end - now) : 0
  const timeUp = timer !== null && left === 0
  const ding = useRef(false)
  useEffect(() => {
    if (timeUp && !ding.current) {
      ding.current = true
      if (voice) speak('Tempo finito')
    }
    if (!timeUp) ding.current = false
  }, [timeUp, voice])

  function speak(text: string) {
    if (!hasSpeech || !text) return
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'it-IT'
    u.rate = 0.9
    const it = synth.getVoices().find((v) => v.lang.startsWith('it'))
    if (it) u.voice = it
    synth.speak(u)
  }

  // Un passo alla volta: la frase si legge da sola quando si arriva al passaggio
  useEffect(() => {
    if (view === 'uno' && voice && steps[current]) speak(steps[current].text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, view])

  function toggle(key: string) {
    setDone((d) => {
      const next = new Set(d)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function markAndNext() {
    const step = steps[current]
    if (!step) return
    setDone((d) => new Set(d).add(step.key))
    if (current < steps.length - 1) setCurrent(current + 1)
    else if (voice) speak('Bravo! Hai finito!')
  }

  return (
    <div className={`fixed inset-0 z-[60] flex flex-col bg-cream text-ink ${upper}`}>
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line/70 bg-white px-3 py-2">
        <HoldToExit onExit={onClose} />
        <h1 className="min-w-0 flex-1 truncate text-center text-xl font-bold">{sheet.title}</h1>
        <div className="flex items-center gap-1 normal-case">
          {steps.length > 1 && (
            <button
              onClick={() => setView(view === 'uno' ? 'tutti' : 'uno')}
              className="h-11 rounded-full px-4 text-sm font-bold text-accent hover:bg-accent-soft"
            >
              {view === 'uno' ? 'Vedi tutti' : 'Uno alla volta'}
            </button>
          )}
          {hasSpeech && (
            <button
              onClick={() => setVoice((v) => !v)}
              aria-pressed={voice}
              className={`h-11 rounded-full px-4 text-sm font-bold ${voice ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sand'}`}
            >
              {voice ? '🔊 Voce' : '🔈 Voce spenta'}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => (timer ? setTimer(null) : setTimerMenu((v) => !v))}
              className={`h-11 rounded-full px-4 text-sm font-bold ${timer ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sand'}`}
            >
              {timer ? 'Ferma il tempo' : '⏱ Tempo'}
            </button>
            {timerMenu && !timer && (
              <div className="absolute right-0 top-12 z-10 flex gap-1 rounded-2xl bg-white p-2 shadow-lg">
                {TIMER_OPTIONS.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      const total = m * 60_000
                      setTimer({ total, end: Date.now() + total })
                      setNow(Date.now())
                      setTimerMenu(false)
                    }}
                    className="h-11 min-w-11 rounded-full bg-sand px-3 text-sm font-bold hover:bg-accent-soft"
                  >
                    {m}′
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {timer && <TimerBar left={left} total={timer.total} />}

      <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-6">
        {allDone ? (
          <div className="m-auto flex flex-col items-center gap-6 text-center">
            <div className="text-[96px] leading-none">⭐</div>
            <p className="text-4xl font-bold">Hai finito!</p>
            <button onClick={() => (setDone(new Set()), setCurrent(0))} className="rounded-full bg-white px-6 py-3 font-bold text-accent shadow-sm normal-case">
              Ricomincia
            </button>
          </div>
        ) : view === 'uno' ? (
          <OneStep
            step={steps[current]}
            index={current}
            count={steps.length}
            character={sheet.character}
            done={done.has(steps[current].key)}
            numbered={templates[sheet.template].numbered && sheet.sequence.numbers}
            onDone={markAndNext}
            onSpeak={() => speak(steps[current].text)}
            onPrev={current > 0 ? () => setCurrent(current - 1) : undefined}
            onNext={current < steps.length - 1 ? () => setCurrent(current + 1) : undefined}
            canSpeak={hasSpeech}
          />
        ) : (
          <ul className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
            {steps.map((step, i) => (
              <li key={step.key}>
                <button
                  onClick={() => {
                    toggle(step.key)
                    if (voice && !done.has(step.key)) speak(step.text)
                  }}
                  aria-pressed={done.has(step.key)}
                  className={`relative flex w-full flex-col gap-2 rounded-3xl border-4 bg-white p-3 text-left shadow-sm transition ${
                    done.has(step.key) ? 'opacity-60' : ''
                  }`}
                  style={{ borderColor: `${stepColors[i % stepColors.length]}88` }}
                >
                  {step.code && (
                    <img src={sceneImage(step.code, sheet.character)} alt="" className="aspect-square w-full rounded-2xl object-cover" />
                  )}
                  {step.text && <span className="text-center text-xl font-bold leading-tight">{step.text}</span>}
                  {done.has(step.key) && <Star className="absolute right-2 top-2 h-16 w-16" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {!allDone && (
        <footer className="flex shrink-0 justify-center gap-2 border-t border-line/70 bg-white px-3 py-3" aria-label="Passaggi fatti">
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={`h-4 w-4 rounded-full ${done.has(s.key) ? '' : 'border-2 border-line bg-white'}`}
              style={done.has(s.key) ? { backgroundColor: '#f2c94c' } : view === 'uno' && i === current ? { borderColor: '#3f74b8' } : undefined}
            />
          ))}
        </footer>
      )}
    </div>
  )
}

function OneStep({
  step,
  index,
  count,
  character,
  done,
  numbered,
  canSpeak,
  onDone,
  onSpeak,
  onPrev,
  onNext,
}: {
  step: Step
  index: number
  count: number
  character: Sheet['character']
  done: boolean
  numbered: boolean
  canSpeak: boolean
  onDone: () => void
  onSpeak: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const color = stepColors[index % stepColors.length]
  return (
    <div className="m-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        {numbered && (
          <span className="flex h-14 w-14 items-center justify-center rounded-full text-3xl font-bold text-white" style={{ backgroundColor: color }}>
            {index + 1}
          </span>
        )}
        <span className="text-sm font-bold text-muted normal-case">
          {index + 1} di {count}
        </span>
      </div>
      {step.code && (
        <div className="relative w-full max-w-[min(70vh,100%)]">
          <img src={sceneImage(step.code, character)} alt="" className="aspect-square w-full rounded-3xl object-cover shadow" />
          {done && <Star className="absolute right-3 top-3 h-24 w-24" />}
        </div>
      )}
      {step.text && <p className="text-center text-4xl font-bold leading-tight">{step.text}</p>}
      <div className="flex w-full flex-wrap items-center justify-center gap-3 normal-case">
        <button onClick={onPrev} disabled={!onPrev} className="h-14 rounded-full px-6 text-lg font-bold text-accent disabled:opacity-30">
          ← Indietro
        </button>
        {canSpeak && (
          <button onClick={onSpeak} className="h-14 rounded-full bg-white px-6 text-lg font-bold shadow-sm" aria-label="Ascolta la frase">
            🔊 Ascolta
          </button>
        )}
        <button onClick={onDone} className="h-16 rounded-full bg-accent px-10 text-2xl font-bold text-white shadow">
          ✓ Fatto
        </button>
        <button onClick={onNext} disabled={!onNext} className="h-14 rounded-full px-6 text-lg font-bold text-accent disabled:opacity-30">
          Avanti →
        </button>
      </div>
    </div>
  )
}

/** Tempo che resta: barra che si accorcia, poi lampeggia quando è finito */
function TimerBar({ left, total }: { left: number; total: number }) {
  const ratio = total > 0 ? left / total : 0
  const minutes = Math.floor(left / 60_000)
  const seconds = Math.ceil((left % 60_000) / 1000)
  const label = left === 0 ? 'Tempo finito' : `${minutes}:${String(seconds === 60 ? 0 : seconds).padStart(2, '0')}`
  return (
    <div className="flex shrink-0 items-center gap-3 bg-white px-4 py-2 normal-case" role="timer" aria-label={label}>
      <div className="h-6 flex-1 overflow-hidden rounded-full bg-sand">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${left === 0 ? 'animate-pulse' : ''}`}
          style={{ width: `${left === 0 ? 100 : ratio * 100}%`, backgroundColor: left === 0 ? '#e06a5b' : ratio > 0.25 ? '#5fb27a' : '#f2c94c' }}
        />
      </div>
      <span className="w-28 text-right text-lg font-bold tabular-nums">{label}</span>
    </div>
  )
}

/** Uscita: bisogna tenere premuto per un secondo e mezzo */
function HoldToExit({ onExit }: { onExit: () => void }) {
  const [holding, setHolding] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = () => {
    setHolding(true)
    timeout.current = setTimeout(onExit, 1500)
  }
  const stop = () => {
    setHolding(false)
    if (timeout.current) clearTimeout(timeout.current)
  }
  useEffect(() => stop, [])
  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => e.key === 'Enter' && onExit()}
      onContextMenu={(e) => e.preventDefault()}
      className="relative h-11 select-none overflow-hidden rounded-full px-4 text-sm font-bold text-muted normal-case hover:bg-sand"
      title="Tieni premuto per uscire"
    >
      <span
        className="absolute inset-y-0 left-0 bg-accent-soft"
        style={{ width: holding ? '100%' : '0%', transition: holding ? 'width 1.5s linear' : 'none' }}
      />
      <span className="relative">Tieni premuto per uscire</span>
    </button>
  )
}

function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-label="Fatto">
      <circle cx="50" cy="50" r="48" fill="#fff6d9" />
      <path
        d="M50 12 L61 38 L89 40 L67 58 L74 86 L50 71 L26 86 L33 58 L11 40 L39 38 Z"
        fill="#f2c94c"
        stroke="#d9a23a"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
