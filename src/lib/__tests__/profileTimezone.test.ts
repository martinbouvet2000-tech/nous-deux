import { describe, it, expect, afterEach } from 'vitest'
import {
  capitalizeFirst, formatDayMonthFR, formatDayMonthShortFR, formatLongDateFR, formatMonthYearFR,
} from '@/lib/dates'
import { formatTimeIn, toZonedInputValue, zonedCivilDate, zonedDateKey, zonedInputToDate } from '@/lib/timezone'
import { countdownTargetIn } from '@/lib/today'

/**
 * ═══ Le fuseau de référence est celui du PROFIL, jamais celui du navigateur ═══
 *
 * Martin voyage : son profil reste à Varsovie pendant que son navigateur annonce
 * Kiritimati (UTC+14) ou Midway (UTC-11). Tout ce qui porte un jour ou une heure —
 * le vlog, son regroupement par mois, l'échéance des retrouvailles — doit rester
 * identique dans les trois cas. Ces tests figent ce contrat côté helpers, ceux-là
 * mêmes qu'appellent `VlogFeed`, `VlogComposer` et `Dashboard`.
 */

const VARSOVIE = 'Europe/Warsaw'
/** Deux navigateurs volontairement extrêmes : +14 h et -11 h par rapport à UTC */
const NAVIGATEUR_EN_AVANCE = 'Pacific/Kiritimati'
const NAVIGATEUR_EN_RETARD = 'Pacific/Midway'
const NAVIGATEURS = [VARSOVIE, NAVIGATEUR_EN_AVANCE, NAVIGATEUR_EN_RETARD]

const TZ_INITIALE = process.env.TZ

/** Rejoue `fn` comme si le navigateur était dans `tz` (Node relit `TZ` à chaud). */
function depuisLeNavigateur<T>(tz: string, fn: () => T): T {
  const avant = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    if (avant === undefined) delete process.env.TZ
    else process.env.TZ = avant
  }
}

afterEach(() => {
  if (TZ_INITIALE === undefined) delete process.env.TZ
  else process.env.TZ = TZ_INITIALE
})

/* ─────────────── Vlog : un vlog de 23:30 reste le vlog du soir même ─────────────── */

/** Vendredi 28 août 2026, 23:30 à Varsovie (CEST, UTC+2) */
const VLOG_TARD = new Date('2026-08-28T21:30:00.000Z')

/** Ce que calcule le pied d'une carte de vlog */
const libelleCarte = (tz: string, at: Date) => capitalizeFirst(formatDayMonthFR(zonedCivilDate(tz, at)))
/** Ce que calcule l'en-tête de mois du fil */
const cleDeMois = (tz: string, at: Date) => zonedDateKey(tz, at).slice(0, 7)
const libelleDeMois = (tz: string, at: Date) => capitalizeFirst(formatMonthYearFR(zonedCivilDate(tz, at)))

describe('vlog daté à 23:30 heure de Varsovie', () => {
  it('affiche le même jour civil quel que soit le fuseau du navigateur', () => {
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        expect(libelleCarte(VARSOVIE, VLOG_TARD)).toBe('Vendredi 28 août')
        expect(formatDayMonthShortFR(zonedCivilDate(VARSOVIE, VLOG_TARD))).toBe('28 août')
        expect(capitalizeFirst(formatLongDateFR(zonedCivilDate(VARSOVIE, VLOG_TARD)))).toBe('Vendredi 28 août 2026')
      })
    }
  })

  it('affiche la même heure partout — une seule horloge dans toute l’app', () => {
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        expect(formatTimeIn(VARSOVIE, VLOG_TARD)).toBe('23:30')
      })
    }
  })

  it('ne dérive pas non plus dans le regroupement par mois', () => {
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        expect(cleDeMois(VARSOVIE, VLOG_TARD)).toBe('2026-08')
        expect(libelleDeMois(VARSOVIE, VLOG_TARD)).toBe('Août 2026')
      })
    }
  })

  it('un vlog de fin de mois ne change pas de mois selon le navigateur', () => {
    // Lundi 31 août 2026, 23:30 à Varsovie : le 1er septembre pour un navigateur en avance
    const finDeMois = new Date('2026-08-31T21:30:00.000Z')
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        expect(cleDeMois(VARSOVIE, finDeMois)).toBe('2026-08')
        expect(libelleCarte(VARSOVIE, finDeMois)).toBe('Lundi 31 août')
      })
    }
  })

  it('c’est bien le fuseau du navigateur qui faisait dériver l’affichage', () => {
    // Le calcul fautif — les composantes LOCALES de l'instant — donne le lendemain
    // pour un navigateur en avance, et le bon jour pour un navigateur en retard :
    // deux réponses différentes pour le même vlog. C'est exactement le défaut corrigé.
    const fautif = (navigateur: string) => depuisLeNavigateur(navigateur, () => capitalizeFirst(formatDayMonthFR(VLOG_TARD)))
    expect(fautif(NAVIGATEUR_EN_AVANCE)).toBe('Samedi 29 août')
    expect(fautif(NAVIGATEUR_EN_RETARD)).toBe('Vendredi 28 août')
    expect(fautif(NAVIGATEUR_EN_AVANCE)).not.toBe(fautif(NAVIGATEUR_EN_RETARD))
  })
})

/* ─────────────── Composeur : ce que tu lis dans le champ est ce qui est enregistré ─────────────── */

describe('date et heure proposées par le composeur de vlog', () => {
  it('propose l’heure qu’il est CHEZ TOI, pas celle du navigateur', () => {
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        expect(toZonedInputValue(VARSOVIE, VLOG_TARD)).toBe('2026-08-28T23:30')
      })
    }
  })

  it('relit la saisie dans ton fuseau : aller-retour sans dérive', () => {
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        const saisie = toZonedInputValue(VARSOVIE, VLOG_TARD)
        expect(zonedInputToDate(VARSOVIE, saisie).toISOString()).toBe(VLOG_TARD.toISOString())
      })
    }
  })
})

/* ─────────────── Compte à rebours : ni la veille, ni le lendemain ─────────────── */

describe('échéance du compte à rebours', () => {
  /** Ce que l'accueil enregistre pour « 1er mars 2027 » depuis Varsovie : 23:59 sur place */
  const INSTANT_STOCKE = '2027-03-01T22:59:00+00:00'

  it('affiche le jour choisi, quel que soit le fuseau du navigateur', () => {
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        const cible = countdownTargetIn(VARSOVIE, INSTANT_STOCKE)
        expect(formatLongDateFR(zonedCivilDate(VARSOVIE, cible))).toBe('lundi 1er mars 2027')
      })
    }
  })

  it('ne dérive ni vers la veille ni vers le lendemain sur une date nue', () => {
    for (const navigateur of NAVIGATEURS) {
      depuisLeNavigateur(navigateur, () => {
        const cible = countdownTargetIn(VARSOVIE, '2027-03-01')
        expect(zonedDateKey(VARSOVIE, cible)).toBe('2027-03-01')
        expect(formatLongDateFR(zonedCivilDate(VARSOVIE, cible))).toBe('lundi 1er mars 2027')
        // Date nue = fin de journée sur place, pour que « J-0 » tienne toute la journée
        expect(formatTimeIn(VARSOVIE, cible)).toBe('23:59')
      })
    }
  })

  it('lit une date nue et l’instant enregistré comme la même échéance', () => {
    expect(countdownTargetIn(VARSOVIE, '2027-03-01').toISOString()).toBe('2027-03-01T22:59:00.000Z')
    expect(countdownTargetIn(VARSOVIE, INSTANT_STOCKE).toISOString()).toBe('2027-03-01T22:59:00.000Z')
  })

  it('prend l’heure murale telle quelle quand la valeur en porte une', () => {
    expect(countdownTargetIn(VARSOVIE, '2027-03-01T18:30').toISOString()).toBe('2027-03-01T17:30:00.000Z')
    expect(formatTimeIn(VARSOVIE, countdownTargetIn(VARSOVIE, '2027-03-01T18:30:00'))).toBe('18:30')
  })

  it('reste juste pour un profil qui n’est pas le tien (Paris) et à cheval sur un mois', () => {
    const cible = countdownTargetIn('Europe/Paris', '2027-02-28')
    expect(zonedDateKey('Europe/Paris', cible)).toBe('2027-02-28')
    expect(formatLongDateFR(zonedCivilDate('Europe/Paris', cible))).toBe('dimanche 28 février 2027')
  })

  it('refuse une valeur vide sans planter', () => {
    expect(Number.isNaN(countdownTargetIn(VARSOVIE, '').getTime())).toBe(true)
  })
})
