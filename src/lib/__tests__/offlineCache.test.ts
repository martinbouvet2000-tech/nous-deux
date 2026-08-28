import { describe, it, expect, beforeEach } from 'vitest'
import { CACHE_KEYS, clearCache, formatAge, readCache, removeCache, writeCache } from '../offlineCache'

const PREFIX = 'awy:cache:v1:'

describe('offlineCache', () => {
  beforeEach(() => {
    clearCache()
    localStorage.clear()
  })

  it('relit ce qui a été écrit, avec son horodatage', () => {
    writeCache(CACHE_KEYS.profile, { id: 'user-123', display_name: 'Martin' })
    const hit = readCache<{ id: string; display_name: string }>(CACHE_KEYS.profile)
    expect(hit?.data.display_name).toBe('Martin')
    expect(hit?.savedAt).toBeTypeOf('number')
  })

  it('renvoie null pour une clé inconnue', () => {
    expect(readCache('rien-du-tout')).toBeNull()
  })

  it('survit à un rechargement (relecture depuis localStorage seul)', () => {
    writeCache(CACHE_KEYS.partnerProfile, { id: 'partner-456' })
    // On vide le miroir mémoire sans toucher au stockage : c'est l'état d'un démarrage à froid.
    const raw = localStorage.getItem(PREFIX + CACHE_KEYS.partnerProfile)
    clearCache()
    localStorage.setItem(PREFIX + CACHE_KEYS.partnerProfile, raw as string)
    expect(readCache<{ id: string }>(CACHE_KEYS.partnerProfile)?.data.id).toBe('partner-456')
  })

  it('ignore une entrée trop vieille (plus de 7 jours)', () => {
    const old = { t: Date.now() - 8 * 24 * 60 * 60 * 1000, d: { id: 'vieux' } }
    localStorage.setItem(PREFIX + 'auth:profile', JSON.stringify(old))
    expect(readCache(CACHE_KEYS.profile)).toBeNull()
  })

  it('removeCache et clearCache oublient bien les données', () => {
    writeCache(CACHE_KEYS.profile, { id: 'a' })
    writeCache(CACHE_KEYS.user, { id: 'b' })
    removeCache(CACHE_KEYS.profile)
    expect(readCache(CACHE_KEYS.profile)).toBeNull()
    expect(readCache(CACHE_KEYS.user)).not.toBeNull()
    clearCache()
    expect(readCache(CACHE_KEYS.user)).toBeNull()
    expect(localStorage.getItem(PREFIX + CACHE_KEYS.user)).toBeNull()
  })

  it('dit en français depuis quand la donnée dort', () => {
    const now = Date.parse('2026-08-28T12:00:00Z')
    expect(formatAge(now - 10_000, now)).toBe("à l'instant")
    expect(formatAge(now - 5 * 60_000, now)).toBe('il y a 5 min')
    expect(formatAge(now - 2 * 3_600_000, now)).toBe('il y a 2 h')
    expect(formatAge(now - 26 * 3_600_000, now)).toBe('hier')
    expect(formatAge(now - 3 * 24 * 3_600_000, now)).toBe('il y a 3 jours')
  })
})
