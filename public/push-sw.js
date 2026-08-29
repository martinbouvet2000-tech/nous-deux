/*
 * Awy — réception des notifications push.
 *
 * Ce fichier n'est pas un service worker autonome : il est chargé par celui que
 * Workbox génère (`workbox.importScripts` dans vite.config.ts), et s'exécute
 * donc dans le même contexte. Il reste en JavaScript simple, sans import :
 * il n'est pas transformé par Vite.
 *
 * Chemin de base : rien n'est écrit en dur. `self.registration.scope` vaut
 * « https://…/nous-deux/ » en production et « https://…/ » ailleurs ; toutes
 * les URL (icônes, lien ouvert au clic) en découlent.
 */

/* global self */

;(function () {
  var BASE = self.registration.scope // se termine toujours par « / »

  /** Charge utile envoyée par la fonction Edge, avec des valeurs de repli sûres. */
  function lireCharge(event) {
    var brut = null
    try {
      brut = event.data ? event.data.json() : null
    } catch (e) {
      brut = null
    }
    // Selon la bibliothèque d'envoi, la charge peut arriver comme objet ou comme
    // chaîne JSON : on accepte les deux plutôt que d'afficher une notification vide.
    if (typeof brut === 'string') {
      try {
        brut = JSON.parse(brut)
      } catch (e) {
        brut = { corps: brut }
      }
    }
    if (!brut || typeof brut !== 'object') brut = {}
    return {
      titre: typeof brut.titre === 'string' && brut.titre ? brut.titre : 'Awy',
      corps: typeof brut.corps === 'string' ? brut.corps : '',
      lien: typeof brut.lien === 'string' && brut.lien ? brut.lien : '/',
      etiquette: typeof brut.etiquette === 'string' && brut.etiquette ? brut.etiquette : 'awy',
    }
  }

  self.addEventListener('push', function (event) {
    var m = lireCharge(event)
    event.waitUntil(
      self.registration.showNotification(m.titre, {
        body: m.corps,
        icon: BASE + 'icon-192.png',
        badge: BASE + 'icon-192.png',
        lang: 'fr',
        // Même étiquette = remplacement : une seconde envie d'appel prend la
        // place de la première au lieu d'empiler deux lignes identiques.
        tag: m.etiquette,
        renotify: true,
        data: { lien: m.lien },
      }),
    )
  })

  self.addEventListener('notificationclick', function (event) {
    event.notification.close()
    var lien = (event.notification.data && event.notification.data.lien) || '/'
    // `lien` est un chemin interne (« /memories?tab=capsules ») : on le résout
    // sous le scope pour respecter le sous-chemin de déploiement.
    var cible = new URL(String(lien).replace(/^\/+/, ''), BASE).href

    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fenetres) {
        for (var i = 0; i < fenetres.length; i++) {
          var f = fenetres[i]
          if (f.url.indexOf(BASE) !== 0) continue
          // Un onglet Awy est déjà ouvert : on le remet devant, et on l'emmène
          // au bon endroit quand le navigateur le permet (navigate() manque sur iOS).
          return f.focus().then(function (fenetre) {
            var cliente = fenetre || f
            if (typeof cliente.navigate === 'function') {
              return cliente.navigate(cible).catch(function () {})
            }
            return undefined
          })
        }
        return self.clients.openWindow(cible)
      }),
    )
  })
})()
