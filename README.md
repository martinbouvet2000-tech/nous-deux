# Awy

Application privée pour un couple à distance. Deux comptes, un espace commun, rien d'autre : chaque donnée est cloisonnée par des politiques RLS au niveau de la base, personne d'autre ne peut rien lire.

**En ligne : https://martinbouvet2000-tech.github.io/nous-deux/**

L'app s'installe depuis le navigateur (« Sur l'écran d'accueil » sur iPhone, « Installer » sur Android). Elle fonctionne hors ligne en lecture et se met à jour toute seule.

## Ce que fait l'app

| Écran | Contenu |
|---|---|
| **Accueil** | Les deux heures locales côte à côte, compte à rebours des retrouvailles, « Envie d'appel » (un tap qui prévient l'autre), série de jours consécutifs, humeur du jour, question du jour |
| **Carte** | Position des deux, en temps réel, avec précision affichée et distance à vol d'oiseau. Partage désactivable des deux côtés, trace effacée au bout de 48 h |
| **Agenda** | Événements partagés en double fuseau + emploi du temps de chacun, semaine par semaine. Un créneau se répète chaque semaine ou tombe à une date précise — une année scolaire entière tient dedans. Import depuis un fichier PDF, Excel ou CSV, suppression groupée |
| **Souvenirs** | Petits mots, gratitudes, vlogs vidéo, capsules temporelles à ouvrir à une date choisie |
| **À deux** | Activités et projets communs |
| **Réglages** | Profil, fuseau, partage de position, notifications push, position en arrière-plan, export des données, suppression du compte |

Les notifications push préviennent d'une envie d'appel, d'un petit mot, d'une humeur posée, d'une gratitude, d'un vlog ou d'une capsule prête. Elles disent toujours **qui** a fait le geste, jamais **ce qu'il contient**.

## Stack

React 19 · TypeScript strict · Vite 8 · Tailwind 4 · Zustand · react-router 7 · date-fns · Leaflet · lucide-react · vite-plugin-pwa (Workbox) · Vitest.

Côté serveur : Supabase — Postgres avec RLS sur chaque table, fonctions `SECURITY DEFINER` pour les opérations qui traversent le couple, Storage pour les vlogs, Realtime pour la synchro instantanée, Edge Functions (Deno) pour les notifications push et la position en arrière-plan, `pg_cron` pour les capsules du jour, Vault pour les secrets.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis remplir depuis Supabase → Project Settings → API
npm run dev
```

| Script | Rôle |
|---|---|
| `dev` | serveur de développement |
| `build` | `tsc -b` puis build Vite |
| `build:pages` | build pour GitHub Pages (base `/nous-deux/`, `404.html`, `.nojekyll`) |
| `type-check` | `tsc -b --force` — vérifie réellement tout le projet |
| `lint` | ESLint |
| `test` / `test:watch` | Vitest |
| `icons` | régénère les icônes PWA |

> `type-check` utilise `tsc -b --force` et non `tsc --noEmit` : avec un tsconfig solution (`"files": []`), `--noEmit` ne vérifie rien du tout et laisse passer n'importe quelle erreur. C'est arrivé.

## Variables d'environnement

`.env.production` est versionné **volontairement** : il ne contient que des valeurs publiques par nature.

| Variable | Nature |
|---|---|
| `VITE_SUPABASE_URL` | publique |
| `VITE_SUPABASE_ANON_KEY` | publique — la sécurité repose entièrement sur les RLS |
| `VITE_VAPID_PUBLIC_KEY` | publique — elle voyage dans chaque abonnement push |
| `VITE_BASE` | sous-chemin de déploiement, `/nous-deux/` sur GitHub Pages |

Les secrets réels ne sont **jamais** dans le dépôt. `vapid_private_key` et `push_hook_secret` vivent uniquement dans Supabase Vault.

## Base de données

Le schéma vit dans Supabase ; chaque changement est versionné dans `supabase/migrations/`, et les migrations destructrices ont leur script de retour dans `supabase/rollback/`.

Toutes les migrations présentes sont **déjà appliquées en production**. Les plus structurantes :

Le nom de chaque fichier porte la **version telle qu'elle est enregistrée en base** : le
registre du dépôt et celui de Supabase se correspondent un pour un, sans quoi une
reconstruction à neuf rejouerait tout. Cinq fichiers de juin et juillet ne contiennent
qu'un commentaire : leur SQL d'origine n'a jamais été versionné et ce qu'ils créaient a
depuis été retiré ou réécrit. Ils existent pour tenir le compte, pas pour être rejoués.


- `20260818193651_security_hardening_and_fixes.sql` — verrou sur la liaison des partenaires, création du profil à l'inscription, question du jour par couple, `unlink_partner()`, `delete_my_account()`
- `20260826152942` → `20260826153745` — cloisonnement du Storage, portée partenaire des souvenirs, inscriptions plafonnées à deux comptes, capsules scellées jusqu'à leur date, droits d'exécution des fonctions `SECURITY DEFINER`
- `20260828122244_perf_index_et_rls.sql` — 83 politiques réécrites en `(select auth.uid())` (évaluées une fois au lieu d'une fois par ligne) et index sur les colonnes de jointure
- `20260828121740_purge_stockage_suppression_compte.sql` — la suppression de compte efface aussi les fichiers, sans toucher aux données du partenaire qui reste
- `20260828224926_notifications_push.sql` — abonnements, déclencheurs, `envoyer_push()`
- `20260829001126_jetons_position.sql` — jetons révocables pour la position en arrière-plan
- `20260831093640_creneaux_dates.sql` — `slot_date` sur les créneaux (NULL = hebdomadaire), avec un déclencheur qui tient `weekday` en accord avec la date, quelle que soit la voie d'écriture

## Sauvegardes

Le projet est sur le **plan gratuit** de Supabase : ni sauvegarde quotidienne, ni
restauration à un instant donné, ni sauvegarde téléchargeable — ces trois choses
commencent au plan Pro. Tant que rien n'est copié ailleurs, les vlogs, les petits mots,
les gratitudes et l'emploi du temps n'existent qu'à un seul endroit au monde, et
`delete_my_account()` est à deux clics dans les réglages.

```bash
SUPABASE_SERVICE_ROLE_KEY="..." node scripts/sauvegarde.mjs
```

Le script écrit `sauvegardes/awy-AAAA-MM-JJ/` : `donnees.json` (toutes les lignes de
toutes les tables), `medias/` (les fichiers du bucket `vlogs`, sous leur vrai nom) et
`inventaire.json` (le reçu, pour vérifier que rien ne manque). Le dossier est ignoré par
git — il contient tout, il ne doit jamais partir dans le dépôt.

La clé `service_role` se trouve dans **Project Settings → API**. Elle contourne les RLS,
ce qui est nécessaire pour tout copier — y compris ce qui appartient à l'autre. Elle se
passe en variable d'environnement, le temps d'une commande, et ne s'écrit nulle part.

Une fois par mois suffit au rythme actuel (une vingtaine de vlogs mensuels). **Copier le
dossier produit ailleurs que sur la machine qui l'a produit** : une sauvegarde qui vit à
côté de l'original n'en est pas une.

> Second effet du plan gratuit : Supabase met en pause les projets qui reçoivent trop peu
> d'activité sur 7 jours. Awy en reçoit tous les jours, mais une semaine sans ouvrir
> l'app et le site tombe jusqu'à réactivation manuelle depuis le tableau de bord.

## Position en arrière-plan

Aucune application web ne peut relever la position quand elle est fermée — c'est une limite du navigateur, pas un manque. Awy contourne ça avec un raccourci créé sur le téléphone, qui envoie la position à intervalle régulier sans rien ouvrir. Le mode d'emploi est dans `docs/position-en-arriere-plan.md`, et repris dans Réglages.

## Fonctions Edge

Trois fonctions tournent sur Supabase, toutes versionnées dans `supabase/functions/` :

- `send-push` — signe et envoie les notifications Web Push. Clés VAPID lues dans le Vault.
- `ingest-location` — reçoit une position depuis le raccourci du téléphone, authentifiée
  par un jeton révocable.
- `telecharger-video` — récupère un fichier derrière un lien. La résolution exige une
  session Awy ; le flux, lui, s'ouvre avec une signature HMAC de cinq minutes, parce que
  le gestionnaire de téléchargement d'un téléphone n'envoie aucun en-tête.

Les trois ont `verify_jwt: false` et **portent leur propre contrôle d'accès** — c'est
délibéré, pas un oubli : deux d'entre elles sont appelées par des clients qui ne peuvent
pas présenter de jeton Supabase.

## Déploiement

GitHub Pages, alimenté par GitHub Actions — **pas** par une branche `gh-pages`.

- `.github/workflows/ci.yml` — type-check, ESLint, tests, build. Sur chaque push et chaque pull request.
- `.github/workflows/deploy.yml` — rebuild et publie le site à chaque push sur `master`, et lançable à la main.

Aucun jeton personnel n'est nécessaire : le déploiement passe par `actions/deploy-pages` et le `GITHUB_TOKEN` de l'exécution.

> **Un piège à connaître.** Un commit poussé par un workflow (avec `GITHUB_TOKEN`) ne redéclenche aucun autre workflow — protection anti-boucle de GitHub. Le dépôt est alors à jour mais le site ne l'est pas. Dans ce cas, lancer `deploy.yml` à la main depuis l'onglet Actions.
>
> **Un second piège.** Committer un gros changement fichier par fichier laisse des commits intermédiaires incomplets, dont l'arbre ne compile pas : CI et déploiement passent au rouge jusqu'au dernier fichier. C'est exactement ce qui s'est produit le 29 août. Un changement se livre en **un seul commit**.
>
> **Un troisième.** Le `GITHUB_TOKEN` d'une exécution ne peut ni créer ni modifier un fichier de `.github/workflows/` — GitHub rejette le push avec « refusing to allow a GitHub App to create or update workflow ». Il peut en revanche en **supprimer** un. Un workflow qui voudrait retoucher ses voisins ne passera jamais : toute modification d'un workflow se fait à la main.

## Réglages Supabase faits à la main (dashboard)

1. **Authentication → URL Configuration** — Site URL : `https://martinbouvet2000-tech.github.io/nous-deux/` ; Redirect URLs : `https://martinbouvet2000-tech.github.io/nous-deux/**` (nécessaire pour « mot de passe oublié » et la confirmation d'e-mail).
2. **Authentication → Providers → Email** — *Confirm email* activé.
3. **Authentication → Email templates** — traduits en français.
4. **Vault** — `vapid_private_key` et `push_hook_secret`.

*« Leaked password protection » est réservé au plan Pro et n'est pas disponible sur cette organisation.*

## Licence

MIT
