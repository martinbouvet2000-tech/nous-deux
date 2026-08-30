import { supabase } from '@/lib/supabase'

/**
 * Notifications push (Web Push) — côté client.
 *
 * Le trajet complet : l'app s'abonne auprès du service de push du navigateur,
 * range l'abonnement dans `push_subscriptions`, et la base (déclencheurs SQL)
 * demande à la fonction Edge `send-push` de chiffrer puis d'expédier le message.
 * Ici on ne s'occupe que du premier maillon.
 *
 * Sur iPhone, Web Push n'existe que depuis iOS 16.4 et **uniquement** quand la
 * PWA a été ajoutée à l'écran d'accueil. Dans Safari, `PushManager` est tout
 * bonnement absent : on ne peut pas distinguer « navigateur trop vieux » de
 * « pas encore installée » sans regarder le système. D'où l'état dédié
 * `ios-non-installee`, qui explique le geste au lieu d'échouer en silence.
 */

/** Clé publique VAPID (publique par nature : elle voyage dans chaque abonnement). */
const CLE_PUBLIQUE_VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

/** Au-delà, on considère que le service worker ne viendra pas (dev sans PWA, onglet privé). */
const DELAI_SERVICE_WORKER_MS = 8_000

/** États possibles du réglage « Notifications ». */
export type EtatPush =
  /** Le navigateur ne sait pas faire — rien à proposer. */
  | 'non-supporte'
  /** iPhone / iPad : possible, mais seulement depuis l'écran d'accueil. */
  | 'ios-non-installee'
  /** Tout est prêt, il ne manque que l'accord de l'utilisateur. */
  | 'a-activer'
  /** Refus enregistré par le navigateur : redemander ne sert à rien. */
  | 'refusee'
  /** Abonnement en place, les notifications arrivent. */
  | 'active'

export interface ContextePush {
  supporteServiceWorker: boolean
  supportePush: boolean
  supporteNotification: boolean
  permission: NotificationPermission
  estIOS: boolean
  /** PWA lancée depuis l'écran d'accueil (mode autonome) */
  estInstallee: boolean
  /** Un abonnement push existe déjà pour ce navigateur */
  abonne: boolean
}

/**
 * Machine à états du réglage. Fonction pure : c'est elle que les tests
 * interrogent, sans navigateur.
 *
 * L'ordre des tests compte. Le cas iOS-non-installé passe **avant** le test de
 * support, parce que Safari sur iPhone ne montre `PushManager` qu'une fois la
 * PWA sur l'écran d'accueil : conclure « non supporté » y serait faux et
 * décourageant, alors qu'il suffit d'un ajout à l'écran d'accueil.
 */
export function evaluerEtatPush(ctx: ContextePush): EtatPush {
  if (ctx.estIOS && !ctx.estInstallee) return 'ios-non-installee'
  if (!ctx.supporteServiceWorker || !ctx.supportePush || !ctx.supporteNotification) return 'non-supporte'
  if (ctx.permission === 'denied') return 'refusee'
  if (ctx.permission === 'granted' && ctx.abonne) return 'active'
  return 'a-activer'
}

/** Ce qu'on affiche sous l'interrupteur, pour chaque état. */
export const MESSAGE_ETAT: Record<EtatPush, string> = {
  'non-supporte': 'Ce navigateur ne sait pas recevoir de notifications. Essaie depuis Awy installée sur ton téléphone.',
  'ios-non-installee':
    'Sur iPhone, les notifications n’arrivent que si Awy est sur ton écran d’accueil. Ouvre le menu Partager, choisis « Sur l’écran d’accueil », puis reviens ici depuis l’icône.',
  'a-activer': 'Tu seras prévenu·e d’une envie d’appel, d’un petit mot, d’une humeur posée, d’une gratitude, d’un vlog ou d’une capsule prête.',
  refusee:
    'Les notifications sont bloquées au niveau du navigateur. Réglages du téléphone → Awy → Notifications pour les réautoriser ; Awy ne peut pas le faire à ta place.',
  active: 'Les notifications arrivent sur cet appareil. À faire une fois par téléphone.',
}

/** L'interrupteur ne se manipule que dans ces deux états ; ailleurs il informe. */
export function etatActionnable(etat: EtatPush): boolean {
  return etat === 'a-activer' || etat === 'active'
}

/**
 * Convertit une clé VAPID base64url (RFC 4648 §5) en octets, format attendu par
 * `pushManager.subscribe`. Le base64url remplace `+/` par `-_` et supprime le
 * bourrage `=` : on refait le chemin inverse avant `atob`.
 */
export function base64UrlVersOctets(base64url: string): Uint8Array<ArrayBuffer> {
  const normalise = base64url.trim().replace(/-/g, '+').replace(/_/g, '/')
  const bourrage = '='.repeat((4 - (normalise.length % 4)) % 4)
  const binaire = atob(normalise + bourrage)
  // `Uint8Array<ArrayBuffer>` et non `Uint8Array` tout court : `applicationServerKey`
  // n'accepte qu'un tampon non partagé, et le type large inclut SharedArrayBuffer.
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i)
  return octets
}

/** Inverse : octets d'une clé d'abonnement vers base64url, prêt pour la base. */
export function octetsVersBase64Url(source: ArrayBuffer | null): string {
  if (!source) return ''
  const octets = new Uint8Array(source)
  let binaire = ''
  for (let i = 0; i < octets.length; i += 1) binaire += String.fromCharCode(octets[i])
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** iPhone, iPad — y compris l'iPadOS récent qui se fait passer pour un Mac. */
function detecteIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/** PWA ouverte depuis l'écran d'accueil (Android : display-mode ; iOS : navigator.standalone). */
function detecteInstallee(): boolean {
  if (typeof window === 'undefined') return false
  const autonome = window.matchMedia?.('(display-mode: standalone)').matches === true
  const iosAutonome = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return autonome || iosAutonome
}

/** Le service worker, ou `null` s'il ne se présente pas dans le délai imparti. */
async function serviceWorkerPret(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  const attente = new Promise<null>((resolve) => setTimeout(() => resolve(null), DELAI_SERVICE_WORKER_MS))
  try {
    return await Promise.race([navigator.serviceWorker.ready, attente])
  } catch {
    return null
  }
}

/** Photographie de l'état réel du navigateur (impur : c'est le seul point d'entrée qui l'est). */
export async function contexteActuel(): Promise<ContextePush> {
  const supporteServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const supportePush = typeof window !== 'undefined' && 'PushManager' in window
  const supporteNotification = typeof window !== 'undefined' && 'Notification' in window
  const permission: NotificationPermission = supporteNotification ? Notification.permission : 'default'

  let abonne = false
  if (supporteServiceWorker && supportePush && permission === 'granted') {
    const reg = await serviceWorkerPret()
    abonne = !!(await reg?.pushManager.getSubscription())
  }

  return {
    supporteServiceWorker,
    supportePush,
    supporteNotification,
    permission,
    estIOS: detecteIOS(),
    estInstallee: detecteInstallee(),
    abonne,
  }
}

/** L'état courant du réglage, prêt à afficher. */
export async function etatActuel(): Promise<EtatPush> {
  return evaluerEtatPush(await contexteActuel())
}

export interface ResultatPush {
  ok: boolean
  etat: EtatPush
  message: string
}

/** Range (ou rafraîchit) l'abonnement de cet appareil dans `push_subscriptions`. */
async function enregistrerAbonnement(userId: string, sub: PushSubscription): Promise<boolean> {
  const p256dh = octetsVersBase64Url(sub.getKey('p256dh'))
  const auth = octetsVersBase64Url(sub.getKey('auth'))
  if (!p256dh || !auth) return false

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh,
      auth,
      // Sert à reconnaître « le téléphone » de « l'ordinateur » dans la table ;
      // aucune donnée intime n'y transite.
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) console.error('[push] enregistrement de l’abonnement', error.message)
  return !error
}

/**
 * Demande l'autorisation puis abonne cet appareil.
 *
 * À n'appeler que depuis un vrai geste utilisateur (clic) : les navigateurs —
 * iOS le premier — refusent `Notification.requestPermission()` autrement.
 *
 * Un refus déjà enregistré n'est jamais redemandé : le navigateur ne reposerait
 * pas la question, et insister ne ferait qu'afficher un message d'échec en boucle.
 */
export async function activerNotifications(userId: string): Promise<ResultatPush> {
  const ctx = await contexteActuel()
  const etat = evaluerEtatPush(ctx)

  if (etat === 'active') return { ok: true, etat, message: MESSAGE_ETAT.active }
  if (etat !== 'a-activer') return { ok: false, etat, message: MESSAGE_ETAT[etat] }

  if (!CLE_PUBLIQUE_VAPID) {
    return { ok: false, etat: 'non-supporte', message: 'Les notifications ne sont pas configurées sur cette version d’Awy.' }
  }

  // Le geste utilisateur est encore « chaud » ici : c'est le premier appel réseau
  // de la fonction, et il doit le rester.
  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch {
    permission = Notification.permission
  }

  if (permission === 'denied') return { ok: false, etat: 'refusee', message: MESSAGE_ETAT.refusee }
  if (permission !== 'granted') {
    return { ok: false, etat: 'a-activer', message: 'Tu peux réessayer quand tu veux : rien n’a été activé.' }
  }

  const reg = await serviceWorkerPret()
  if (!reg) {
    return { ok: false, etat: 'a-activer', message: 'Awy n’est pas encore complètement installée sur cet appareil. Réessaie dans un instant.' }
  }

  let sub: PushSubscription | null
  try {
    sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        // Obligatoire : on s'engage à toujours afficher quelque chose de visible.
        userVisibleOnly: true,
        applicationServerKey: base64UrlVersOctets(CLE_PUBLIQUE_VAPID),
      })
    }
  } catch (err) {
    console.error('[push] abonnement refusé', err)
    return { ok: false, etat: 'a-activer', message: 'L’abonnement aux notifications a échoué. Réessaie dans un instant.' }
  }

  const range = await enregistrerAbonnement(userId, sub)
  if (!range) {
    return { ok: false, etat: 'a-activer', message: 'L’abonnement n’a pas pu être enregistré. Vérifie ta connexion, puis réessaie.' }
  }
  return { ok: true, etat: 'active', message: MESSAGE_ETAT.active }
}

/** Désabonne cet appareil et retire sa ligne. Les autres appareils ne bougent pas. */
export async function desactiverNotifications(): Promise<ResultatPush> {
  const reg = await serviceWorkerPret()
  const sub = await reg?.pushManager.getSubscription()

  if (sub) {
    // On efface la ligne d'abord : sans l'endpoint, on ne saurait plus laquelle.
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    if (error) console.error('[push] suppression de l’abonnement', error.message)
    try {
      await sub.unsubscribe()
    } catch (err) {
      console.error('[push] désabonnement', err)
    }
    // La ligne n'existe plus : un futur réabonnement doit pouvoir la réécrire.
    oublierRafraichissements()
  }

  return { ok: true, etat: 'a-activer', message: 'Les notifications sont coupées sur cet appareil.' }
}

/**
 * Abonnements déjà remis à jour pendant cette session d'onglet.
 *
 * Le rafraîchissement est demandé de deux endroits — au démarrage de l'app, et
 * par le réglage « Notifications » chaque fois qu'il se monte. Sans cette
 * mémoire, ouvrir les Réglages réécrivait la même ligne à chaque passage : des
 * écritures pour rien, et une trace inutile dans la base. Une par session
 * suffit : le navigateur ne fait pas tourner son abonnement en cours de route,
 * et un vrai changement passe de toute façon par `activerNotifications`.
 *
 * La clé porte l'endpoint : deux comptes sur le même appareil, ou un abonnement
 * effectivement renouvelé, restent bien deux écritures distinctes.
 */
const abonnementsRafraichis = new Set<string>()

/** Repart de zéro — pour les tests, et à la déconnexion d'un appareil. */
export function oublierRafraichissements(): void {
  abonnementsRafraichis.clear()
}

/**
 * Remet la ligne à jour au démarrage : un navigateur peut faire tourner son
 * abonnement (`pushsubscriptionchange`) sans que l'app le sache. Silencieux —
 * jamais de demande de permission ici, jamais de message d'erreur à l'écran.
 *
 * Une seule écriture par abonnement et par session, quel que soit le nombre
 * d'appels : voir `abonnementsRafraichis`.
 */
export async function rafraichirAbonnement(userId: string): Promise<void> {
  try {
    const ctx = await contexteActuel()
    if (evaluerEtatPush(ctx) !== 'active') return
    const reg = await serviceWorkerPret()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const cle = `${userId}|${sub.endpoint}`
    if (abonnementsRafraichis.has(cle)) return
    // Marqué avant l'appel : deux rafraîchissements lancés en même temps (le
    // démarrage et l'ouverture des Réglages) ne doivent pas écrire deux fois.
    abonnementsRafraichis.add(cle)
    const range = await enregistrerAbonnement(userId, sub)
    // Échec réseau : on autorise un nouvel essai plus tard dans la session.
    if (!range) abonnementsRafraichis.delete(cle)
  } catch {
    // Rafraîchissement de confort : son échec ne concerne pas l'utilisateur.
  }
}
