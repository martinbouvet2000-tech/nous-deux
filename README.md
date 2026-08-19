# Awy (ex-Nous Deux)

Application privée pour couples à distance : pensées en temps réel, petits mots, humeurs, question du jour, gratitude, compte à rebours des retrouvailles, agenda partagé (double fuseau), souvenirs, capsules temporelles, listes à deux.

Site : https://martinbouvet2000-tech.github.io/nous-deux-app/

## Stack

React 19 + TypeScript + Vite 8 · Tailwind 4 · Zustand · Supabase (auth, Postgres/RLS, realtime) · vite-plugin-pwa · Vitest.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis remplir VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Scripts : `dev`, `build`, `build:pages` (base `/nous-deux-app/` + 404.html), `deploy:pages` (pousse `dist/` sur `nous-deux-app@gh-pages`), `type-check`, `lint`, `test`.

## Base de données

Le schéma vit dans Supabase ; les changements sont versionnés dans `supabase/migrations/`.
La migration `20260818120000_security_hardening.sql` est **déjà appliquée** en production. Elle apporte :

- verrou sur `profiles.partner_id / partner_code` (plus de liaison sauvage), création automatique du profil à l'inscription (trigger `handle_new_user`) ;
- question du jour **par couple**, tirée au hasard sans répétition, révélation de la réponse de l'autre côté serveur (`get_daily_question()`, RLS `question_answers`) ;
- RPC `unlink_partner()`, `delete_my_account()` ; policies DELETE manquantes (timeline, capsules, gratitudes) ; anti-spam taps ; longueurs max ; cascades ; index.

## Réglages Supabase à faire à la main (dashboard)

1. **Authentication → URL Configuration** : Site URL = `https://martinbouvet2000-tech.github.io/nous-deux-app/` ; Redirect URLs : ajouter `https://martinbouvet2000-tech.github.io/nous-deux-app/**` (indispensable pour « mot de passe oublié » et la confirmation d'email).
2. **Authentication → Providers → Email** : activer *Confirm email* (recommandé) et *Leaked password protection*.
3. **Authentication → Email templates** : traduire en français si souhaité.

## Déploiement

GitHub Pages sert le dépôt `nous-deux-app` (branche `gh-pages`). Deux options :

- **Manuel** : `npm run deploy:pages` (nécessite un accès push sur `nous-deux-app`).
- **Automatique** : le workflow `deploy.yml` build et pousse à chaque push sur `master`. Ajouter les secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et `DEPLOY_TOKEN` (PAT avec écriture sur `nous-deux-app`).

## Licence

MIT
