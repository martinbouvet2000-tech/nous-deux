import { describe, it, expect } from 'vitest'
import {
  getCurrentSlot, localClockIn, timeToMinutes, slotIconKind, currentSlotPhrase,
  deletableIds, indexByWeekday, partialDeleteMessage, slotCount,
} from '../schedule'
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

describe('sélection multiple de créneaux', () => {
  const mien = (id: string, weekday: number, start = '08:00:00') => slot(id, weekday, start, '09:00:00')
  const sien = (id: string, weekday: number) => ({ ...slot(id, weekday, '08:00:00', '09:00:00'), user_id: 'partenaire' })

  it('range les créneaux par jour, triés par heure de début', () => {
    const index = indexByWeekday([mien('tard', 1, '18:00:00'), mien('tot', 1, '07:00:00'), mien('mardi', 2)])
    expect(index.get(1)?.map((s) => s.id)).toEqual(['tot', 'tard'])
    expect(index.get(2)?.map((s) => s.id)).toEqual(['mardi'])
    // Les sept jours existent toujours, même vides : pas de `undefined` à l'affichage.
    expect(index.get(5)).toEqual([])
  })

  it('ne rend supprimable que ce qui est coché ET qui m’appartient', () => {
    const slots = [mien('a', 1), sien('b', 1), mien('c', 2)]
    // Même en cochant l'identifiant du partenaire, il ne partira jamais.
    expect(deletableIds(slots, new Set(['a', 'b', 'c']), 'u')).toEqual(['a', 'c'])
    expect(deletableIds(slots, new Set(['b']), 'u')).toEqual([])
    expect(deletableIds(slots, new Set(['a']), null)).toEqual([])
    expect(deletableIds(slots, new Set(), 'u')).toEqual([])
  })

  it('garde l’ordre de la liste, pour savoir ce qui est parti après un échec', () => {
    const slots = [mien('a', 1), mien('b', 1), mien('c', 1)]
    expect(deletableIds(slots, new Set(['c', 'a']), 'u')).toEqual(['a', 'c'])
  })

  it('accorde le décompte et la phrase d’échec partiel', () => {
    expect(slotCount(0)).toBe('0 créneau')
    expect(slotCount(1)).toBe('1 créneau')
    expect(slotCount(40)).toBe('40 créneaux')
    expect(partialDeleteMessage(40, 60)).toBe('40 créneaux sur 60 ont été supprimés.')
    expect(partialDeleteMessage(1, 3)).toBe('1 créneau sur 3 a été supprimé.')
    expect(partialDeleteMessage(0, 2)).toBe('0 créneau sur 2 a été supprimé.')
    expect(partialDeleteMessage(0, 2)).not.toContain('supprimér')
  })
})
