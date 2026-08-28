import { describe, it, expect } from 'vitest'
import {
  timezoneDiffLabel, utcOffsetMinutes, timezoneCity, isValidTimezone,
  formatTimeIn, zonedDateKey, toZonedInputValue, zonedInputToDate, formatDayTimeIn,
} from '../timezone'

describe('timezone helpers', () => {
  const summer = new Date('2026-07-15T12:00:00Z')
  const winter = new Date('2026-01-15T12:00:00Z')

  it('computes UTC offsets in minutes (DST aware)', () => {
    expect(utcOffsetMinutes('Europe/Paris', summer)).toBe(120)
    expect(utcOffsetMinutes('Europe/Paris', winter)).toBe(60)
    expect(utcOffsetMinutes('Asia/Kolkata', summer)).toBe(330)
    expect(utcOffsetMinutes('UTC', summer)).toBe(0)
  })

  it('formats whole-hour differences', () => {
    expect(timezoneDiffLabel('Europe/Paris', 'Europe/London', summer)).toBe('-1h')
    expect(timezoneDiffLabel('Europe/Paris', 'America/New_York', summer)).toBe('-6h')
    expect(timezoneDiffLabel('Europe/London', 'Europe/Paris', summer)).toBe('+1h')
  })

  it('handles half-hour and 45-minute offsets (India, Nepal)', () => {
    expect(timezoneDiffLabel('Europe/Paris', 'Asia/Kolkata', summer)).toBe('+3h30')
    expect(timezoneDiffLabel('Europe/Paris', 'Asia/Kathmandu', summer)).toBe('+3h45')
  })

  it('returns null when both zones share the same offset', () => {
    expect(timezoneDiffLabel('Europe/Paris', 'Europe/Berlin', summer)).toBeNull()
    expect(timezoneDiffLabel('Europe/Paris', 'Europe/Paris', summer)).toBeNull()
  })

  it('never throws on an invalid zone', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
    expect(timezoneDiffLabel('Europe/Paris', 'Mars/Olympus', summer)).toBeNull()
  })

  it('extracts a readable city', () => {
    expect(timezoneCity('America/New_York')).toBe('New York')
    expect(timezoneCity('UTC')).toBe('UTC')
  })

  it('uses French city names where they differ (FR consistency)', () => {
    expect(timezoneCity('Europe/Warsaw')).toBe('Varsovie')
    expect(timezoneCity('Europe/London')).toBe('Londres')
  })
})

/**
 * Cœur du bug corrigé : un événement stocké à un instant UTC donné doit s'afficher
 * à l'heure locale du FUSEAU DU PROFIL — jamais celle du navigateur de test.
 */
describe('agenda rendering anchored to the profile timezone', () => {
  // Appel vidéo à 20:47 heure de Varsovie (été) == 18:47 UTC
  const utcInstant = new Date('2026-07-15T18:47:00Z')

  it('renders "for you" time in the profile timezone, independent of the test runner tz', () => {
    expect(formatTimeIn('Europe/Warsaw', utcInstant)).toBe('20:47')     // profil à Varsovie
    expect(formatTimeIn('America/New_York', utcInstant)).toBe('14:47')  // profil à New York
    expect(formatTimeIn('Asia/Kolkata', utcInstant)).toBe('00:17')      // +5h30, franchit minuit
  })

  it('round-trips a datetime-local wall time through the profile timezone (summer / DST +2)', () => {
    const wall = '2026-07-15T20:47' // saisi comme heure de Varsovie
    const asUtc = zonedInputToDate('Europe/Warsaw', wall)
    expect(asUtc.toISOString()).toBe('2026-07-15T18:47:00.000Z')
    expect(toZonedInputValue('Europe/Warsaw', asUtc)).toBe(wall)
  })

  it('round-trips a wall time in winter (DST +1)', () => {
    const asUtc = zonedInputToDate('Europe/Warsaw', '2026-01-15T20:47')
    expect(asUtc.toISOString()).toBe('2026-01-15T19:47:00.000Z')
  })

  it('groups an event on the correct civil day per timezone (not the browser day)', () => {
    // 23:30 UTC : déjà le 16 à Varsovie (+2), encore le 15 à New York (-4)
    const lateInstant = new Date('2026-07-15T23:30:00Z')
    expect(zonedDateKey('Europe/Warsaw', lateInstant)).toBe('2026-07-16')
    expect(zonedDateKey('America/New_York', lateInstant)).toBe('2026-07-15')
  })

  it('formats a readable day + time in the profile timezone', () => {
    expect(formatDayTimeIn('Europe/Warsaw', utcInstant)).toBe('mer. 15 · 20:47')
  })
})
