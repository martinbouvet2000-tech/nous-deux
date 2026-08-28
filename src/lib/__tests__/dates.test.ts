import { describe, it, expect } from 'vitest'
import {
  capitalizeFirst, formatDateFR, formatTimeFR, formatDayMonthFR, formatDayMonthShortFR, formatLongDateFR,
  formatMonthYearFR, formatLongDateTimeFR, toDateInputValue, toDateTimeInputValue,
  parseDateInputValue, describeDateInput, describeDateTimeInput, describeTimeInput,
  describeTimeRangeInput, describeDateTimeRangeInput,
} from '../dates'
import { weekdayLabel } from '../schedule'

/** Date civile construite sans passer par une chaîne ISO (donc sans dépendre du fuseau du runner) */
const civil = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0)

describe('formats français', () => {
  it('écrit les dates en jj/mm/aaaa, jamais mm/jj/aaaa', () => {
    // 3 mars : le piège américain donnerait 03/03 → on prend le 4 mars pour lever le doute
    expect(formatDateFR(civil(2026, 3, 4))).toBe('04/03/2026')
    expect(formatDateFR(civil(2026, 12, 25))).toBe('25/12/2026')
  })

  it('écrit les heures sur 24 h, jamais en AM/PM', () => {
    expect(formatTimeFR(civil(2026, 3, 3, 14, 30))).toBe('14:30')
    expect(formatTimeFR(civil(2026, 3, 3, 9, 5))).toBe('09:05')
    expect(formatTimeFR(civil(2026, 3, 3, 23, 59))).toBe('23:59')
  })

  it('affiche minuit comme 00:00 (et non 12:00 AM)', () => {
    expect(formatTimeFR(civil(2026, 3, 3, 0, 0))).toBe('00:00')
    expect(formatLongDateTimeFR(civil(2026, 3, 3, 0, 0))).toBe('mardi 3 mars 2026 à 00:00')
    // Midi ne doit pas être confondu avec minuit
    expect(formatTimeFR(civil(2026, 3, 3, 12, 0))).toBe('12:00')
  })

  it('écrit jours et mois en français, en minuscules', () => {
    expect(formatDayMonthFR(civil(2026, 3, 3))).toBe('mardi 3 mars')
    expect(formatLongDateFR(civil(2026, 3, 3))).toBe('mardi 3 mars 2026')
    expect(formatMonthYearFR(civil(2026, 8, 15))).toBe('août 2026')
    expect(formatLongDateFR(civil(2026, 7, 14))).toBe('mardi 14 juillet 2026')
  })

  it('utilise « 1er » pour le premier du mois, et le chiffre nu ensuite', () => {
    expect(formatLongDateFR(civil(2026, 3, 1))).toBe('dimanche 1er mars 2026')
    expect(formatLongDateFR(civil(2026, 1, 1))).toBe('jeudi 1er janvier 2026')
    expect(formatLongDateFR(civil(2026, 3, 2))).toBe('lundi 2 mars 2026')
    expect(formatLongDateFR(civil(2026, 3, 21))).toBe('samedi 21 mars 2026')
  })

  it('gère le 29 février des années bissextiles', () => {
    expect(formatLongDateFR(civil(2028, 2, 29))).toBe('mardi 29 février 2028')
    expect(formatDateFR(civil(2028, 2, 29))).toBe('29/02/2028')
    // 2026 n'est pas bissextile : le 29 février n'existe pas
    expect(parseDateInputValue('2026-02-29')).toBeNull()
    expect(parseDateInputValue('2028-02-29')).not.toBeNull()
    // 2100 n'est pas bissextile (règle séculaire)
    expect(parseDateInputValue('2100-02-29')).toBeNull()
    expect(parseDateInputValue('2000-02-29')).not.toBeNull()
  })

  it('ne met la majuscule que sur la première lettre', () => {
    expect(capitalizeFirst('mardi 3 mars 2026')).toBe('Mardi 3 mars 2026')
    expect(capitalizeFirst('')).toBe('')
    // Le reste de la chaîne est laissé intact (pas de « Mardi 3 Mars »)
    expect(capitalizeFirst(formatLongDateFR(civil(2026, 3, 3)))).toBe('Mardi 3 mars 2026')
  })
})

describe('valeurs de champs natifs', () => {
  it('sérialise en heure civile, jamais via toISOString', () => {
    expect(toDateInputValue(civil(2026, 3, 4))).toBe('2026-03-04')
    expect(toDateTimeInputValue(civil(2026, 3, 4, 18, 0))).toBe('2026-03-04T18:00')
    // 00:30 le 4 mars : toISOString reculerait d'un jour dans les fuseaux à l'est de Greenwich
    expect(toDateInputValue(civil(2026, 3, 4, 0, 30))).toBe('2026-03-04')
  })

  it('relit une valeur de champ sans dépendre du fuseau', () => {
    const d = parseDateInputValue('2026-03-04T14:30')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(2)
    expect(d?.getDate()).toBe(4)
    expect(d?.getHours()).toBe(14)
    expect(d?.getMinutes()).toBe(30)
    // Aller-retour stable
    expect(toDateTimeInputValue(d!)).toBe('2026-03-04T14:30')
  })

  it('refuse les valeurs vides, mal formées ou impossibles', () => {
    for (const bad of ['', '  ', '04/03/2026', '2026-3-4', '2026-13-01', '2026-02-31', '2026-03-04T25:00', '2026-03-04T12:75']) {
      expect(parseDateInputValue(bad)).toBeNull()
    }
  })
})

describe('échos français sous les champs natifs', () => {
  it('relit un <input type="date"> en toutes lettres', () => {
    expect(describeDateInput('2026-03-03')).toBe('mardi 3 mars 2026')
    expect(describeDateInput('2026-03-01')).toBe('dimanche 1er mars 2026')
    expect(describeDateInput('2028-02-29')).toBe('mardi 29 février 2028')
    expect(describeDateInput('')).toBe('')
  })

  it('relit un <input type="datetime-local"> avec l’heure sur 24 h', () => {
    expect(describeDateTimeInput('2026-03-03T18:00')).toBe('mardi 3 mars 2026 à 18:00')
    expect(describeDateTimeInput('2026-03-03T00:00')).toBe('mardi 3 mars 2026 à 00:00')
    expect(describeDateTimeInput('pas une date')).toBe('')
  })

  it('relit un <input type="time"> sur 24 h', () => {
    expect(describeTimeInput('09:00')).toBe('09:00')
    expect(describeTimeInput('14:30:00')).toBe('14:30')
    expect(describeTimeInput('00:00')).toBe('00:00')
    expect(describeTimeInput('24:00')).toBe('')
    expect(describeTimeInput('')).toBe('')
  })

  it('décrit une plage horaire', () => {
    expect(describeTimeRangeInput('09:00', '10:30')).toBe('de 09:00 à 10:30')
    expect(describeTimeRangeInput('09:00', '')).toBe('à partir de 09:00')
    expect(describeTimeRangeInput('', '10:00')).toBe('')
  })

  it('décrit une plage datée : même jour, puis à cheval sur minuit', () => {
    expect(describeDateTimeRangeInput('2026-03-03T18:00', '2026-03-03T19:00'))
      .toBe('mardi 3 mars 2026, de 18:00 à 19:00')
    expect(describeDateTimeRangeInput('2026-03-03T23:30', '2026-03-04T01:00'))
      .toBe('du mardi 3 mars 2026 à 23:30 au mercredi 4 mars 2026 à 01:00')
    // Fin absente ou invalide : on décrit au moins le début
    expect(describeDateTimeRangeInput('2026-03-03T18:00', '')).toBe('mardi 3 mars 2026 à 18:00')
    expect(describeDateTimeRangeInput('', '2026-03-03T19:00')).toBe('')
  })

  it('reste juste au passage d’une année bissextile', () => {
    expect(describeDateTimeRangeInput('2028-02-28T23:00', '2028-02-29T01:00'))
      .toBe('du lundi 28 février 2028 à 23:00 au mardi 29 février 2028 à 01:00')
  })
})

describe('libellés de jours (lib/schedule)', () => {
  it('écrit les jours en minuscules par défaut', () => {
    expect(weekdayLabel(1)).toBe('lundi')
    expect(weekdayLabel(7)).toBe('dimanche')
  })

  it('capitalise seulement sur demande (titre, étiquette isolée)', () => {
    expect(weekdayLabel(1, true)).toBe('Lundi')
    expect(weekdayLabel(3, true)).toBe('Mercredi')
  })

  it('ne casse pas sur un jour hors bornes', () => {
    expect(weekdayLabel(0)).toBe('')
    expect(weekdayLabel(8)).toBe('')
  })
})

/**
 * Forme courte « 28 août », pour les surfaces étroites (pied d'une carte de vlog) :
 * même typographie française que la forme longue, jour de la semaine en moins.
 */
describe('formatDayMonthShortFR', () => {
  it('écrit « 1er » le premier du mois, un chiffre nu ensuite', () => {
    expect(formatDayMonthShortFR(civil(2026, 3, 1))).toBe('1er mars')
    expect(formatDayMonthShortFR(civil(2026, 3, 2))).toBe('2 mars')
    expect(formatDayMonthShortFR(civil(2026, 8, 28))).toBe('28 août')
  })

  it('reprend exactement la forme longue, sans le jour de la semaine', () => {
    for (const jour of [1, 14, 25, 31]) {
      const date = civil(2026, 12, jour)
      expect(formatDayMonthFR(date).endsWith(formatDayMonthShortFR(date))).toBe(true)
      expect(formatDayMonthShortFR(date).split(' ')).toHaveLength(2)
    }
  })
})
