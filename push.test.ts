import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: {} },
}))

import {
  base64UrlVersOctets,
  octetsVersBase64Url,
  evaluerEtatPush,
  etatActionnable,
  MESSAGE_ETAT,
  type ContextePush,
  type EtatPush,
} from '../push'

/** La vraie clé publique VAPID du projet — publique par nature. */
const CLE_VAPID = 'BLPUolQ6fYI14JwalQk3erFyiwU-hqcIkqhBg5DwPEWhsHXh-aFnzk4sd9BXH5IuQfIh4wiKZ6C_yaN_RnniTCQ'

/** Contexte « tout va bien » ; chaque test n’en modifie que ce qui l’intéresse. */
function contexte(sur: Partial<ContextePush> = {}): ContextePush {
  return {
    supporteServiceWorker: true,
    supportePush: true,
    supporteNotification: true,
    permission: 'default',
    estIOS: false,
    estInstallee: true,
    abonne: false,
    ...sur,
  }
}

describe('conversion de la clé VAPID', () => {
  it('décode la clé du projet en un point P-256 non compressé de 65 octets', () => {
    const octets = base64UrlVersOctets(CLE_VAPID)
    expect(octets).toBeInstanceOf(Uint8Array)
    expect(octets.length).toBe(65)
    // 0x04 = point non compressé : c’est ce qu’attend pushManager.subscribe().
    expect(octets[0]).toBe(0x04)
  })

  it('gère l’alphabet base64url (- et _) et l’absence de bourrage', () => {
    // « -_-_ » ≡ « +/+/ » en base64 standard → 0xFB 0xFF 0xBF.
    expect(Array.from(base64UrlVersOctets('-_-_'))).toEqual([251, 255, 191])
    expect(Array.from(base64UrlVersOctets('AQAB'))).toEqual([1, 0, 1])
    // Longueurs 2 et 3 modulo 4 : le bourrage est reconstitué.
    expect(base64UrlVersOctets('AQ').length).toBe(1)
    expect(base64UrlVersOctets('AQA').length).toBe(2)
  })

  it('tolère les espaces autour de la clé (copier-coller depuis un .env)', () => {
    expect(base64UrlVersOctets(`  ${CLE_VAPID}\n`).length).toBe(65)
  })

  it('fait l’aller-retour sans perte', () => {
    const octets = base64UrlVersOctets(CLE_VAPID)
    const buffer = octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer
    expect(octetsVersBase64Url(buffer)).toBe(CLE_VAPID)
  })

  it('renvoie une chaîne vide pour une clé absente', () => {
    expect(octetsVersBase64Url(null)).toBe('')
  })

  it('n’émet jamais de caractère hors alphabet base64url', () => {
    const octets = new Uint8Array([251, 255, 190, 0, 127])
    const encode = octetsVersBase64Url(octets.buffer as ArrayBuffer)
    expect(encode).toMatch(/^[A-Za-z0-9_-]*$/)
  })
})

describe('machine à états du réglage', () => {
  it('propose l’activation quand tout est prêt', () => {
    expect(evaluerEtatPush(contexte())).toBe('a-activer')
  })

  it('se déclare actif seulement si la permission est donnée ET l’abonnement en place', () => {
    expect(evaluerEtatPush(contexte({ permission: 'granted', abonne: true }))).toBe('active')
    // Permission accordée mais abonnement perdu (navigateur réinitialisé) : à refaire.
    expect(evaluerEtatPush(contexte({ permission: 'granted', abonne: false }))).toBe('a-activer')
  })

  it('reconnaît un refus du navigateur', () => {
    expect(evaluerEtatPush(contexte({ permission: 'denied' }))).toBe('refusee')
    // Un refus reste un refus, même si un vieil abonnement traîne encore.
    expect(evaluerEtatPush(contexte({ permission: 'denied', abonne: true }))).toBe('refusee')
  })

  it('déclare non supporté un navigateur sans service worker, sans Push ou sans Notification', () => {
    expect(evaluerEtatPush(contexte({ supporteServiceWorker: false }))).toBe('non-supporte')
    expect(evaluerEtatPush(contexte({ supportePush: false }))).toBe('non-supporte')
    expect(evaluerEtatPush(contexte({ supporteNotification: false }))).toBe('non-supporte')
  })

  it('sur iPhone hors écran d’accueil, explique le geste au lieu de dire « non supporté »', () => {
    // Safari sur iOS ne montre PushManager qu’une fois la PWA installée : sans ce
    // cas dédié, on afficherait « ton navigateur ne sait pas faire », ce qui est faux.
    const safariIOS = contexte({ estIOS: true, estInstallee: false, supportePush: false, supporteServiceWorker: false })
    expect(evaluerEtatPush(safariIOS)).toBe('ios-non-installee')
  })

  it('sur iPhone installé, reprend le parcours normal', () => {
    expect(evaluerEtatPush(contexte({ estIOS: true, estInstallee: true }))).toBe('a-activer')
    expect(evaluerEtatPush(contexte({ estIOS: true, estInstallee: true, permission: 'granted', abonne: true }))).toBe('active')
    expect(evaluerEtatPush(contexte({ estIOS: true, estInstallee: true, permission: 'denied' }))).toBe('refusee')
  })

  it('n’autorise le geste que dans les états où il a un sens', () => {
    expect(etatActionnable('a-activer')).toBe(true)
    expect(etatActionnable('active')).toBe(true)
    // Insister sur un refus ne ferait que rejouer un échec : le navigateur ne
    // repose plus la question.
    expect(etatActionnable('refusee')).toBe(false)
    expect(etatActionnable('non-supporte')).toBe(false)
    expect(etatActionnable('ios-non-installee')).toBe(false)
  })
})

describe('messages du réglage', () => {
  const etats: EtatPush[] = ['non-supporte', 'ios-non-installee', 'a-activer', 'refusee', 'active']

  it('donne un message à chaque état, sans emoji', () => {
    for (const etat of etats) {
      expect(MESSAGE_ETAT[etat]).toBeTruthy()
      expect(MESSAGE_ETAT[etat]).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(MESSAGE_ETAT[etat]).not.toContain("'")
    }
  })

  it('explique quoi faire quand c’est refusé ou pas installé, plutôt que de constater l’échec', () => {
    expect(MESSAGE_ETAT['ios-non-installee']).toContain('écran d’accueil')
    expect(MESSAGE_ETAT.refusee).toContain('Réglages')
  })

  it('ne promet jamais de dévoiler un contenu', () => {
    for (const etat of etats) {
      expect(MESSAGE_ETAT[etat].toLowerCase()).not.toContain('contenu de')
    }
  })
})
