import { describe, it, expect, vi } from 'vitest'

// `video.ts` parle à Supabase pour la session : le client réel exigerait des
// variables d'environnement, dont ces fonctions pures n'ont que faire.
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

import { compatibleGalerie, formaterOctets, normaliserLien } from '@/lib/video'

describe('normaliserLien', () => {
  it('accepte une adresse complète', () => {
    expect(normaliserLien('https://exemple.fr/video.mp4')).toBe('https://exemple.fr/video.mp4')
  })

  it('ajoute le schéma quand il manque', () => {
    expect(normaliserLien('www.exemple.fr/v/42')).toBe('https://www.exemple.fr/v/42')
  })

  it('extrait le lien noyé dans un texte de partage', () => {
    expect(normaliserLien('Regarde ça ! https://exemple.fr/v/42 c’est fou')).toBe('https://exemple.fr/v/42')
  })

  it('tolère les espaces autour', () => {
    expect(normaliserLien('  https://exemple.fr/v  ')).toBe('https://exemple.fr/v')
  })

  it('refuse le vide et ce qui n’est pas une adresse', () => {
    expect(normaliserLien('')).toBeNull()
    expect(normaliserLien('   ')).toBeNull()
    expect(normaliserLien('coucou')).toBeNull()
  })
})

describe('formaterOctets', () => {
  it('choisit l’unité lisible', () => {
    expect(formaterOctets(900)).toBe('900 o')
    expect(formaterOctets(1024 * 1024 * 3)).toBe('3 Mo')
    expect(formaterOctets(1024 * 1024 * 1024 * 1.5)).toBe('1,5 Go')
  })

  it('rend un tiret quand la taille est inconnue', () => {
    expect(formaterOctets(0)).toBe('—')
    expect(formaterOctets(Number.NaN)).toBe('—')
  })
})

describe('compatibleGalerie', () => {
  it('reconnaît les formats acceptés par les photos d’un téléphone', () => {
    expect(compatibleGalerie('vacances.mp4')).toBe(true)
    expect(compatibleGalerie('vacances.MOV')).toBe(true)
    expect(compatibleGalerie('photo.heic')).toBe(true)
  })

  it('écarte ceux qu’un iPhone refuse', () => {
    expect(compatibleGalerie('clip-4k.webm')).toBe(false)
    expect(compatibleGalerie('clip.mkv')).toBe(false)
    expect(compatibleGalerie('bande-son.mp3')).toBe(false)
  })
})
