# Journal des versions

Les dates sont celles de la mise en ligne. Chaque version est un seul commit sur `master`, suivi d'un déploiement GitHub Pages.

## 2.4.0 — 31 août 2026

**Ce que l'audit a trouvé, corrigé.**

Un audit complet du projet — code, base, fonctions serveur, dépendances, chaîne de
livraison — a rendu quinze constats. Cette version corrige tout ce qui pouvait l'être
sans intervention manuelle, et outille le reste.

- **la promesse des 48 h est enfin tenue.** L'app affiche « Parcours conservé 48 h, puis
  effacé » à deux endroits. C'était faux : la purge était un déclencheur `after insert`
  par ligne, limité aux points de l'auteur de l'insertion. Les vieux points de quelqu'un
  n'étaient donc effacés que si cette même personne enregistrait un nouveau point — jamais
  si elle coupait le partage, c'est-à-dire précisément quand on veut que la trace
  disparaisse. Neuf points de plus de 48 h traînaient en base, le plus ancien vieux de deux
  jours. La purge devient globale, passe en `for each statement`, et un `pg_cron` horaire
  prend le relais quand plus personne n'enregistre rien.
- **`react-router` passe en 7.18.3**, qui referme six failles connues dont une CSRF et une
  XSS. C'était la seule dépendance vulnérable réellement embarquée dans le navigateur.
- **la fonction `telecharger-video` ne suit plus les redirections à l'aveugle.**
  `redirect: 'follow'` ne contrôlait que l'adresse de départ : un hébergeur pouvait
  rediriger vers une adresse interne sans que rien ne le revérifie. Chaque saut est
  désormais résolu, repassé par le filtre d'adresses publiques, et la chaîne est bornée à
  cinq. Son code entre dans le dépôt : il ne tournait en production que depuis une branche.
- **`scripts/sauvegarde.mjs`** copie tout — lignes et fichiers — dans un dossier daté.
  Le plan gratuit de Supabase ne fournit aucune sauvegarde : jusqu'ici, les vlogs et les
  petits mots n'existaient qu'à un seul endroit au monde.
- **l'historique des migrations reproduit à nouveau la base.** Vingt-deux migrations
  étaient appliquées en production pour dix-sept fichiers au dépôt, tous horodatés
  différemment de la version enregistrée. Les fichiers sont réalignés, et les cinq
  migrations historiques sans source retrouvent une entrée au registre.
- `jour_du_creneau()` fixe son `search_path` — c'était la seule fonction du schéma à ne
  pas le faire, introduite la veille dans la migration des dates.
- cinq tests de plus, qui échouent si la purge redevient dépendante de l'auteur, si le
  filet horaire disparaît, ou si une fonction perd son `search_path`.

## 2.3.0 — 31 août 2026

**L'emploi du temps connaît enfin les dates : on peut y mettre une année entière.**

Jusqu'ici un créneau n'avait qu'un jour de la semaine : l'emploi du temps était une semaine unique qui se répétait à l'infini. Impossible d'y mettre une année scolaire, avec ses vacances, ses semaines de stage, ses cours qui changent d'une semaine à l'autre. Un fichier d'une année était même replié en silence sur une « semaine type ».

- un créneau peut désormais porter une **date précise** (`slot_date`), ou rester **hebdomadaire** comme avant — les deux cohabitent : le sport du mardi soir reste une habitude pendant que l'année de cours, elle, est datée jour par jour
- **navigation par semaine** dans la grille, avec les quantièmes dans les en-têtes et un retour direct à la semaine en cours
- au formulaire, le choix **« Chaque semaine » / « Une date précise »**
- l'**import garde les dates du fichier** : une année reste une année. Replier en semaine type reste possible, mais c'est un choix, plus un effet de bord
- la semaine affichée suit le **fuseau du profil**, pas celui de l'appareil

Quatre défauts trouvés en relecture adversariale avant la mise en ligne, tous confirmés par exécution puis corrigés :

- le contrôle de chevauchement ignorait la date : sur une année de 720 séances, **720 lignes sur 720** étaient signalées en conflit, et « Ne garder que les lignes sûres » décochait l'import entier
- on pouvait cocher un créneau, changer de semaine, et le **supprimer sans jamais le revoir** — la sélection est maintenant vidée au changement de semaine
- la semaine affichée venait du fuseau du navigateur : depuis un autre continent, l'app masquait les cours du jour et en montrait d'autres
- corriger un intitulé puis rebasculer en semaine type affichait toujours l'ancien texte

L'écran de relecture ne monte plus que 150 lignes à la fois — sept cents lignes à cinq champs chacune figeaient l'appareil.

## 2.2.0 — 31 août 2026

**L'app installée se met enfin à jour toute seule.**

Le fichier d'enregistrement généré par vite-plugin-pwa se contentait d'un `register()` au moment de l'évènement `load`. Une app ajoutée à l'écran d'accueil et reprise depuis le sélecteur d'applications ne recharge jamais son document : `load` ne se reproduisait pas, le navigateur n'allait donc jamais chercher un nouveau `sw.js`, et un téléphone pouvait rester des jours sur une ancienne version pendant que le site était à jour. Deux appareils ne voyaient pas la même app.

- enregistrement du service worker repris en main dans `src/lib/majAuto.ts`, avec `updateViaCache: 'none'`
- vérification toutes les 60 s, à chaque retour au premier plan, au focus et au retour du réseau — le retour au premier plan étant le seul signal fiable sur iOS
- bascule sur la nouvelle version dès qu'elle est prête, en attendant la fin d'une frappe en cours ; un champ simplement sélectionné ne bloque rien
- estampille de build affichée dans Réglages : deux appareils sur la même version affichent la même ligne
- README refait — l'ancien pointait vers un dépôt qui n'existe plus et décrivait un déploiement par branche `gh-pages` abandonné depuis. Les trois pièges de la chaîne GitHub Actions y sont désormais écrits, dont celui qui a fait échouer la première tentative de livraison : un workflow ne peut pas modifier un autre workflow

Mesuré en émulation iPhone contre la version précédente : bascule en 5 s au retour au premier plan, 62 s sans le moindre geste. La version précédente, elle, restait bloquée indéfiniment.

## 2.1.0 — 30 août 2026

- **Import d'emploi du temps** depuis un fichier PDF, Excel ou CSV, lu entièrement dans le navigateur — aucune dépendance ajoutée, rien n'est envoyé ailleurs
- **Suppression groupée** de créneaux, avec sélection par jour et confirmation
- les lignes déjà présentes dans l'emploi du temps arrivent **décochées** et signalées : un réimport ne duplique plus tout
- écran de relecture allégé (`content-visibility`) : « Tout cocher » sur 250 lignes passe de 1 348 ms à 473 ms
- accords et compteurs corrigés (« Ajouter 1 créneau » / « Ajouter 12 créneaux »)

## 2.0.0 — 29 août 2026

- **Notifications push** (Web Push, VAPID) pour l'envie d'appel, les petits mots, les humeurs, les gratitudes, les vlogs et les capsules prêtes. Une notification dit qui a fait le geste, jamais ce qu'il contient
- **Carte** en position précise (`enableHighAccuracy`), zoom molette adouci et armé seulement après un clic
- **Position en arrière-plan** par raccourci téléphone, avec jetons révocables — aucune app web ne peut le faire autrement
- **Mode hors ligne** : lecture du dernier état connu, bandeau de reconnexion
- **Plus de zoom bloqué sur iPhone** : les champs passent à 16 px sur mobile, 14 px seulement à la souris. En dessous de 16 px, Safari zoome à la sélection et ne dézoome jamais
- 83 politiques RLS réécrites et indexées ; six tables mortes et un bucket inutilisé retirés ; la suppression de compte efface désormais aussi les fichiers, sans toucher aux données du partenaire qui reste
- `type-check` réparé : `tsc --noEmit` sur un tsconfig solution ne vérifiait **rien**

## 1.0.0 — 18 août 2026

Première version complète : accueil, agenda partagé en double fuseau, souvenirs, capsules temporelles, activités, question du jour, gratitudes, liaison des deux comptes, RLS de bout en bout.
