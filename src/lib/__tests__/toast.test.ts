import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MAX_VISIBLE, NAV_GRACE_MS, toast, useToastStore } from '../toast'
import { run } from '../db'
import { useConnectivityStore } from '@/stores/connectivityStore'

/** Remet la pile ET ses minuteurs à zéro entre deux tests */
function resetToasts() {
  useToastStore.getState().clear()
  useToastStore.setState({ authenticated: false })
}

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value })
}

const messages = () => useToastStore.getState().toasts.map((t) => t.message)

describe('toast — déduplication et plafond', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetToasts()
    useToastStore.getState().setAuthenticated(true)
  })

  afterEach(() => {
    resetToasts()
    vi.useRealTimers()
  })

  it("n'affiche qu'une fois le même message, même déclenché quatre fois", () => {
    // Quatre écrans qui échouent ensemble hors ligne : un seul message à l'écran.
    for (let i = 0; i < 4; i++) toast.error('Pas de connexion. Vérifie ton réseau.')
    expect(messages()).toEqual(['Pas de connexion. Vérifie ton réseau.'])
  })

  it('relance la lecture du toast existant au lieu de le doubler', () => {
    toast.info('Nouveau vlog de Clarisse')
    vi.advanceTimersByTime(4000)
    toast.info('Nouveau vlog de Clarisse')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    // Sans relance, les 5 s initiales seraient écoulées ; le minuteur est reparti de zéro.
    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('distingue deux messages différents mais dédoublonne sur une clé explicite', () => {
    toast.error('Position introuvable', { key: 'geo' })
    toast.error('Autorise la localisation', { key: 'geo' })
    expect(messages()).toEqual(['Position introuvable'])

    toast.error('Autre souci')
    expect(useToastStore.getState().toasts).toHaveLength(2)
  })

  it('ne garde jamais plus de trois toasts, et jette les plus anciens', () => {
    toast.info('un'); toast.info('deux'); toast.info('trois'); toast.info('quatre'); toast.info('cinq')
    expect(useToastStore.getState().toasts).toHaveLength(MAX_VISIBLE)
    expect(messages()).toEqual(['trois', 'quatre', 'cinq'])
  })

  it('ignore un message vide', () => {
    toast.success('   ')
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it("le minuteur d'un toast évincé ne survit pas", () => {
    toast.info('un'); toast.info('deux'); toast.info('trois'); toast.info('quatre')
    // « un » a été évincé : son minuteur ne doit plus toucher à la pile.
    vi.advanceTimersByTime(10_000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

describe('toast — conscience du contexte', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetToasts()
  })

  afterEach(() => {
    resetToasts()
    vi.useRealTimers()
  })

  it("n'affiche rien tant que personne n'est connecté", () => {
    toast.error('Impossible de déterminer ta position pour le moment.')
    expect(useToastStore.getState().toasts).toHaveLength(0)

    useToastStore.getState().setAuthenticated(true)
    toast.error('Impossible de déterminer ta position pour le moment.')
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('purge tout à la déconnexion — rien ne doit atterrir sur l’écran de connexion', () => {
    useToastStore.getState().setAuthenticated(true)
    toast.error('Autorise la localisation dans ton navigateur pour partager ta position.')
    expect(useToastStore.getState().toasts).toHaveLength(1)

    useToastStore.getState().setAuthenticated(false)
    expect(useToastStore.getState().toasts).toHaveLength(0)

    // Et plus rien ne passe ensuite.
    toast.error('Autorise la localisation dans ton navigateur pour partager ta position.')
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('purge à la navigation les messages de la page quittée', () => {
    useToastStore.getState().setAuthenticated(true)
    toast.error('Impossible de charger la carte.')
    vi.advanceTimersByTime(NAV_GRACE_MS + 100)

    useToastStore.getState().clearForNavigation()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it("épargne la confirmation née juste avant la navigation qu'elle a provoquée", () => {
    useToastStore.getState().setAuthenticated(true)
    toast.error('Impossible de charger la carte.')
    vi.advanceTimersByTime(NAV_GRACE_MS + 100)
    toast.success('Mot de passe mis à jour. Bon retour !')

    useToastStore.getState().clearForNavigation()
    expect(messages()).toEqual(['Mot de passe mis à jour. Bon retour !'])
  })

  it('clear() vide la pile et ses minuteurs', () => {
    useToastStore.getState().setAuthenticated(true)
    toast.info('un'); toast.info('deux')
    toast.clear()
    expect(useToastStore.getState().toasts).toHaveLength(0)

    toast.info('trois')
    vi.advanceTimersByTime(4000)
    // Les minuteurs des toasts purgés ne doivent pas emporter le nouveau.
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})

describe('run — silence hors ligne', () => {
  beforeEach(() => {
    resetToasts()
    useToastStore.getState().setAuthenticated(true)
    setOnLine(true)
    useConnectivityStore.setState({ status: 'online' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    setOnLine(true)
    useConnectivityStore.setState({ status: 'online' })
    resetToasts()
    vi.restoreAllMocks()
  })

  it('affiche une erreur quand le réseau est là', async () => {
    const err = { code: '23505', message: 'duplicate key value' }
    const res = await run(Promise.resolve({ data: null, error: err }))
    expect(res.ok).toBe(false)
    expect(messages()).toEqual(['Cet élément existe déjà.'])

    // Deux écrans qui butent sur la même erreur : un seul message à l'écran.
    await run(Promise.resolve({ data: null, error: err }))
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('se tait hors ligne : la bannière hors-ligne informe déjà', async () => {
    setOnLine(false)
    await run(Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }))
    await run(Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }))
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('se tait aussi quand le réseau est annoncé présent mais injoignable', async () => {
    useConnectivityStore.setState({ status: 'offline' })
    await run(Promise.reject(new TypeError('Failed to fetch')))
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
