/* ── Mise à jour automatique de l'app installée ────────────────────────────
 *
 * Le problème constaté : le `registerSW.js` généré par vite-plugin-pwa se
 * contente d'un `navigator.serviceWorker.register()` au moment de l'évènement
 * `load`. Une app ajoutée à l'écran d'accueil puis reprise depuis le sélecteur
 * d'applications ne recharge jamais son document : `load` ne se reproduit pas,
 * `register()` n'est plus rappelé, le navigateur ne va donc jamais chercher un
 * nouveau `sw.js`. L'appareil peut rester des jours sur une ancienne version
 * pendant que le site, lui, est à jour. C'est exactement ce qui fait que deux
 * téléphones ne voient pas la même app.
 *
 * Deuxième moitié : en mode « autoUpdate », le service worker généré s'impose
 * (`skipWaiting` + `clientsClaim`) et efface l'ancien cache pendant que la page
 * ouverte fait encore tourner l'ancien JavaScript — les écrans pas encore
 * visités cessent de se charger — puis recharge sans demander l'avis de
 * personne, quitte à effacer un petit mot en cours d'écriture.
 *
 * On enregistre donc le service worker nous-mêmes, sans intermédiaire :
 *   • `updateViaCache: 'none'` pour que le navigateur aille toujours chercher
 *     `sw.js` sur le réseau, jamais dans son cache HTTP ;
 *   • une vérification toutes les 60 s, à chaque retour au premier plan, au
 *     focus et au retour du réseau — le retour au premier plan étant le seul
 *     signal fiable sur iOS ;
 *   • dès qu'une nouvelle version est installée et en attente, on l'active et
 *     on recharge, après avoir attendu la fin d'une saisie en cours.
 */

/** Vérification périodique tant que l'app est ouverte. */
const INTERVALLE_MS = 60_000
/** Deux signaux rapprochés (retour au premier plan + focus) ne font qu'une requête. */
const ANTI_REBOND_MS = 3_000
/** Attente avant de réessayer quand l'utilisateur est en train d'écrire. */
const NOUVELLE_TENTATIVE_MS = 2_000
/** Au-delà, on considère que la frappe est finie — un champ juste sélectionné ne bloque rien. */
const FRAPPE_RECENTE_MS = 15_000
/** Filet : la nouvelle version finit toujours par s'installer, même si on écrit sans arrêt. */
const ATTENTE_MAXIMALE_MS = 5 * 60_000
/** Le passage en « waiting » n'est pas toujours visible dès l'évènement : on regarde à nouveau. */
const RELECTURES_MS = [0, 400, 1_200, 3_000]
/** Filet si `controllerchange` ne vient jamais (page non contrôlée). */
const FILET_RECHARGEMENT_MS = 1_500

const CHEMIN_SW = `${import.meta.env.BASE_URL || '/'}sw.js`
const PORTEE_SW = import.meta.env.BASE_URL || '/'

let dernierControle = 0
let basculeEnCours = false
let dejaRecharge = false
let derniereFrappe = 0

/**
 * Recharger pendant une saisie ferait perdre le texte en cours. Mais un champ
 * simplement sélectionné — celui de l'e-mail, mis en avant tout seul à
 * l'ouverture — n'est pas une saisie : sans la condition sur la frappe
 * récente, l'app resterait bloquée sur l'ancienne version pour toujours.
 */
function saisieEnCours(): boolean {
  if (Date.now() - derniereFrappe > FRAPPE_RECENTE_MS) return false
  const actif = document.activeElement as HTMLElement | null
  if (!actif) return false
  if (actif.isContentEditable) return true
  return ['INPUT', 'TEXTAREA'].includes(actif.tagName)
}

function recharger(): void {
  if (dejaRecharge) return
  dejaRecharge = true
  window.location.reload()
}

/**
 * Active la version en attente dès que le moment s'y prête : app à l'écran et
 * aucun champ en cours de saisie. Sinon on repasse plus tard — jamais de
 * rechargement au milieu d'un message.
 */
function basculer(enAttente: ServiceWorker): void {
  if (basculeEnCours) return
  basculeEnCours = true
  const depart = Date.now()

  const essayer = () => {
    const tropAttendu = Date.now() - depart > ATTENTE_MAXIMALE_MS
    if (!tropAttendu && document.visibilityState !== 'visible') {
      // Inutile de sonder en boucle une app en arrière-plan : on attend le
      // signal de retour à l'écran.
      document.addEventListener('visibilitychange', essayer, { once: true })
      return
    }
    if (!tropAttendu && saisieEnCours()) {
      setTimeout(essayer, NOUVELLE_TENTATIVE_MS)
      return
    }
    navigator.serviceWorker.addEventListener('controllerchange', recharger, { once: true })
    enAttente.postMessage({ type: 'SKIP_WAITING' })
    // Si la page n'était contrôlée par personne, `controllerchange` ne viendra
    // pas : on recharge quand même, la nouvelle version est active.
    setTimeout(recharger, FILET_RECHARGEMENT_MS)
  }
  essayer()
}

/**
 * Enregistre le service worker et maintient l'app à jour toute seule.
 * Appelé une fois au démarrage ; sans effet là où les service workers
 * n'existent pas (tests, navigateurs anciens).
 * Renvoie une fonction d'arrêt, utile aux tests.
 */
export function demarrerMisesAJour(): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  let minuterie: ReturnType<typeof setInterval> | null = null
  let controler = () => {}

  const surRetourAEcran = () => {
    if (document.visibilityState === 'visible') controler()
  }
  const surFocus = () => controler()
  const surFrappe = () => { derniereFrappe = Date.now() }
  document.addEventListener('keydown', surFrappe, { capture: true, passive: true })

  navigator.serviceWorker
    .register(CHEMIN_SW, { scope: PORTEE_SW, updateViaCache: 'none' })
    .then((enregistrement) => {
      const regarderSiPrete = () => {
        if (enregistrement.waiting) basculer(enregistrement.waiting)
      }
      /** Le passage en attente peut n'être visible qu'un instant plus tard. */
      const regarderPlusieursFois = () => {
        for (const delai of RELECTURES_MS) {
          if (delai === 0) regarderSiPrete()
          else setTimeout(regarderSiPrete, delai)
        }
      }

      controler = () => {
        const maintenant = Date.now()
        if (maintenant - dernierControle < ANTI_REBOND_MS) return
        dernierControle = maintenant
        enregistrement
          .update()
          .then(regarderPlusieursFois)
          .catch(() => {
            // Hors ligne ou serveur injoignable : on retentera au prochain signal.
          })
      }

      // Une version peut déjà attendre depuis la session précédente.
      regarderPlusieursFois()

      enregistrement.addEventListener('updatefound', () => {
        const arrivant = enregistrement.installing
        if (!arrivant) {
          regarderPlusieursFois()
          return
        }
        arrivant.addEventListener('statechange', () => {
          if (arrivant.state === 'installed' || arrivant.state === 'activated') {
            regarderPlusieursFois()
          }
        })
      })

      controler()
      minuterie = setInterval(controler, INTERVALLE_MS)
      document.addEventListener('visibilitychange', surRetourAEcran)
      window.addEventListener('focus', surFocus)
      window.addEventListener('online', surFocus)
    })
    .catch(() => {
      // Pas de service worker (mode navigation privée, navigateur ancien) :
      // l'app fonctionne, simplement sans cache hors ligne.
    })

  return () => {
    if (minuterie) clearInterval(minuterie)
    document.removeEventListener('keydown', surFrappe, { capture: true })
    document.removeEventListener('visibilitychange', surRetourAEcran)
    window.removeEventListener('focus', surFocus)
    window.removeEventListener('online', surFocus)
  }
}
