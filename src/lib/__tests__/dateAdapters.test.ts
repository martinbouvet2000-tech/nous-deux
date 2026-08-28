import { describe, it, expect } from 'vitest'
import { formatDayMonthFR, formatLongDateFR, parseDateInputValue, toDateInputValue } from '@/lib/dates'

/**
 * Régression « compte à rebours de la veille » (accueil).
 *
 * L'accueil lisait l'échéance des retrouvailles avec `new Date(target_date)`.
 * Sur une date nue « aaaa-mm-jj », la spec ECMAScript impose une lecture en UTC :
 * dans tout fuseau négatif (Amérique), minuit UTC tombe la veille en heure locale,
 * et la carte annonçait donc un jour trop tôt.
 *
 * Le correctif lit la valeur par ses composantes civiles (`parseDateInputValue`,
 * indépendant du fuseau) et ne retombe sur `new Date` que pour un instant complet.
 * Ces tests figent ce contrat de lecture. L'accueil va plus loin depuis : il
 * rapporte l'échéance au fuseau du PROFIL (`countdownTargetIn`, `lib/today.ts`) —
 * voir `profileTimezone.test.ts`.
 */

/** Lecture « composantes civiles », socle de `countdownTargetIn` */
const countdownTarget = (value: string): Date => parseDateInputValue(value) ?? new Date(value)

describe('échéance d’un compte à rebours', () => {
  it('lit une date nue comme minuit LOCAL, pas minuit UTC', () => {
    const target = countdownTarget('2026-03-01')
    expect(target.getFullYear()).toBe(2026)
    expect(target.getMonth()).toBe(2) // mars
    expect(target.getDate()).toBe(1)
    expect(target.getHours()).toBe(0)
    expect(target.getMinutes()).toBe(0)
  })

  it('conserve le jour civil saisi, quel que soit le fuseau du navigateur', () => {
    for (const value of ['2026-01-01', '2026-03-01', '2026-07-14', '2026-12-31']) {
      expect(toDateInputValue(countdownTarget(value))).toBe(value)
    }
  })

  it('affiche « 1er » et jamais la veille', () => {
    expect(formatLongDateFR(countdownTarget('2026-03-01'))).toBe('dimanche 1er mars 2026')
    expect(formatLongDateFR(countdownTarget('2026-03-02'))).toBe('lundi 2 mars 2026')
  })

  it('se replie sur `new Date` quand la colonne renvoie un instant complet', () => {
    const iso = '2026-03-01T22:59:00.000Z'
    // Un instant horodaté n'est pas une date civile : `parseDateInputValue` le refuse…
    expect(parseDateInputValue(iso)).toBeNull()
    // …et `new Date` est alors la bonne lecture (même instant, à la milliseconde près).
    expect(countdownTarget(iso).toISOString()).toBe(iso)
  })

  it('refuse une valeur vide sans planter (repli sur une date invalide explicite)', () => {
    expect(parseDateInputValue('')).toBeNull()
    expect(Number.isNaN(countdownTarget('').getTime())).toBe(true)
  })
})

/**
 * `GratitudeWidget` affiche une pastille étroite (« 1er mars ») : elle réutilise le
 * « 1er » de `formatDayMonthFR` en retirant le jour de la semaine. Ce test fige
 * l'hypothèse dont dépend ce découpage — le libellé commence toujours par un jour
 * français écrit en UN SEUL mot, suivi du quantième puis du mois.
 */
const dayAndMonthFR = (date: Date): string => formatDayMonthFR(date).split(' ').slice(1).join(' ')

describe('pastille « jour + mois » (accueil)', () => {
  it('écrit « 1er mars » le premier du mois, « 2 mars » ensuite', () => {
    expect(dayAndMonthFR(new Date(2026, 2, 1))).toBe('1er mars')
    expect(dayAndMonthFR(new Date(2026, 2, 2))).toBe('2 mars')
  })

  it('repose sur un jour de semaine en un seul mot, sur les sept jours', () => {
    for (let d = 1; d <= 7; d++) {
      const parts = formatDayMonthFR(new Date(2026, 2, d)).split(' ')
      expect(parts).toHaveLength(3) // jour, quantième, mois
      expect(parts[0]).toMatch(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/)
    }
  })

  it('reste court sur les mois les plus longs', () => {
    expect(dayAndMonthFR(new Date(2026, 8, 1))).toBe('1er septembre')
    expect(dayAndMonthFR(new Date(2026, 11, 25))).toBe('25 décembre')
  })
})
