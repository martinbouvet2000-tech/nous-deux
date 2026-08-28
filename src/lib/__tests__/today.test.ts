import { describe, it, expect } from 'vitest'
import {
  resolveTimezone, dayKey, shiftDayKey, startOfDayIn, startOfDayISO,
  startOfServerDay, dayKeySet, streakFrom, mutualStreak, countSinceServerDay,
  DAILY_SIGNAL_LIMIT, STREAK_LOOKBACK_DAYS,
} from '../today'
import { isValidTimezone } from '../timezone'

/**
 * Toutes les assertions passent un fuseau explicite : ces tests donnent le même
 * résultat quel que soit le fuseau de la machine qui les exécute.
 *
 * Rappel des fuseaux du couple : Martin à Varsovie, Clarisse à Paris (même
 * décalage) — d'où des cas volontairement joués sur Tokyo / New York pour
 * exercer un vrai écart de journée.
 */

const PARIS = 'Europe/Paris'
const WARSAW = 'Europe/Warsaw'
const TOKYO = 'Asia/Tokyo'
const NY = 'America/New_York'

describe('résolution du fuseau de référence', () => {
  it('garde le fuseau du profil quand il est valide', () => {
    expect(resolveTimezone(WARSAW)).toBe(WARSAW)
    expect(resolveTimezone(PARIS)).toBe(PARIS)
  })

  it('retombe sur un fuseau valide quand le profil est vide ou farfelu', () => {
    expect(isValidTimezone(resolveTimezone(null))).toBe(true)
    expect(isValidTimezone(resolveTimezone(undefined))).toBe(true)
    expect(isValidTimezone(resolveTimezone('Mars/Olympus'))).toBe(true)
    expect(resolveTimezone('Mars/Olympus')).not.toBe('Mars/Olympus')
  })
})

describe('la journée civile, vue du bon endroit', () => {
  it('minuit pile ouvre la journée suivante (été, Paris = UTC+2)', () => {
    expect(dayKey(PARIS, new Date('2026-08-27T21:59:59Z'))).toBe('2026-08-27') // 23:59:59 sur place
    expect(dayKey(PARIS, new Date('2026-08-27T22:00:00Z'))).toBe('2026-08-28') // 00:00:00 sur place
    expect(dayKey(PARIS, new Date('2026-08-27T22:01:00Z'))).toBe('2026-08-28') // 00:01:00 sur place
  })

  it('minuit pile ouvre la journée suivante (hiver, Paris = UTC+1)', () => {
    expect(dayKey(PARIS, new Date('2026-01-14T22:59:59Z'))).toBe('2026-01-14')
    expect(dayKey(PARIS, new Date('2026-01-14T23:00:00Z'))).toBe('2026-01-15')
  })

  it('23 h 59 → 00 h 01 : la journée bascule sur place, pas en UTC', () => {
    const avant = new Date('2026-08-27T21:59:00Z') // 23:59 à Paris
    const apres = new Date('2026-08-27T22:01:00Z') // 00:01 à Paris, le lendemain
    expect(dayKey(PARIS, avant)).toBe('2026-08-27')
    expect(dayKey(PARIS, apres)).toBe('2026-08-28')
    // …alors qu'UTC est encore le 27 dans les deux cas : c'est exactement le bug
    // des « compteurs faux entre minuit et 2 h du matin ».
    expect(dayKey('UTC', apres)).toBe('2026-08-27')
  })

  it('deux fuseaux différents ne voient pas le même jour au même instant', () => {
    const instant = new Date('2026-08-27T22:30:00Z')
    expect(dayKey(PARIS, instant)).toBe('2026-08-28') // 00:30 sur place
    expect(dayKey(TOKYO, instant)).toBe('2026-08-28') // 07:30 sur place
    expect(dayKey(NY, instant)).toBe('2026-08-27')    // 18:30 sur place
    expect(dayKey('UTC', instant)).toBe('2026-08-27')
  })

  it('Varsovie et Paris tombent toujours d’accord (même décalage)', () => {
    for (const iso of ['2026-08-27T22:30:00Z', '2026-01-14T23:30:00Z', '2026-03-29T01:30:00Z']) {
      const at = new Date(iso)
      expect(dayKey(WARSAW, at)).toBe(dayKey(PARIS, at))
    }
  })
})

describe('début de journée (borne des requêtes « depuis ce matin »)', () => {
  it('vise le minuit sur place, été comme hiver', () => {
    expect(startOfDayISO(PARIS, new Date('2026-08-28T09:00:00Z'))).toBe('2026-08-27T22:00:00.000Z')
    expect(startOfDayISO(PARIS, new Date('2026-01-15T09:00:00Z'))).toBe('2026-01-14T23:00:00.000Z')
    expect(startOfDayISO(TOKYO, new Date('2026-08-28T09:00:00Z'))).toBe('2026-08-27T15:00:00.000Z')
  })

  it('gère le passage à l’heure d’été (29 mars 2026 : journée de 23 h)', () => {
    const debut29 = startOfDayIn(PARIS, new Date('2026-03-29T12:00:00Z'))
    const debut30 = startOfDayIn(PARIS, new Date('2026-03-30T12:00:00Z'))
    expect(debut29.toISOString()).toBe('2026-03-28T23:00:00.000Z') // encore CET
    expect(debut30.toISOString()).toBe('2026-03-29T22:00:00.000Z') // déjà CEST
    expect((debut30.getTime() - debut29.getTime()) / 3_600_000).toBe(23)
  })

  it('gère le retour à l’heure d’hiver (25 octobre 2026 : journée de 25 h)', () => {
    const debut25 = startOfDayIn(PARIS, new Date('2026-10-25T12:00:00Z'))
    const debut26 = startOfDayIn(PARIS, new Date('2026-10-26T12:00:00Z'))
    expect(debut25.toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(debut26.toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect((debut26.getTime() - debut25.getTime()) / 3_600_000).toBe(25)
  })
})

describe('décalage d’une clé de jour (arithmétique calendaire pure)', () => {
  it('recule et avance sans se perdre aux frontières', () => {
    expect(shiftDayKey('2026-08-28', -1)).toBe('2026-08-27')
    expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDayKey('2026-02-28', 1)).toBe('2026-03-01') // 2026 n’est pas bissextile
    expect(shiftDayKey('2024-02-28', 1)).toBe('2024-02-29') // 2024 l’est
  })

  it('ne saute aucun jour lors des bascules d’heure', () => {
    expect(shiftDayKey('2026-03-30', -1)).toBe('2026-03-29') // heure d’été
    expect(shiftDayKey('2026-10-26', -1)).toBe('2026-10-25') // heure d’hiver
  })

  it('laisse passer une clé invalide sans exploser', () => {
    expect(shiftDayKey('--', -1)).toBe('--')
  })
})

/**
 * L’anti-spam est la SEULE exception à la règle « le jour, c’est le jour du
 * profil » : la base tranche en UTC (`date_trunc('day', now())`), donc le client
 * aussi. Ces tests figent ce contrat et montrent l’écart avec le jour civil.
 */
describe('fenêtre anti-spam alignée sur la base (journée UTC)', () => {
  it('coupe à minuit UTC, pas à minuit sur place', () => {
    const at = new Date('2026-08-27T23:00:00Z') // 01:00 à Paris, le 28
    expect(startOfServerDay(at).toISOString()).toBe('2026-08-27T00:00:00.000Z')
    expect(startOfDayIn(PARIS, at).toISOString()).toBe('2026-08-27T22:00:00.000Z')
    const ecartHeures = (startOfDayIn(PARIS, at).getTime() - startOfServerDay(at).getTime()) / 3_600_000
    expect(ecartHeures).toBe(22) // à 01:00 du matin sur place, la base compte encore 22 h de la veille
  })

  it('compte les envois du jour comme le trigger `limit_taps_per_day`', () => {
    const now = new Date('2026-08-27T23:00:00Z')
    const envois = [
      '2026-08-26T23:30:00Z', // avant-hier UTC → hors quota
      '2026-08-27T00:00:00Z', // pile la borne → compte
      '2026-08-27T12:00:00Z',
      '2026-08-27T22:15:00Z', // 00:15 à Paris le 28, mais toujours le 27 pour la base
    ]
    expect(countSinceServerDay(envois, now)).toBe(3)
    expect(countSinceServerDay([], now)).toBe(0)
    expect(countSinceServerDay(['pas-une-date'], now)).toBe(0)
  })

  it('expose le même plafond que la base', () => {
    expect(DAILY_SIGNAL_LIMIT).toBe(30)
  })
})

describe('regroupement des instants par journée civile', () => {
  it('classe chaque instant dans le fuseau demandé et ignore les dates invalides', () => {
    const instants = ['2026-08-27T22:30:00Z', new Date('2026-08-27T12:00:00Z'), 'n’importe quoi']
    expect([...dayKeySet(PARIS, instants)].sort()).toEqual(['2026-08-27', '2026-08-28'])
    expect([...dayKeySet('UTC', instants)].sort()).toEqual(['2026-08-27'])
  })
})

/** Fabrique une liste d’instants à partir d’heures locales dans un fuseau. */
function auxHeuresDe(tz: string, murs: string[]): string[] {
  // On passe par startOfDayIn + décalage horaire : suffisant pour des heures pleines.
  return murs.map((mur) => {
    const [jour, heure] = mur.split(' ')
    const minuit = startOfDayIn(tz, new Date(`${jour}T12:00:00Z`))
    return new Date(minuit.getTime() + Number(heure) * 3_600_000).toISOString()
  })
}

describe('série « à deux » (streak)', () => {
  const now = new Date('2026-08-28T09:00:00Z') // 11:00 à Paris, 18:00 à Tokyo

  it('deux jours consécutifs comptent pour deux', () => {
    const jours = ['2026-08-26T10:00:00Z', '2026-08-27T10:00:00Z']
    expect(mutualStreak(PARIS, jours, jours, now)).toBe(2)
  })

  it('la journée en cours, pas encore jouée, ne casse pas la série', () => {
    const jours = ['2026-08-26T10:00:00Z', '2026-08-27T10:00:00Z']
    expect(mutualStreak(PARIS, jours, jours, now)).toBe(2)
    // …et dès qu’elle est jouée, elle s’ajoute
    const avecAujourdhui = [...jours, '2026-08-28T08:00:00Z']
    expect(mutualStreak(PARIS, avecAujourdhui, avecAujourdhui, now)).toBe(3)
  })

  it('un trou d’un jour remet la série à zéro', () => {
    const jours = ['2026-08-25T10:00:00Z', '2026-08-26T10:00:00Z'] // le 27 manque
    expect(mutualStreak(PARIS, jours, jours, now)).toBe(0)
  })

  it('un trou plus ancien coupe la série à l’endroit du trou', () => {
    const jours = ['2026-08-24T10:00:00Z', '2026-08-26T10:00:00Z', '2026-08-27T10:00:00Z', '2026-08-28T08:00:00Z']
    expect(mutualStreak(PARIS, jours, jours, now)).toBe(3) // 28, 27, 26 puis trou le 25
  })

  it('il faut que les DEUX se soient manifestés', () => {
    const moi = ['2026-08-26T10:00:00Z', '2026-08-27T10:00:00Z']
    const elle = ['2026-08-27T10:00:00Z']
    expect(mutualStreak(PARIS, moi, elle, now)).toBe(1)
    expect(mutualStreak(PARIS, moi, [], now)).toBe(0)
  })

  it('un changement de fuseau ne casse pas la série (l’un des deux voyage)', () => {
    const jours = ['2026-08-25T10:00:00Z', '2026-08-26T10:00:00Z', '2026-08-27T10:00:00Z', '2026-08-28T08:00:00Z']
    // Mêmes instants, lus depuis Varsovie puis depuis Tokyo : même série.
    expect(mutualStreak(WARSAW, jours, jours, now)).toBe(4)
    expect(mutualStreak(TOKYO, jours, jours, now)).toBe(4)
    expect(mutualStreak(NY, jours, jours, now)).toBe(4)
  })

  it('tient à travers le passage à l’heure d’été', () => {
    // 12:00 heure de Paris les 27, 28, 29 et 30 mars 2026 (bascule dans la nuit du 28 au 29)
    const jours = auxHeuresDe(PARIS, ['2026-03-27 12', '2026-03-28 12', '2026-03-29 12', '2026-03-30 12'])
    const pendantLaBascule = new Date('2026-03-30T12:00:00Z')
    expect(mutualStreak(PARIS, jours, jours, pendantLaBascule)).toBe(4)
  })

  it('compte un signal envoyé à 00 h 15 sur place pour le bon jour', () => {
    // 00:15 à Paris le 28 août = 22:15 UTC le 27. Le jour civil du profil dit « le 28 ».
    const signal = ['2026-08-27T22:15:00Z']
    const justeApresMinuit = new Date('2026-08-27T23:00:00Z') // 01:00 à Paris, le 28
    expect(mutualStreak(PARIS, signal, signal, justeApresMinuit)).toBe(1)
    // Lu en UTC, le même signal serait rangé la veille — d’où la série qui sautait.
    expect(dayKey('UTC', new Date(signal[0]))).toBe('2026-08-27')
    expect(dayKey(PARIS, new Date(signal[0]))).toBe('2026-08-28')
  })

  it('ne remonte pas au-delà de la fenêtre d’analyse', () => {
    const toujours = () => true
    expect(streakFrom(PARIS, toujours, now)).toBe(STREAK_LOOKBACK_DAYS)
    expect(streakFrom(PARIS, toujours, now, 3)).toBe(3)
    expect(streakFrom(PARIS, () => false, now)).toBe(0)
  })

  it('reste à zéro sur un fuseau inexploitable plutôt que de mentir', () => {
    expect(streakFrom('Mars/Olympus', () => true, now)).toBe(0)
  })
})
