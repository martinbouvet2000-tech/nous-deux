import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Profile } from '@/types/database'

/**
 * Câblage du partage de position : c'est ici que se cachent les régressions
 * coûteuses — un GPS qui reste allumé en arrière-plan (batterie), une
 * surveillance qui ne repart jamais au retour de l'onglet (carte figée), ou
 * une écriture par seconde (quota).
 *
 * La décision elle-même (précision, seuils) est testée à part, dans
 * `src/lib/__tests__/geo.test.ts`.
 */

const { mockRun, inserted, mockToastError } = vi.hoisted(() => ({
  mockRun: vi.fn(async () => ({ ok: true, data: null, error: null })),
  inserted: [] as Record<string, unknown>[],
  mockToastError: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  run: mockRun,
  humanizeError: (err: unknown) => String(err),
}))

vi.mock('@/lib/toast', () => ({
  toast: { error: mockToastError, success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return Promise.resolve({ data: null, error: null })
      },
    }),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}))

import { useLocationSharing } from '@/hooks/useLocationSharing'
import { useAuthStore } from '@/stores/authStore'

/* ── Faux navigateur ── */

type Watch = (success: PositionCallback, error?: PositionErrorCallback | null, options?: PositionOptions) => number

let watchId = 0
const watchPosition = vi.fn<Watch>()
const clearWatch = vi.fn()
/** Dernier `onPosition` transmis par le hook à `watchPosition`. */
let emit: ((pos: GeolocationPosition) => void) | null = null
/** Dernier `onError`. */
let fail: ((err: GeolocationPositionError) => void) | null = null

function installGeolocation() {
  watchId = 0
  watchPosition.mockReset()
  watchPosition.mockImplementation((success, error) => {
    emit = success
    fail = error ?? null
    return ++watchId
  })
  clearWatch.mockReset()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition, clearWatch, getCurrentPosition: vi.fn() },
  })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const PROFILE: Profile = {
  id: 'martin',
  display_name: 'Martin',
  avatar_url: null,
  timezone: 'Europe/Warsaw',
  location_city: null,
  location_country: null,
  location_lat: null,
  location_lng: null,
  partner_id: 'clarisse',
  partner_code: 'AWY123',
  relationship_start: null,
  share_location: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function signIn(share: boolean) {
  act(() => {
    useAuthStore.setState({ profile: { ...PROFILE, share_location: share } })
  })
}

/** Position renvoyée par le faux GPS. */
function position(lat: number, lng: number, accuracy: number): GeolocationPosition {
  return {
    coords: { latitude: lat, longitude: lng, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  } as GeolocationPosition
}

/** Laisse l'insertion asynchrone se terminer avant d'observer. */
async function deliver(pos: GeolocationPosition) {
  await act(async () => {
    emit?.(pos)
  })
}

/** Options du n-ième appel à `watchPosition`. */
function optionsOf(call: number): PositionOptions {
  return watchPosition.mock.calls[call]?.[2] ?? {}
}

describe('useLocationSharing — précision, batterie, quota', () => {
  beforeEach(() => {
    installGeolocation()
    setVisibility('visible')
    inserted.length = 0
    mockRun.mockClear()
    mockToastError.mockClear()
    emit = null
    fail = null
  })

  afterEach(() => {
    act(() => {
      useAuthStore.setState({ profile: null })
    })
    vi.restoreAllMocks()
  })

  it('ne surveille rien tant que le partage n’est pas activé', () => {
    signIn(false)
    renderHook(() => useLocationSharing())
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('surveille en haute précision quand l’app est visible', () => {
    signIn(true)
    renderHook(() => useLocationSharing())
    expect(watchPosition).toHaveBeenCalledTimes(1)
    expect(optionsOf(0).enableHighAccuracy).toBe(true)
    expect(optionsOf(0).maximumAge).toBeLessThanOrEqual(5_000)
  })

  it('coupe le GPS en arrière-plan et le reprend au retour', () => {
    signIn(true)
    renderHook(() => useLocationSharing())

    setVisibility('hidden')
    expect(clearWatch).toHaveBeenCalledTimes(1)
    expect(watchPosition).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    expect(watchPosition).toHaveBeenCalledTimes(2)
    expect(optionsOf(1).enableHighAccuracy).toBe(true)
  })

  it('n’empile pas les surveillances quand l’onglet redevient visible deux fois', () => {
    signIn(true)
    renderHook(() => useLocationSharing())
    setVisibility('visible')
    setVisibility('visible')
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })

  it('enregistre le premier point avec sa précision arrondie', async () => {
    signIn(true)
    renderHook(() => useLocationSharing())
    await deliver(position(48.8656, 2.3212, 12.4))

    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ user_id: 'martin', lat: 48.8656, lng: 2.3212, accuracy: 12 })
  })

  it('ne réécrit pas dans la foulée : l’anti-spam tient', async () => {
    signIn(true)
    renderHook(() => useLocationSharing())
    await deliver(position(48.8656, 2.3212, 8))
    await deliver(position(48.87, 2.33, 8))
    expect(inserted).toHaveLength(1)
  })

  it('arrête tout sur un refus d’autorisation et le dit une seule fois', () => {
    signIn(true)
    renderHook(() => useLocationSharing())

    act(() => {
      fail?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'refusé' } as GeolocationPositionError)
    })
    expect(clearWatch).toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledTimes(1)

    // Même un retour d'onglet ne doit pas relancer une demande refusée.
    setVisibility('hidden')
    setVisibility('visible')
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })

  it('libère la surveillance au démontage', () => {
    signIn(true)
    const { unmount } = renderHook(() => useLocationSharing())
    unmount()
    expect(clearWatch).toHaveBeenCalledTimes(1)
  })
})
