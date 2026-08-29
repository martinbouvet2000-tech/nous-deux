# Garder une vidéo — mode d'emploi et mise en service

Onglet **Vidéo** de l'app : on colle un lien, l'app rend le fichier sur le
téléphone — dans la **galerie photo** ou dans **Fichiers**, à la meilleure
définition disponible (jusqu'à la 4K).

## Ce qui marche sans rien configurer

Un lien qui pointe **directement sur un fichier** (`.mp4`, `.webm`, `.mov`,
`.mp3`, `.jpg`…) fonctionne dès le déploiement de la fonction : la fonction
Edge le rapatrie telle quelle, en pièce jointe.

## Ce qui demande un service d'extraction

Les liens de **pages** (YouTube, Instagram, TikTok, X, Reddit, Vimeo,
Facebook, Twitch, Bluesky…) : le fichier réel y est caché derrière du
JavaScript, et un navigateur n'a pas le droit d'aller le lire (CORS). La
fonction délègue donc l'extraction à une instance [Cobalt](https://github.com/imputnet/cobalt).

Il faut en désigner une, avec une variable d'environnement sur la fonction :

| Variable | Rôle |
| --- | --- |
| `COBALT_API_URL` | Adresse de l'instance Cobalt (obligatoire pour les liens de pages) |
| `COBALT_API_KEY` | Clé d'API, si l'instance en exige une |

```bash
supabase secrets set COBALT_API_URL="https://mon-instance-cobalt.exemple"
# facultatif
supabase secrets set COBALT_API_KEY="..."
```

L'instance publique historique demande aujourd'hui une authentification :
le plus simple et le plus fiable est d'**héberger la sienne** (l'image Docker
officielle de Cobalt tient sur un petit VPS). Sans `COBALT_API_URL`, l'app le
dit clairement au lieu d'échouer en silence.

## Déploiement de la fonction

```bash
supabase functions deploy telecharger-video --no-verify-jwt
```

`--no-verify-jwt` est **volontaire et sans danger** — les deux portes de la
fonction se gardent elles-mêmes :

- `POST /telecharger-video` (résolution) vérifie le jeton de session Awy à la
  main, avec `auth.getUser()`. Sans session valable : 401.
- `GET  /telecharger-video/flux` (rapatriement) n'accepte que des adresses que
  la fonction a elle-même rendues, scellées par une signature HMAC valable
  cinq minutes. Ce n'est donc jamais un proxy ouvert : impossible de lui faire
  relayer une adresse arbitraire, ni le réseau interne du serveur (SSRF).
  Cette porte doit rester libre d'en-tête parce que c'est le gestionnaire de
  téléchargement du téléphone qui l'ouvre, et qu'il n'envoie aucun en-tête.

La clé de scellage est dérivée (SHA-256 puis HMAC) de
`SUPABASE_SERVICE_ROLE_KEY`, déjà présente dans l'environnement des fonctions :
rien de plus à configurer, et cette clé dérivée ne permettrait, si elle
fuyait, que de fabriquer un lien de flux — jamais d'accéder à la base.

## Qualité : le compromis à connaître

| Choix | Ce que ça donne | Où ça se range |
| --- | --- | --- |
| **Maximale** | La meilleure définition disponible, jusqu'à 2160p (4K). Sur YouTube la 4K n'existe qu'en VP9/AV1, donc en `.webm`. | Fichiers, et galerie Android. **Pas** la galerie d'un iPhone : iOS n'importe pas le WebM. |
| **Galerie** | Jusqu'à 1080p en MP4 H.264. | Galerie de tous les téléphones, iPhone compris. |
| **Son seul** | La bande son en MP3 320 kb/s. | Fichiers. |

C'est une limite d'iOS, pas de l'app : il n'existe pas de 4K YouTube en H.264.
Pour de la 4K sur iPhone, le fichier va dans **Fichiers** — d'où le second
bouton, présent sur chaque résultat.

## Les deux portes de sortie

- **Galerie photo** : le fichier est rapatrié dans la page (barre
  d'avancement), puis remis au système par la feuille de partage — c'est de là
  que partent « Enregistrer la vidéo » (iOS) et « Enregistrer dans la Galerie »
  (Android). Au-delà de 600 Mo, l'app bascule d'elle-même sur Fichiers : faire
  passer plusieurs gigaoctets par la mémoire d'un onglet le ferait tomber.
- **Fichiers** : le téléphone télécharge tout seul depuis le lien signé. Aucune
  limite de taille, et le téléchargement reprend s'il est coupé (la fonction
  relaie les requêtes `Range`).

## Droits d'usage

Cet onglet ne contourne aucune protection : il ne sait lire que ce qui est
déjà accessible publiquement. Récupérer une vidéo pour la garder chez soi
n'est pas la republier — les conditions d'utilisation du site d'origine et le
droit d'auteur continuent de s'appliquer.
