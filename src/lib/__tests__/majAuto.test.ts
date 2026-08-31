import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Ecouteurs = Record<string, ((e?: unknown) => void)[]>

function faireTravailleur(etat: string) {
  const ecouteurs: Ecouteurs = {}
  return {
    state: etat,
    postMessage: vi.fn(),
    addEventListener: (t: string, f: () => void) => { (ecouteurs[t] ||= []).push(f) },
    declencher: (t: string) => (ecouteurs[t] || []).forEach((f) => f()),
  }
}

function installer({ waiting = null as ReturnType<typeof faireTravailleur> | null } = {}) {
  const ecouteursReg: Ecouteurs = {}
  const enregistrement = {
    waiting,
    installing: null as ReturnType<typeof faireTravailleur> | null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: (t: string, f: () => void) => { (ecouteursReg[t] ||= []).push(f) },
    declencher: (t: string) => (ecouteursReg[t] || []).forEach((f) => f()),
  }
  const ecouteursSW: Ecouteurs = {}
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      controller: null,
      register: vi.fn().mockResolvedValue(enregistrement),
      addEventListener: (t: string, f: () => void) => { (ecouteursSW[t] ||= []).push(f) },
      removeEventListener: () => {},
    },
    configurable: true,
  })
  return { enregistrement, declencherSW: (t: string) => (ecouteursSW[t] || []).forEach((f) => f()) }
}

function ecran(etat: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: etat, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('mise à jour automatique', () => {
  let recharger: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    ecran('visible')
    recharger = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: recharger },
      configurable: true,
    })
  })
  afterEach(() => { vi.useRealTimers() })

  async function demarrer() {
    const { demarrerMisesAJour } = await import('../majAuto')
    const arreter = demarrerMisesAJour()
    await vi.advanceTimersByTimeAsync(0) // laisse la promesse de register() se résoudre
    return arreter
  }

  it('demande le service worker sans passer par le cache HTTP', async () => {
    installer()
    await demarrer()
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      expect.stringContaining('sw.js'),
      expect.objectContaining({ updateViaCache: 'none' }),
    )
  })

  it('vérifie tout de suite, puis toutes les minutes', async () => {
    const { enregistrement } = installer()
    await demarrer()
    expect(enregistrement.update).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(enregistrement.update).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(enregistrement.update).toHaveBeenCalledTimes(3)
  })

  it('vérifie au retour au premier plan — le seul signal fiable sur iPhone', async () => {
    const { enregistrement } = installer()
    await demarrer()
    await vi.advanceTimersByTimeAsync(4_000)
    ecran('hidden')
    ecran('visible')
    expect(enregistrement.update).toHaveBeenCalledTimes(2)
  })

  it('ne fait qu’une requête quand deux signaux se suivent', async () => {
    const { enregistrement } = installer()
    await demarrer()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    expect(enregistrement.update).toHaveBeenCalledTimes(1)
  })

  it('bascule sur une version déjà en attente au démarrage', async () => {
    const enAttente = faireTravailleur('installed')
    installer({ waiting: enAttente })
    await demarrer()
    expect(enAttente.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('bascule quand une nouvelle version finit de s’installer', async () => {
    const { enregistrement } = installer()
    await demarrer()
    const arrivant = faireTravailleur('installing')
    enregistrement.installing = arrivant
    enregistrement.declencher('updatefound')

    const enAttente = faireTravailleur('installed')
    enregistrement.waiting = enAttente
    arrivant.state = 'installed'
    arrivant.declencher('statechange')

    expect(enAttente.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('recharge quand la nouvelle version prend la main', async () => {
    const enAttente = faireTravailleur('installed')
    const { declencherSW } = installer({ waiting: enAttente })
    await demarrer()
    declencherSW('controllerchange')
    expect(recharger).toHaveBeenCalledTimes(1)
  })

  it('recharge quand même si personne ne prend la main', async () => {
    const enAttente = faireTravailleur('installed')
    installer({ waiting: enAttente })
    await demarrer()
    expect(recharger).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_600)
    expect(recharger).toHaveBeenCalledTimes(1)
  })

  it('attend la fin de la saisie : un petit mot en cours n’est jamais perdu', async () => {
    const champ = document.createElement('textarea')
    document.body.appendChild(champ)
    champ.focus()

    const { enregistrement } = installer()
    await demarrer()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))

    // Une nouvelle version arrive pendant qu'on écrit.
    const enAttente = faireTravailleur('installed')
    enregistrement.waiting = enAttente
    enregistrement.declencher('updatefound')

    await vi.advanceTimersByTimeAsync(2_100)
    expect(enAttente.postMessage).not.toHaveBeenCalled()

    // Quinze secondes sans toucher au clavier : la saisie est finie.
    await vi.advanceTimersByTimeAsync(16_000)
    expect(enAttente.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    champ.remove()
  })

  it('un champ seulement sélectionné ne bloque pas la mise à jour', async () => {
    // L'écran de connexion met le champ e-mail en avant tout seul : sans cette
    // nuance, l'app ne se mettrait plus jamais à jour sur cet écran.
    const champ = document.createElement('input')
    document.body.appendChild(champ)
    champ.focus()

    const enAttente = faireTravailleur('installed')
    installer({ waiting: enAttente })
    await demarrer()
    expect(enAttente.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    champ.remove()
  })

  it('ne bascule pas une app en arrière-plan, mais le fait à son retour', async () => {
    ecran('hidden')
    const enAttente = faireTravailleur('installed')
    installer({ waiting: enAttente })
    await demarrer()
    expect(enAttente.postMessage).not.toHaveBeenCalled()

    ecran('visible')
    expect(enAttente.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('arrête proprement ses minuteries', async () => {
    const { enregistrement } = installer()
    const arreter = await demarrer()
    arreter()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(enregistrement.update).toHaveBeenCalledTimes(1)
  })
})
