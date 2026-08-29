import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { GENRES_PUSH, messagePush, PRENOM_DEFAUT, DUREE_DE_VIE_S, URGENCE, type GenrePush } from '../pushMessages'
import { MOODS } from '../moods'

/** Le texte exact attendu pour chacun des six gestes, prénom « Clarisse ». */
const ATTENDUS: Record<GenrePush, { titre: string; corps: string; lien: string }> = {
  appel: { titre: 'Envie d’appel', corps: 'Clarisse a envie de t’entendre, là, maintenant.', lien: '/' },
  petit_mot: { titre: 'Petit mot', corps: 'Clarisse t’a laissé un petit mot.', lien: '/' },
  humeur: { titre: 'Humeur du jour', corps: 'Clarisse a posé son humeur. Pose la tienne pour la découvrir.', lien: '/' },
  gratitude: { titre: 'Gratitude', corps: 'Clarisse a noté ses gratitudes du jour.', lien: '/' },
  vlog: { titre: 'Vlog', corps: 'Clarisse a ajouté un moment au vlog.', lien: '/memories' },
  capsule: { titre: 'Capsule à ouvrir', corps: 'Une capsule de Clarisse arrive à sa date. Elle t’attend.', lien: '/memories?tab=capsules' },
}

describe('textes des notifications', () => {
  it('compose exactement le message attendu pour chaque geste', () => {
    for (const genre of GENRES_PUSH) {
      const m = messagePush(genre, 'Clarisse')
      expect(m.titre).toBe(ATTENDUS[genre].titre)
      expect(m.corps).toBe(ATTENDUS[genre].corps)
      expect(m.lien).toBe(ATTENDUS[genre].lien)
    }
  })

  it('retombe sur un libellé neutre quand le prénom manque', () => {
    expect(messagePush('appel', '   ').corps).toContain(PRENOM_DEFAUT)
    expect(messagePush('appel').corps).toContain(PRENOM_DEFAUT)
  })

  it('n’utilise aucun emoji et respecte la typographie française', () => {
    for (const genre of GENRES_PUSH) {
      const m = messagePush(genre, 'Clarisse')
      const texte = `${m.titre} ${m.corps}`
      expect(texte).not.toMatch(/\p{Extended_Pictographic}/u)
      // Apostrophes courbes uniquement — jamais l’apostrophe droite du clavier.
      expect(texte).not.toContain("'")
      // Espace fine insécable obligatoire devant ? ! : ; s’il y en avait.
      expect(texte).not.toMatch(/[a-zA-Zé0-9] [?!:;]/)
    }
  })

  it('donne une étiquette distincte à chaque geste (une notification n’en écrase pas une autre)', () => {
    const etiquettes = GENRES_PUSH.map((g) => messagePush(g, 'Clarisse').etiquette)
    expect(new Set(etiquettes).size).toBe(GENRES_PUSH.length)
  })

  it('ne laisse expirer que l’envie d’appel, et n’urgente qu’elle', () => {
    expect(DUREE_DE_VIE_S.appel).toBeLessThan(DUREE_DE_VIE_S.petit_mot)
    expect(URGENCE.appel).toBe('high')
    for (const genre of GENRES_PUSH.filter((g) => g !== 'appel')) {
      expect(URGENCE[genre]).toBe('normal')
    }
  })
})

/**
 * Le cœur du sujet : une notification s’affiche sur un écran verrouillé.
 * Elle ne doit jamais révéler ce que l’app cache volontairement.
 */
describe('aucune fuite de contenu', () => {
  it('ne nomme jamais l’humeur — ni l’état, ni le libellé, ni l’emoji', () => {
    const tousLesMessages = GENRES_PUSH.map((g) => `${messagePush(g, 'Clarisse').titre} ${messagePush(g, 'Clarisse').corps}`).join(' | ')
    for (const humeur of MOODS) {
      expect(tousLesMessages).not.toContain(humeur.label)
      expect(tousLesMessages).not.toContain(humeur.hint)
      expect(tousLesMessages).not.toContain(humeur.emoji)
      expect(tousLesMessages.toLowerCase()).not.toContain(humeur.key)
    }
    // Le message d’humeur annonce le geste et invite à la réciprocité, rien de plus.
    expect(messagePush('humeur', 'Clarisse').corps).toBe('Clarisse a posé son humeur. Pose la tienne pour la découvrir.')
  })

  it('n’annonce jamais le contenu d’une capsule', () => {
    const capsule = messagePush('capsule', 'Clarisse')
    // Le message est constant : il ne peut structurellement pas transporter un texte scellé.
    expect(capsule.corps).toBe('Une capsule de Clarisse arrive à sa date. Elle t’attend.')
    for (const secret of ['Je t’écris depuis le train', 'rendez-vous à Varsovie', 'bague']) {
      expect(capsule.corps).not.toContain(secret)
    }
  })

  it('n’emporte ni petit mot, ni gratitude, ni légende de vlog', () => {
    const contenus = ['Tu me manques ce soir', 'merci pour le café', 'la plage au coucher du soleil']
    for (const genre of GENRES_PUSH) {
      const m = messagePush(genre, 'Clarisse')
      for (const c of contenus) expect(`${m.titre} ${m.corps}`).not.toContain(c)
    }
  })

  it('ne transporte que le prénom comme partie variable', () => {
    // Deux prénoms différents ne changent QUE le prénom : rien d’autre n’est interpolé.
    for (const genre of GENRES_PUSH) {
      const a = messagePush(genre, 'Martin')
      const b = messagePush(genre, 'Clarisse')
      expect(a.corps.replace('Martin', '§')).toBe(b.corps.replace('Clarisse', '§'))
      expect(a.titre).toBe(b.titre)
    }
  })
})

/**
 * Les messages sont réellement composés par les déclencheurs SQL. Ce bloc relit
 * la migration pour vérifier que le dépôt et la base racontent la même histoire —
 * et surtout qu’aucun appel à `envoyer_push` ne lit une colonne de contenu.
 */
describe('la migration SQL dit la même chose', () => {
  const dossier = resolve(process.cwd(), 'supabase/migrations')
  const fichier = readdirSync(dossier).find((f) => f.endsWith('_notifications_push.sql'))
  const sql = fichier ? readFileSync(join(dossier, fichier), 'utf-8') : ''

  it('la migration existe', () => {
    expect(fichier).toBeTruthy()
    expect(sql.length).toBeGreaterThan(1000)
  })

  it('reprend mot pour mot les six textes, leurs liens et leurs étiquettes', () => {
    for (const genre of GENRES_PUSH) {
      const m = messagePush(genre, '§PRENOM§')
      expect(sql).toContain(m.titre)
      // Le corps est concaténé au prénom côté SQL : chaque morceau doit s’y trouver.
      for (const morceau of m.corps.split('§PRENOM§').filter((p) => p.length > 0)) {
        expect(sql).toContain(morceau)
      }
      expect(sql).toContain(`'${m.lien}'`)
      expect(sql).toContain(`'${m.etiquette}'`)
    }
  })

  it('aucun appel à envoyer_push ne lit une colonne de contenu', () => {
    const appels = sql.match(/perform public\.envoyer_push\([\s\S]*?\);/g) ?? []
    // Cinq déclencheurs d’écriture + la tâche quotidienne des capsules.
    expect(appels).toHaveLength(6)
    for (const appel of appels) {
      expect(appel).not.toMatch(/\b(new|old|cap)\.(content|state|emoji|label|note|items|caption|media_path|image_url)\b/)
      // Seul `display_name`, lu au préalable dans `prenom`, a le droit d’y figurer.
      expect(appel).toMatch(/prenom/)
    }
  })

  it('n’ouvre jamais envoyer_push aux sessions connectées', () => {
    expect(sql).toMatch(/revoke execute on function public\.envoyer_push\([^)]*\) from authenticated;/)
    expect(sql).toMatch(/revoke execute on function public\.envoyer_push\([^)]*\) from anon;/)
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.envoyer_push/)
  })

  it('ne notifie jamais l’auteur·ice de son propre geste', () => {
    // Chaque fonction de déclencheur compare le destinataire à l’auteur avant d’émettre.
    expect(sql).toContain('new.receiver_id = new.sender_id')
    expect(sql).toContain('partenaire = new.user_id')
    expect(sql).toContain('partenaire = new.author_id')
  })

  it('n’écrit aucun secret en clair', () => {
    expect(sql).not.toMatch(/BLPUolQ6/) // même la clé publique n’a rien à faire côté base
    expect(sql).toContain('vault.decrypted_secrets')
  })
})
