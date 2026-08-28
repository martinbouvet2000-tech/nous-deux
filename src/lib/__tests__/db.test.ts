import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { humanizeError, run } from '../db'
import { useConnectivityStore } from '@/stores/connectivityStore'

describe('humanizeError', () => {
  it('passes business errors from SQL through verbatim', () => {
    expect(humanizeError({ code: 'P0001', message: 'Tu es déjà lié(e) à un(e) partenaire' })).toBe('Tu es déjà lié(e) à un(e) partenaire')
  })
  it('maps RLS / permission errors', () => {
    expect(humanizeError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/pas le droit/)
  })
  it('maps auth errors', () => {
    expect(humanizeError({ message: 'Invalid login credentials' })).toBe('Email ou mot de passe incorrect.')
    expect(humanizeError({ message: 'Email not confirmed' })).toMatch(/Confirme ton email/)
  })
  it('maps network errors', () => {
    expect(humanizeError(new TypeError('Failed to fetch'))).toMatch(/connexion/)
  })
  it('falls back to a generic message', () => {
    expect(humanizeError(null)).toMatch(/Une erreur est survenue/)
  })
})

/**
 * Hors ligne, la bannière globale dit déjà tout : la console n'a pas à se remplir
 * de « [db] OfflineError: pas de connexion » à chaque écran qui retente sa lecture.
 * Idem pour un appel `silent`, dont l'échec est attendu par l'appelant.
 */
describe('run — journalisation', () => {
  const echec = () => Promise.resolve({ data: null, error: { message: 'boum', code: 'XX000' } })

  const setOnLine = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
  }

  beforeEach(() => {
    setOnLine(true)
    useConnectivityStore.setState({ status: 'online' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setOnLine(true)
    useConnectivityStore.setState({ status: 'online' })
  })

  it('journalise une vraie erreur, en ligne et sans `silent`', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ok } = await run(echec())
    expect(ok).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('se tait quand l’appelant demande le silence', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ok, error } = await run(echec(), { silent: true })
    expect(ok).toBe(false)
    expect(error).toBeTruthy() // l'erreur reste rendue à l'appelant
    expect(spy).not.toHaveBeenCalled()
  })

  it('se tait hors ligne (navigateur ou bannière)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setOnLine(false)
    await run(echec())
    setOnLine(true)
    useConnectivityStore.setState({ status: 'offline' })
    await run(echec())
    expect(spy).not.toHaveBeenCalled()
  })

  it('applique la même règle à une exception inattendue', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const plante = () => Promise.reject(new Error('réseau coupé'))
    await run(plante(), { silent: true })
    expect(spy).not.toHaveBeenCalled()
    const { ok } = await run(plante())
    expect(ok).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
