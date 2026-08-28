import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom, rpc: vi.fn(), auth: {} } }))

function setOnLine(v: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v })
}

describe('démarrage à froid', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('hors ligne : reprend user + profil depuis le cache, sans requête', async () => {
    setOnLine(true)
    const { writeCache, CACHE_KEYS } = await import('../offlineCache')
    writeCache(CACHE_KEYS.user, { id: 'user-123', email: 'a@b.c' })
    writeCache(CACHE_KEYS.profile, { id: 'user-123', display_name: 'Martin' })

    setOnLine(false)
    vi.resetModules()
    const { useAuthStore } = await import('@/stores/authStore')
    expect(useAuthStore.getState().user?.id).toBe('user-123')
    expect(useAuthStore.getState().profile?.display_name).toBe('Martin')
    await useAuthStore.getState().fetchProfile()
    expect(mockFrom).not.toHaveBeenCalled()

    const { useConnectivityStore } = await import('@/stores/connectivityStore')
    expect(useConnectivityStore.getState().status).toBe('offline')
  })

  it('en ligne : ne restaure PAS un utilisateur du cache', async () => {
    setOnLine(true)
    const { writeCache, CACHE_KEYS } = await import('../offlineCache')
    writeCache(CACHE_KEYS.user, { id: 'user-123' })
    vi.resetModules()
    const { useAuthStore } = await import('@/stores/authStore')
    expect(useAuthStore.getState().user).toBeNull()
  })
})
