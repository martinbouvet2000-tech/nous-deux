# Héberger son extracteur (Cobalt) pour l'onglet Vidéo

L'onglet **Vidéo** sait déjà rapatrier un lien qui pointe droit sur un fichier
(`.mp4`, `.mov`, `.webm`…). Pour les liens de **pages** — YouTube, TikTok,
Instagram, X, Reddit, Vimeo, Twitch, Bluesky — il faut un service qui sache
retrouver le fichier réel derrière le JavaScript de la page. C'est le rôle de
[Cobalt](https://github.com/imputnet/cobalt), qu'on héberge soi-même.

Compter **quinze minutes** et **~4 €/mois** de petit serveur. Une fois en
place, il n'y a plus rien à toucher.

## Pourquoi la sienne plutôt qu'une instance publique

Une instance publique voit passer chaque lien qu'on lui demande, peut disparaître
du jour au lendemain, et se fait bloquer par YouTube d'autant plus vite qu'elle
sert beaucoup de monde. La sienne ne sert que vous deux : personne d'autre ne
sait ce que vous regardez, et elle passe sous les radars des limitations.

## Ce qu'il faut

- Un petit serveur avec Docker : un VPS à 4 €/mois (Hetzner CX22, Scaleway
  Stardust, OVH VPS) suffit largement, ou une plateforme type Railway / Koyeb.
- Un nom de domaine pointant dessus (ou un sous-domaine : `cobalt.tondomaine.fr`).
  Cobalt **exige** une adresse HTTPS publique : il refuse de démarrer sans.

## Installation (VPS + Docker)

Sur le serveur, dans un dossier vide, un fichier `docker-compose.yml` :

```yaml
services:
  cobalt-api:
    image: ghcr.io/imputnet/cobalt:11
    restart: unless-stopped
    init: true
    ports:
      - 127.0.0.1:9000:9000/tcp
    environment:
      # L'adresse publique de TON instance, avec le slash final. Obligatoire.
      API_URL: 'https://cobalt.tondomaine.fr/'
      # Réservé à Awy : sans clé, on n'entre pas (voir plus bas).
      API_AUTH_REQUIRED: '1'
      API_KEY_URL: 'file:///keys.json'
      # Confort : 20 requêtes/minute suffisent pour deux personnes.
      RATELIMIT_MAX: '20'
      RATELIMIT_WINDOW: '60'
    volumes:
      - ./keys.json:/keys.json:ro
    labels:
      - com.centurylinklabs.watchtower.scope=cobalt

  # Met l'image à jour toute seule — Cobalt bouge vite, YouTube aussi.
  watchtower:
    image: ghcr.io/containrrr/watchtower
    restart: unless-stopped
    command: --cleanup --scope cobalt --interval 900
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

À côté, un fichier `keys.json` avec une clé tirée au hasard
(`uuidgen` ou `python3 -c "import uuid; print(uuid.uuid4())"`) :

```json
{
  "b1c0ffee-1234-4567-89ab-cdef01234567": {
    "name": "awy",
    "limit": 50
  }
}
```

Puis :

```bash
docker compose up -d
docker compose logs -f cobalt-api   # doit afficher « cobalt API ... live »
```

### Le HTTPS devant

Cobalt écoute en clair sur `127.0.0.1:9000` ; c'est un serveur web qui met le
HTTPS. Avec [Caddy](https://caddyserver.com), le `Caddyfile` tient en trois
lignes et le certificat se renouvelle tout seul :

```
cobalt.tondomaine.fr {
    reverse_proxy 127.0.0.1:9000
}
```

Vérifie que ça répond :

```bash
curl https://cobalt.tondomaine.fr/
# → {"cobalt":{"version":"11...","url":"https://cobalt.tondomaine.fr/", ...}}
```

### Variante sans serveur à administrer

Railway, Koyeb ou Fly.io savent lancer l'image `ghcr.io/imputnet/cobalt:11`
directement. Même recette : renseigne `API_URL` avec l'URL publique que la
plateforme t'attribue (slash final compris), expose le port `9000`, et garde
`API_AUTH_REQUIRED` + `API_KEY_URL`. C'est plus cher à l'usage, mais il n'y a
ni domaine ni certificat à gérer.

## Brancher Awy dessus

Deux secrets à poser sur la fonction Edge, côté Supabase :

**Depuis le tableau de bord** — Project *nous-deux* → *Edge Functions* →
*Secrets* → *Add new secret* :

| Nom | Valeur |
| --- | --- |
| `COBALT_API_URL` | `https://cobalt.tondomaine.fr` (sans slash final) |
| `COBALT_API_KEY` | la clé UUID de `keys.json` |

**Ou en ligne de commande :**

```bash
supabase secrets set COBALT_API_URL="https://cobalt.tondomaine.fr" --project-ref hfukmrrinibsdrrevahs
supabase secrets set COBALT_API_KEY="b1c0ffee-1234-4567-89ab-cdef01234567" --project-ref hfukmrrinibsdrrevahs
```

Les secrets sont pris en compte à la requête suivante : rien à redéployer.
Ouvre l'onglet **Vidéo**, colle un lien YouTube, appuie sur *Préparer*. Si le
message « les liens de pages demandent un service d'extraction » a disparu,
c'est branché.

## Quand ça coince

| Symptôme dans l'app | Ce qu'il se passe |
| --- | --- |
| « Le service d'extraction est injoignable » | L'instance est éteinte, ou son HTTPS ne répond pas. `docker compose ps` puis `curl` l'URL. |
| « Le service d'extraction a répondu de travers » | `COBALT_API_URL` pointe sur la page web de Cobalt et non sur son API, ou traîne un slash final. |
| « La vidéo n'a pas pu être préparée » sur tout | Clé absente ou fausse alors que `API_AUTH_REQUIRED=1` : compare `COBALT_API_KEY` et `keys.json`. |
| « YouTube a refusé la demande » | YouTube bloque l'IP du serveur. Ça se règle en donnant des cookies à Cobalt (`COOKIE_PATH`, voir sa doc) — ou en attendant, c'est souvent passager. |

La documentation d'origine, si tu veux creuser :
[run-an-instance.md](https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md).

## Ce que ça ne change pas

Le compromis 4K reste le même (voir `garder-une-video.md`) : sur YouTube la 4K
n'existe qu'en VP9/AV1, donc en `.webm`, que la galerie d'un iPhone n'accepte
pas. Cobalt ou pas, la 4K sur iPhone va dans **Fichiers**.
