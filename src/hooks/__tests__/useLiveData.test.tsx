import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

/** Faux canal Realtime : on n'observe que ce que le hook en fait. */
interface FakeChannel {
  name: string
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

const { channels, mockChannel, mockRemoveChannel } = vi.hoisted(() => {
  const channels: FakeChannel[] = []
  const mockChannel = vi.fn((name: string) => {
    const ch: FakeChannel = { name, on: vi.fn(), subscribe: vi.fn() }
    ch.on.mockReturnValue(ch)
    ch.subscribe.mockReturnValue(ch)
    channels.push(ch)
    return ch
  })
  return { channels, mockChannel, mockRemoveChannel: vi.fn() }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { channel: mockChannel, removeChannel: mockRemoveChannel },
}))

import { useLiveData } from '@/hooks/useLiveData'
import { useConnectivityStore } from '@/stores/connectivityStore'

/** Simule le retour du réseau tel que `useReconnect` le signale à l'app. */
function reconnect() {
  act(() => {
    useConnectivityStore.getState().beginReconnect()
  })
}

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

describe('useLiveData — charger + s’abonner + recharger', () => {
  beforeEach(() => {
    channels.length = 0
    mockChannel.mockClear()
    mockRemoveChannel.mockClear()
    setOnLine(true)
    useConnectivityStore.setState({ status: 'online', reconnectNonce: 0, lastSyncAt: null })
  })

  afterEach(() => {
    setOnLine(true)
    vi.restoreAllMocks()
  })

  /* ── Chargement initial ── */

  it('charge une fois au montage et s’abonne au canal demandé', () => {
    const load = vi.fn()
    const bind = vi.fn()
    renderHook(() => useLiveData({ load, channel: 'dash:me', bind }))

    expect(load).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledWith('dash:me')
    expect(bind).toHaveBeenCalledTimes(1)
    expect(bind.mock.calls[0][0]).toBe(channels[0])
    expect(channels[0].subscribe).toHaveBeenCalledTimes(1)
  })

  it('ne fait rien tant que `enabled` est faux, puis démarre quand il passe à vrai', () => {
    const load = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useLiveData({ load, enabled, channel: 'dash:me' }),
      { initialProps: { enabled: false } },
    )
    expect(load).not.toHaveBeenCalled()
    expect(mockChannel).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(load).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledTimes(1)
  })

  it('charge sans s’abonner quand il n’y a pas de canal', () => {
    const load = vi.fn()
    renderHook(() => useLiveData({ load, channel: null }))

    expect(load).toHaveBeenCalledTimes(1)
    expect(mockChannel).not.toHaveBeenCalled()
  })

  /* ── Erreur ── */

  it('un `load` qui échoue est journalisé et n’empêche pas l’abonnement', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi.fn().mockRejectedValue(new Error('boom'))
    renderHook(() => useLiveData({ load, channel: 'dash:me' }))

    // Le rejet est capté : aucune promesse non gérée ne remonte.
    await act(async () => { await Promise.resolve() })
    expect(spy).toHaveBeenCalled()
    expect(channels[0].subscribe).toHaveBeenCalledTimes(1)
  })

  it('un `load` qui lève de façon synchrone n’empêche pas l’abonnement', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const load = vi.fn(() => { throw new Error('boom') })
    renderHook(() => useLiveData({ load, channel: 'dash:me' }))

    expect(spy).toHaveBeenCalled()
    expect(channels).toHaveLength(1)
    expect(channels[0].subscribe).toHaveBeenCalledTimes(1)
  })

  /* ── Désabonnement / fuites ── */

  it('retire le canal au démontage (aucune fuite)', () => {
    const load = vi.fn()
    const { unmount } = renderHook(() => useLiveData({ load, channel: 'dash:me' }))
    expect(mockRemoveChannel).not.toHaveBeenCalled()

    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).toHaveBeenCalledWith(channels[0])
  })

  it('change de canal en retirant l’ancien avant d’ouvrir le nouveau', () => {
    const load = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ channel }: { channel: string }) => useLiveData({ load, channel }),
      { initialProps: { channel: 'dash:a' } },
    )
    rerender({ channel: 'dash:b' })

    expect(mockChannel.mock.calls.map((c) => c[0])).toEqual(['dash:a', 'dash:b'])
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).toHaveBeenCalledWith(channels[0])

    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2)
    expect(mockRemoveChannel).toHaveBeenLastCalledWith(channels[1])
  })

  it('se ré-abonne quand `rebindKey` change (écoutes dépendant du partenaire)', () => {
    const load = vi.fn()
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useLiveData({ load, channel: 'schedule:me', rebindKey: key }),
      { initialProps: { key: 'partner-1' } },
    )
    expect(mockChannel).toHaveBeenCalledTimes(1)

    rerender({ key: 'partner-2' })
    expect(mockChannel).toHaveBeenCalledTimes(2)
    expect(mockRemoveChannel).toHaveBeenCalledWith(channels[0])
  })

  /* ── Rattrapage à la reconnexion ── */

  it('recharge au retour du réseau', () => {
    const load = vi.fn()
    renderHook(() => useLiveData({ load, channel: 'dash:me' }))
    expect(load).toHaveBeenCalledTimes(1)

    reconnect()
    expect(load).toHaveBeenCalledTimes(2)
    // Le canal reste le même : le rattrapage ne touche pas à l'abonnement.
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  it('ne recharge pas au retour du réseau quand `reconnect` est désactivé', () => {
    const load = vi.fn()
    renderHook(() => useLiveData({ load, channel: 'dash:me', reconnect: false }))
    reconnect()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ne recharge pas un hook désactivé', () => {
    const load = vi.fn()
    renderHook(() => useLiveData({ load, enabled: false, channel: 'dash:me' }))
    reconnect()
    expect(load).not.toHaveBeenCalled()
  })

  /* ── Absence de double-fetch ── */

  it('ne charge qu’une fois au montage, même si une reconnexion a déjà eu lieu', () => {
    reconnect() // une coupure a eu lieu avant que l'écran soit monté
    expect(useConnectivityStore.getState().reconnectNonce).toBe(1)

    const load = vi.fn()
    renderHook(() => useLiveData({ load, channel: 'dash:me' }))
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ne charge qu’une fois quand `load` change d’identité après une reconnexion', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ load }: { load: () => void }) => useLiveData({ load, channel: 'dash:me' }),
      { initialProps: { load: first } },
    )
    expect(first).toHaveBeenCalledTimes(1)

    reconnect()
    expect(first).toHaveBeenCalledTimes(2)

    // Nouvelle identité (dépendance du useCallback qui change) : un seul chargement,
    // celui de l'effet d'abonnement — pas un second venu du nonce déjà consommé.
    rerender({ load: second })
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(2)
  })

  it('un rendu sans changement ne relance ni chargement ni abonnement', () => {
    const load = vi.fn()
    const { rerender } = renderHook(() => useLiveData({ load, channel: 'dash:me' }))
    rerender()
    rerender()

    expect(load).toHaveBeenCalledTimes(1)
    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  it('une nouvelle fonction `bind` à chaque rendu ne provoque aucun ré-abonnement', () => {
    const load = vi.fn()
    const { rerender } = renderHook(() => useLiveData({ load, channel: 'dash:me', bind: () => {} }))
    rerender()

    expect(mockChannel).toHaveBeenCalledTimes(1)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  /* ── Hors ligne ── */

  it('hors ligne, `load` est quand même appelé : c’est guardedFetch qui rejoue le cache', () => {
    setOnLine(false)
    const load = vi.fn()
    renderHook(() => useLiveData({ load, channel: 'dash:me' }))

    // Le hook ne court-circuite pas la lecture : `lib/network` n'émet rien sur le
    // réseau et sert la dernière réponse connue — l'écran n'est jamais vide.
    expect(load).toHaveBeenCalledTimes(1)
    expect(channels[0].subscribe).toHaveBeenCalledTimes(1)
  })

  it('hors ligne, aucun rattrapage tant que le réseau n’est pas revenu', () => {
    setOnLine(false)
    const load = vi.fn()
    renderHook(() => useLiveData({ load, channel: 'dash:me' }))

    act(() => { useConnectivityStore.getState().setOffline() })
    expect(load).toHaveBeenCalledTimes(1)
    expect(useConnectivityStore.getState().reconnectNonce).toBe(0)
  })
})
