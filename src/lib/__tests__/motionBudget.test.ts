import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  computeMotionBudget,
  useMotionBudget,
  FPS_NORMAL,
  FPS_FRUGAL,
  type MotionSignals,
} from '@/hooks/useMotionBudget'

/**
 * Mise en pause / reprise du fond animé (point 20 de l'audit).
 *
 * Deux niveaux : la décision pure (`computeMotionBudget`) et son câblage aux
 * événements du navigateur (`useMotionBudget`). Le second est le plus fragile —
 * c'est là que se cachent les fuites de listeners et les pauses qui ne
 * repartent jamais.
 */

const signals = (over: Partial<MotionSignals> = {}): MotionSignals => ({
  hidden: false,
  idle: false,
  reduced: false,
  frugal: false,
  ...over,
})

/** matchMedia n'existe pas dans jsdom : on le pose, pilotable par test. */
let reducedMotion = false
let mediaListeners: Array<() => void> = []

function installMatchMedia() {
  mediaListeners = []
  window.matchMedia = ((query: string) => ({
    media: query,
    get matches() {
      return query.includes('prefers-reduced-motion') ? reducedMotion : false
    },
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => {
      mediaListeners.push(listener)
    },
    removeEventListener: (_type: string, listener: () => void) => {
      mediaListeners = mediaListeners.filter((l) => l !== listener)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('computeMotionBudget', () => {
  it('anime quand rien ne s’y oppose', () => {
    expect(computeMotionBudget(signals())).toEqual({
      active: true,
      reduced: false,
      frameMs: 1000 / FPS_NORMAL,
    })
  })

  it('coupe la boucle quand l’onglet est caché', () => {
    expect(computeMotionBudget(signals({ hidden: true })).active).toBe(false)
  })

  it('coupe la boucle après la période d’inactivité', () => {
    expect(computeMotionBudget(signals({ idle: true })).active).toBe(false)
  })

  it('respecte prefers-reduced-motion, même onglet visible et utilisateur actif', () => {
    const budget = computeMotionBudget(signals({ reduced: true }))
    expect(budget.active).toBe(false)
    expect(budget.reduced).toBe(true)
  })

  it('ralentit au lieu de couper sur appareil modeste ou batterie faible', () => {
    const budget = computeMotionBudget(signals({ frugal: true }))
    expect(budget.active).toBe(true) // on ralentit, on ne coupe pas
    expect(budget.frameMs).toBe(1000 / FPS_FRUGAL)
    expect(budget.frameMs).toBeGreaterThan(1000 / FPS_NORMAL)
  })
})

describe('useMotionBudget', () => {
  const IDLE = 30_000

  beforeEach(() => {
    reducedMotion = false
    installMatchMedia()
    setVisibility('visible')
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('anime au montage', () => {
    const { result } = renderHook(() => useMotionBudget(IDLE))
    expect(result.current.active).toBe(true)
  })

  it('se met en pause après le délai d’inactivité, et repart au premier geste', () => {
    const { result } = renderHook(() => useMotionBudget(IDLE))

    act(() => { vi.advanceTimersByTime(IDLE - 1) })
    expect(result.current.active).toBe(true) // pas encore : le seuil n'est pas atteint

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.active).toBe(false)

    act(() => { window.dispatchEvent(new Event('pointermove')) })
    expect(result.current.active).toBe(true)
  })

  it('ne se met pas en pause tant que l’utilisateur bouge', () => {
    const { result } = renderHook(() => useMotionBudget(IDLE))

    // Un geste toutes les 20 s pendant une minute : jamais inactif.
    for (let i = 0; i < 3; i++) {
      act(() => { vi.advanceTimersByTime(20_000) })
      act(() => { window.dispatchEvent(new Event('keydown')) })
      expect(result.current.active).toBe(true)
    }
  })

  it('repart après une pause d’inactivité même très longue', () => {
    const { result } = renderHook(() => useMotionBudget(IDLE))

    act(() => { vi.advanceTimersByTime(IDLE * 20) })
    expect(result.current.active).toBe(false)

    act(() => { window.dispatchEvent(new Event('touchstart')) })
    expect(result.current.active).toBe(true)

    // …et le compteur d'inactivité est bien reparti de zéro.
    act(() => { vi.advanceTimersByTime(IDLE - 1) })
    expect(result.current.active).toBe(true)
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current.active).toBe(false)
  })

  it('coupe quand l’onglet est caché et reprend au retour', () => {
    const { result } = renderHook(() => useMotionBudget(IDLE))

    act(() => { setVisibility('hidden') })
    expect(result.current.active).toBe(false)

    act(() => { setVisibility('visible') })
    expect(result.current.active).toBe(true)
  })

  it('ne reprend pas immédiatement en boucle après une veille plus longue que le délai', () => {
    const { result } = renderHook(() => useMotionBudget(IDLE))

    act(() => { setVisibility('hidden') })
    act(() => { vi.advanceTimersByTime(IDLE * 5) })
    act(() => { setVisibility('visible') })

    // Revenir sur l'onglet compte comme un geste : on repart pour un tour plein.
    expect(result.current.active).toBe(true)
    act(() => { vi.advanceTimersByTime(IDLE - 1) })
    expect(result.current.active).toBe(true)
  })

  it('n’anime jamais sous prefers-reduced-motion, même après un geste', () => {
    reducedMotion = true
    const { result } = renderHook(() => useMotionBudget(IDLE))

    expect(result.current.reduced).toBe(true)
    expect(result.current.active).toBe(false)

    act(() => { window.dispatchEvent(new Event('pointermove')) })
    expect(result.current.active).toBe(false)
  })

  it('réagit à un changement de préférence en cours de route', () => {
    const { result } = renderHook(() => useMotionBudget(IDLE))
    expect(result.current.active).toBe(true)

    act(() => {
      reducedMotion = true
      mediaListeners.forEach((l) => l())
    })
    expect(result.current.active).toBe(false)
  })

  it('retire ses écouteurs et son timer au démontage', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useMotionBudget(IDLE))

    const added = addSpy.mock.calls.map(([type]) => type)
    unmount()
    const removed = removeSpy.mock.calls.map(([type]) => type)
    for (const type of added) expect(removed).toContain(type)

    // Plus rien ne doit se déclencher après coup.
    expect(() => vi.advanceTimersByTime(IDLE * 3)).not.toThrow()
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
