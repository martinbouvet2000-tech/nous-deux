import { describe, it, expect } from 'vitest'
import {
  fixAccepted,
  geoWatchMode,
  geoWatchOptions,
  haversine,
  minMoveDistance,
  shouldSendFix,
  MAX_ACCURACY_M,
  MIN_MOVE_CEIL_M,
  MIN_MOVE_FLOOR_M,
  type IncomingFix,
  type SentFix,
} from '@/lib/geo'

/**
 * Politique de relevé GPS : « la carte est trop peu précise ».
 *
 * Trois décisions sont testées ici, toutes pures :
 *   - quelle précision demander au navigateur selon l'usage (batterie) ;
 *   - à partir de quelle distance un déplacement est réel plutôt que du bruit
 *     d'antenne ;
 *   - faut-il, au bout du compte, écrire ce point en base.
 */

const TIMING = { minIntervalMs: 30_000, maxSilenceMs: 180_000 }

/** Point de référence : place de la Concorde. */
const HERE = { lat: 48.8656, lng: 2.3212 }

/** Déplace un point de `meters` vers le nord (1° de latitude ≈ 111 320 m). */
function north(from: { lat: number; lng: number }, meters: number) {
  return { lat: from.lat + meters / 111_320, lng: from.lng }
}

function sent(at: number): SentFix {
  return { ...HERE, at }
}

function incoming(over: Partial<IncomingFix> = {}): IncomingFix {
  return { ...HERE, at: 0, accuracy: 10, ...over }
}

describe('geoWatchMode — haute précision seulement quand ça se voit', () => {
  it('demande le GPS quand l’app est visible et qu’on s’en sert', () => {
    expect(geoWatchMode({ hidden: false, idle: false })).toBe('high')
  })

  it('retombe en basse précision après une longue inactivité', () => {
    expect(geoWatchMode({ hidden: false, idle: true })).toBe('low')
  })

  it('coupe tout quand l’onglet passe en arrière-plan', () => {
    expect(geoWatchMode({ hidden: true, idle: false })).toBe('off')
    // L'arrière-plan gagne sur l'inactivité : rien ne tourne écran éteint.
    expect(geoWatchMode({ hidden: true, idle: true })).toBe('off')
  })
})

describe('geoWatchOptions — fraîcheur contre batterie', () => {
  it('haute précision : GPS, position fraîche, délai large pour un premier verrouillage', () => {
    const high = geoWatchOptions('high')
    expect(high.enableHighAccuracy).toBe(true)
    // L'ancien réglage tolérait une position d'une minute : à pied, 80 m d'écart.
    expect(high.maximumAge).toBeLessThanOrEqual(5_000)
    expect(high.timeout).toBeGreaterThanOrEqual(20_000)
  })

  it('basse précision : réseau, réponse rapide, position réutilisable plus longtemps', () => {
    const low = geoWatchOptions('low')
    expect(low.enableHighAccuracy).toBe(false)
    expect(low.maximumAge).toBeGreaterThan(geoWatchOptions('high').maximumAge!)
    expect(low.timeout).toBeLessThan(geoWatchOptions('high').timeout!)
  })
})

describe('minMoveDistance — le seuil suit la précision annoncée', () => {
  it('descend au plancher quand le point est fin', () => {
    expect(minMoveDistance(4)).toBe(MIN_MOVE_FLOOR_M)
    expect(minMoveDistance(8)).toBe(MIN_MOVE_FLOOR_M)
  })

  it('suit la précision dans la zone intermédiaire', () => {
    expect(minMoveDistance(20)).toBe(30)
    expect(minMoveDistance(30)).toBe(45)
  })

  it('plafonne pour les points flous', () => {
    expect(minMoveDistance(90)).toBe(MIN_MOVE_CEIL_M)
    expect(minMoveDistance(400)).toBe(MIN_MOVE_CEIL_M)
  })

  it('se méfie d’une précision inconnue ou aberrante', () => {
    expect(minMoveDistance(null)).toBe(MIN_MOVE_CEIL_M)
    expect(minMoveDistance(undefined)).toBe(MIN_MOVE_CEIL_M)
    expect(minMoveDistance(Number.NaN)).toBe(MIN_MOVE_CEIL_M)
    expect(minMoveDistance(-1)).toBe(MIN_MOVE_CEIL_M)
  })

  it('reste toujours dans les bornes', () => {
    for (const a of [1, 5, 13, 27, 42, 61, 119, 5_000]) {
      const d = minMoveDistance(a)
      expect(d).toBeGreaterThanOrEqual(MIN_MOVE_FLOOR_M)
      expect(d).toBeLessThanOrEqual(MIN_MOVE_CEIL_M)
    }
  })
})

describe('shouldSendFix — quand écrire un point', () => {
  it('accepte le tout premier point, même flou', () => {
    expect(shouldSendFix(null, incoming({ accuracy: 900 }), TIMING)).toBe('first')
  })

  it('refuse deux écritures trop rapprochées', () => {
    const verdict = shouldSendFix(sent(0), incoming({ at: 10_000, ...north(HERE, 500) }), TIMING)
    expect(verdict).toBe('throttled')
    expect(fixAccepted(verdict)).toBe(false)
  })

  it('ignore un point manifestement imprécis', () => {
    const verdict = shouldSendFix(sent(0), incoming({ at: 60_000, accuracy: MAX_ACCURACY_M + 1, ...north(HERE, 300) }), TIMING)
    expect(verdict).toBe('inaccurate')
    expect(fixAccepted(verdict)).toBe(false)
  })

  it('accepte quand même un point flou pour rompre un long silence', () => {
    const verdict = shouldSendFix(sent(0), incoming({ at: 200_000, accuracy: 800 }), TIMING)
    expect(verdict).toBe('heartbeat')
    expect(fixAccepted(verdict)).toBe(true)
  })

  it('retient un tremblement d’antenne : la précision n’explique pas moins', () => {
    // ±30 m annoncés, 20 m d'écart : indiscernable de l'immobilité.
    expect(shouldSendFix(sent(0), incoming({ at: 60_000, accuracy: 30, ...north(HERE, 20) }), TIMING)).toBe('still')
  })

  it('retient un point identique', () => {
    expect(shouldSendFix(sent(0), incoming({ at: 60_000 }), TIMING)).toBe('still')
  })

  it('enregistre une vraie marche quand le GPS est fin — ce que les 40 m aveugles avalaient', () => {
    const verdict = shouldSendFix(sent(0), incoming({ at: 60_000, accuracy: 6, ...north(HERE, 20) }), TIMING)
    expect(verdict).toBe('moved')
    expect(fixAccepted(verdict)).toBe(true)
  })

  it('renvoie un point même immobile après trois minutes', () => {
    expect(shouldSendFix(sent(0), incoming({ at: 180_000 }), TIMING)).toBe('heartbeat')
  })

  it('l’anti-spam passe avant tout le reste', () => {
    // Silence dépassé mais horodatages rapprochés : c'est l'anti-spam qui tranche.
    expect(shouldSendFix(sent(0), incoming({ at: 29_999, ...north(HERE, 5_000) }), TIMING)).toBe('throttled')
  })

  it('précision inconnue : on applique le seuil plafond', () => {
    expect(shouldSendFix(sent(0), incoming({ at: 60_000, accuracy: null, ...north(HERE, 50) }), TIMING)).toBe('still')
    expect(shouldSendFix(sent(0), incoming({ at: 60_000, accuracy: null, ...north(HERE, 70) }), TIMING)).toBe('moved')
  })
})

describe('haversine — l’assise du seuil', () => {
  it('mesure un déplacement plein nord au mètre près', () => {
    expect(haversine(HERE, north(HERE, 100))).toBeCloseTo(100, 0)
  })
})
