import { describe, it, expect } from 'vitest'
import { getCurrentSlot, localClockIn, timeToMinutes, slotIconKind, currentSlotPhrase } from '../schedule'
import type { ScheduleSlot } from '@/types/database'

const slot = (id: string, weekday: number, start: string, end: string, title = id): ScheduleSlot => ({
  id, user_id: 'u', weekday, start_time: start, end_time: end, title, location: null, color: '#D4A574', created_at: '',
})

// Lundi 2026-08-17 : 10:30 à Paris (UTC+2) = 08:30 UTC
const mondayParis1030 = new Date('2026-08-17T08:30:00Z')

describe('getCurrentSlot', () => {
  const slots = [
    slot('maths', 1, '10:00:00', '12:00:00', 'Cours de maths'),
    slot('sport', 1, '18:00:00', '19:30:00', 'Sport'),
    slot('mardi', 2, '09:00:00', '10:00:00'),
  ]

  it('trouve le créneau en cours et le prochain du jour', () => {
    const r = getCurrentSlot(slots, 'Europe/Paris', mondayParis1030)
    expect(r.weekday).toBe(1)
    expect(r.current?.id).toBe('maths')
    expect(r.next?.id).toBe('sport')
  })

  it('renvoie seulement le prochain quand rien n’est en cours', () => {
    const r = getCurrentSlot(slots, 'Europe/Paris', new Date('2026-08-17T12:30:00Z')) // 14:30 Paris
    expect(r.current).toBeNull()
    expect(r.next?.id).toBe('sport')
  })

  it('gère la fin de journée et minuit', () => {
    const late = [slot('soir', 1, '22:00:00', '23:59:00')]
    // 23:30 Paris lundi = 21:30 UTC
    expect(getCurrentSlot(late, 'Europe/Paris', new Date('2026-08-17T21:30:00Z')).current?.id).toBe('soir')
    // 00:10 Paris mardi = 22:10 UTC lundi → plus de créneau du lundi
    const r = getCurrentSlot(late, 'Europe/Paris', new Date('2026-08-17T22:10:00Z'))
    expect(r.weekday).toBe(2)
    expect(r.current).toBeNull()
    expect(r.next).toBeNull()
  })

  it('utilise le fuseau de la personne (jour différent de l’UTC)', () => {
    // 23:30 UTC lundi = 08:30 mardi à Tokyo
    const r = getCurrentSlot(slots, 'Asia/Tokyo', new Date('2026-08-17T23:30:00Z'))
    expect(r.weekday).toBe(2)
    expect(r.current).toBeNull()
    expect(r.next?.id).toBe('mardi')
    // 23:00 UTC lundi = 19:00 à New York → sport en cours
    expect(getCurrentSlot(slots, 'America/New_York', new Date('2026-08-17T23:00:00Z')).current?.id).toBe('sport')
  })

  it('borne de fin exclusive', () => {
    const r = getCurrentSlot(slots, 'Europe/Paris', new Date('2026-08-17T10:00:00Z')) // 12:00 Paris
    expect(r.current).toBeNull()
  })
})

describe('helpers', () => {
  it('localClockIn', () => {
    expect(localClockIn('Europe/Paris', mondayParis1030)).toEqual({ weekday: 1, minutes: 630 })
    expect(localClockIn('UTC', new Date('2026-08-23T00:05:00Z'))).toEqual({ weekday: 7, minutes: 5 })
  })
  it('timeToMinutes', () => {
    expect(timeToMinutes('08:15:00')).toBe(495)
    expect(timeToMinutes('23:59')).toBe(1439)
  })
  it('slotIconKind', () => {
    expect(slotIconKind('Cours de maths')).toBe('book')
    expect(slotIconKind('Boulot')).toBe('work')
    expect(slotIconKind('Sport')).toBe('sport')
    expect(slotIconKind('Déjeuner')).toBe('meal')
    expect(slotIconKind('Dodo')).toBe('night')
    expect(slotIconKind('Rendez-vous')).toBe('clock')
  })
  it('currentSlotPhrase', () => {
    expect(currentSlotPhrase('Clarisse', 'Cours de maths')).toBe('Clarisse est en cours de maths')
    expect(currentSlotPhrase('Clarisse', 'Sport')).toBe('Clarisse : Sport')
  })
})
