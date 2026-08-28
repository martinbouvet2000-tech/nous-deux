import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OfflineError, guardedFetch, isBackingOff, isOnline, resetBackoff } from '../network'
import { clearCache } from '../offlineCache'
import { useConnectivityStore } from '@/stores/connectivityStore'

const PROFILE_URL = 'https://x.supabase.co/rest/v1/profiles?select=*&id=eq.user-123'

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Laisse passer la mise en cache de la réponse (clone + text, asynchrone) */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('network — garde-fou hors ligne', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setOnLine(true)
    resetBackoff()
    clearCache()
    localStorage.clear()
    useConnectivityStore.setState({ status: 'online', reconnectNonce: 0, lastSyncAt: null })
  })

  afterEach(() => {
    setOnLine(true)
    resetBackoff()
  })

  it('hors ligne, aucune requête ne part sur le réseau', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    setOnLine(false)
    await expect(guardedFetch(PROFILE_URL)).rejects.toBeInstanceOf(OfflineError)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(isOnline()).toBe(false)
  })

  it('hors ligne, une lecture déjà vue est rejouée depuis le cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{ id: 'user-123', display_name: 'Martin' }]))
    const first = await guardedFetch(PROFILE_URL)
    expect(await first.json()).toEqual([{ id: 'user-123', display_name: 'Martin' }])
    await flush()

    setOnLine(false)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const cached = await guardedFetch(PROFILE_URL)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(cached.status).toBe(200)
    expect(cached.headers.get('x-awy-cached-at')).toBeTruthy()
    expect(await cached.json()).toEqual([{ id: 'user-123', display_name: 'Martin' }])
  })

  it("hors ligne, une écriture n'est jamais rejouée depuis le cache", async () => {
    setOnLine(false)
    await expect(
      guardedFetch(PROFILE_URL, { method: 'POST', body: '{}' }),
    ).rejects.toBeInstanceOf(OfflineError)
  })

  it('deux échecs réseau ouvrent le coupe-circuit et signalent la coupure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(guardedFetch(PROFILE_URL)).rejects.toThrow()
    await expect(guardedFetch(PROFILE_URL)).rejects.toThrow()
    expect(isBackingOff()).toBe(true)
    expect(useConnectivityStore.getState().status).toBe('offline')

    // La requête suivante n'atteint même plus le réseau : c'est la fin de la rafale.
    fetchSpy.mockClear()
    await expect(guardedFetch(PROFILE_URL)).rejects.toBeInstanceOf(OfflineError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('le retour du réseau relâche le coupe-circuit et marque la synchro', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(guardedFetch(PROFILE_URL)).rejects.toThrow()
    resetBackoff()
    expect(isBackingOff()).toBe(false)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]))
    await guardedFetch(PROFILE_URL)
    expect(useConnectivityStore.getState().status).toBe('online')
    expect(useConnectivityStore.getState().lastSyncAt).toBeTypeOf('number')
  })
})
