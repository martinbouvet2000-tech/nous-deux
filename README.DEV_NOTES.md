Changements appliqués automatiquement par Copilot CLI:

- Ajout .gitignore (node_modules, dist, .env)
- Création de .eslintrc.cjs et .prettierrc
- Ajout de vitest.config.ts
- Création d'un workflow GitHub Actions (.github/workflows/ci.yml)
- Remplacement de l'app pour lazy-loading des routes
- Ajout d'un fichier .env.example (placeholders)
- Dist supprimé du dossier du projet

Actions recommandées (manuelles):
1. Faire rotate des clés Supabase et mettre les nouvelles dans .env.local
2. Installer dépendances: npm install (dans nous-deux)
3. Lancer npm run type-check et npm run lint, corriger issues
4. Ajouter tests unitaires et e2e
