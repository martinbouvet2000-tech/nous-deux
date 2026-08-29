/**
 * Textes des notifications push — source unique de vérité côté dépôt.
 *
 * Les envois sont déclenchés par les fonctions SQL de
 * `supabase/migrations/*_notifications_push.sql` : ce sont elles qui composent
 * réellement le message. Ce module en est le miroir exact, et c'est lui que les
 * tests interrogent — y compris le test qui relit la migration pour vérifier que
 * les deux ne divergent pas.
 *
 * ── Règle de confidentialité, non négociable ────────────────────────────────
 * Une notification s'affiche sur un écran verrouillé, parfois devant quelqu'un
 * d'autre. Aucun message ne transporte donc de contenu :
 *   • l'humeur du/de la partenaire est masquée tant qu'on n'a pas posé la sienne
 *     (révélation réciproque) — la notification annonce le geste, jamais l'état ;
 *   • une capsule est scellée jusqu'à sa date — on annonce qu'elle est prête,
 *     jamais son texte ;
 *   • un petit mot, une gratitude, une légende de vlog restent dans l'app.
 * Seul le prénom de l'auteur·ice figure dans le corps du message.
 */

/** Les six gestes qui méritent de faire vibrer un téléphone. */
export type GenrePush = 'appel' | 'petit_mot' | 'humeur' | 'gratitude' | 'vlog' | 'capsule'

export interface MessagePush {
  /** Titre de la notification (première ligne, en gras sur iOS) */
  titre: string
  /** Corps du message — jamais de contenu, seulement le geste et son auteur·ice */
  corps: string
  /** Chemin interne ouvert au clic, relatif à la racine de l'app */
  lien: string
  /**
   * Étiquette (`tag`) : deux notifications de même étiquette se remplacent au
   * lieu de s'empiler. Une seconde envie d'appel remplace la première — c'est
   * la plus récente qui compte.
   */
  etiquette: string
}

/** Prénom de repli si le profil de l'auteur·ice est introuvable. */
export const PRENOM_DEFAUT = 'Ton/ta partenaire'

/**
 * Durée de vie (secondes) confiée au service de push. Une envie d'appel qui
 * arrive quarante minutes trop tard ne sert à rien : on la laisse expirer
 * plutôt que de la délivrer à contretemps. Le reste peut attendre le retour
 * du réseau, jusqu'à une journée.
 */
export const DUREE_DE_VIE_S: Record<GenrePush, number> = {
  appel: 900,
  petit_mot: 86_400,
  humeur: 86_400,
  gratitude: 86_400,
  vlog: 86_400,
  capsule: 86_400,
}

/** Urgence annoncée au service de push : seule l'envie d'appel est pressante. */
export const URGENCE: Record<GenrePush, 'normal' | 'high'> = {
  appel: 'high',
  petit_mot: 'normal',
  humeur: 'normal',
  gratitude: 'normal',
  vlog: 'normal',
  capsule: 'normal',
}

type Gabarit = { titre: string; corps: (prenom: string) => string; lien: string; etiquette: string }

const GABARITS: Record<GenrePush, Gabarit> = {
  appel: {
    titre: 'Envie d’appel',
    corps: (p) => `${p} a envie de t’entendre, là, maintenant.`,
    lien: '/',
    etiquette: 'awy-appel',
  },
  petit_mot: {
    titre: 'Petit mot',
    corps: (p) => `${p} t’a laissé un petit mot.`,
    lien: '/',
    etiquette: 'awy-petit-mot',
  },
  humeur: {
    // On annonce le geste et on invite à la réciprocité, sans jamais nommer l'état.
    titre: 'Humeur du jour',
    corps: (p) => `${p} a posé son humeur. Pose la tienne pour la découvrir.`,
    lien: '/',
    etiquette: 'awy-humeur',
  },
  gratitude: {
    titre: 'Gratitude',
    corps: (p) => `${p} a noté ses gratitudes du jour.`,
    lien: '/',
    etiquette: 'awy-gratitude',
  },
  vlog: {
    titre: 'Vlog',
    corps: (p) => `${p} a ajouté un moment au vlog.`,
    lien: '/memories',
    etiquette: 'awy-vlog',
  },
  capsule: {
    // La capsule reste scellée : on annonce la date atteinte, pas le contenu.
    titre: 'Capsule à ouvrir',
    corps: (p) => `Une capsule de ${p} arrive à sa date. Elle t’attend.`,
    lien: '/memories?tab=capsules',
    etiquette: 'awy-capsule',
  },
}

/** Compose le message d'un geste donné. `prenom` est le seul élément variable. */
export function messagePush(genre: GenrePush, prenom: string = PRENOM_DEFAUT): MessagePush {
  const g = GABARITS[genre]
  return { titre: g.titre, corps: g.corps(prenom.trim() || PRENOM_DEFAUT), lien: g.lien, etiquette: g.etiquette }
}

/** Tous les genres, dans l'ordre où ils sont documentés. */
export const GENRES_PUSH: GenrePush[] = ['appel', 'petit_mot', 'humeur', 'gratitude', 'vlog', 'capsule']
