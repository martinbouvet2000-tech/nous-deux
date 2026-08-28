import { describe, it, expect } from 'vitest'
import { timezoneCity, timezoneRegion, timezoneLabel } from '../timezone'

/**
 * Aucune ville ne doit s’afficher en anglais : le sélecteur de fuseau, la carte
 * du partenaire et l’agenda passent tous par `timezoneCity`.
 */
describe('villes et régions en français', () => {
  it('traduit les villes dont le nom diffère de l’identifiant IANA', () => {
    const attendu: Record<string, string> = {
      'Europe/Warsaw': 'Varsovie',
      'Europe/London': 'Londres',
      'Europe/Lisbon': 'Lisbonne',
      'Europe/Copenhagen': 'Copenhague',
      'Europe/Vienna': 'Vienne',
      'Europe/Moscow': 'Moscou',
      'Africa/Algiers': 'Alger',
      'Africa/Cairo': 'Le Caire',
      'America/Mexico_City': 'Mexico',
      'America/Havana': 'La Havane',
      'Asia/Seoul': 'Séoul',
      'Asia/Singapore': 'Singapour',
      'Asia/Tehran': 'Téhéran',
      'Indian/Reunion': 'La Réunion',
      'Pacific/Easter': 'Île de Pâques',
    }
    for (const [tz, ville] of Object.entries(attendu)) {
      expect(timezoneCity(tz)).toBe(ville)
    }
  })

  it('mappe aussi les identifiants historiques (alias) sur le même nom', () => {
    expect(timezoneCity('Asia/Calcutta')).toBe(timezoneCity('Asia/Kolkata'))
    expect(timezoneCity('Asia/Saigon')).toBe(timezoneCity('Asia/Ho_Chi_Minh'))
    expect(timezoneCity('Atlantic/Faeroe')).toBe(timezoneCity('Atlantic/Faroe'))
  })

  it('ne laisse passer aucun nom anglais parmi les villes traduites', () => {
    for (const tz of ['Europe/Warsaw', 'Europe/London', 'Europe/Athens', 'Asia/Damascus', 'Atlantic/Azores']) {
      const brut = (tz.split('/').pop() ?? '').replace(/_/g, ' ')
      expect(timezoneCity(tz)).not.toBe(brut)
    }
  })

  it('garde le repli générique pour les villes identiques en français', () => {
    expect(timezoneCity('America/New_York')).toBe('New York')
    expect(timezoneCity('Europe/Paris')).toBe('Paris')
    expect(timezoneCity('UTC')).toBe('UTC')
  })

  it('nomme les régions en français', () => {
    expect(timezoneRegion('Europe/Warsaw')).toBe('Europe')
    expect(timezoneRegion('America/New_York')).toBe('Amériques')
    expect(timezoneRegion('Indian/Reunion')).toBe('Océan Indien')
    expect(timezoneRegion('UTC')).toBe('Autres')
  })

  it('compose un libellé lisible pour une liste à plat', () => {
    expect(timezoneLabel('Europe/Warsaw')).toBe('Europe · Varsovie')
    expect(timezoneLabel('UTC')).toBe('UTC')
  })
})
