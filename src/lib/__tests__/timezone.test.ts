import { describe, it, expect } from 'vitest'
import { timezoneDiffLabel, utcOffsetMinutes, timezoneCity, isValidTimezone } from '../timezone'

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
})
