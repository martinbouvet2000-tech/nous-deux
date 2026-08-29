# Ta position, même quand Awy est fermée

Ce document t’explique, pas à pas, comment faire pour que ta position continue
d’apparaître sur la carte d’Awy sans que tu aies besoin d’ouvrir l’app.

Prévois vingt minutes la première fois. Ensuite, tu n’y touches plus jamais.

---

## 1. Pourquoi il faut faire ça

Awy est une application web. Une application web n’a **aucun** accès à ta
position quand elle est fermée. Ce n’est pas un réglage oublié ni un bug : ni
l’iPhone ni Android ne l’autorisent, et la petite partie d’Awy qui continue de
tourner en fond (celle qui reçoit les notifications) n’a pas le droit d’allumer
le GPS.

Résultat, sans ce qui suit : la carte ne se met à jour que lorsque l’un de vous
deux ouvre Awy. Si tu ne l’ouvres pas de la journée, l’autre voit ta position
d’hier soir.

La solution, c’est de demander au **téléphone lui-même** de faire le travail.
Ton téléphone, lui, a le droit de prendre ta position en arrière-plan. On va
donc créer un petit raccourci qui, tout seul, prend ta position et l’envoie à
Awy — sans rien ouvrir, sans rien afficher.

Pour qu’Awy sache que c’est bien toi, ce raccourci présente une clé : un
**jeton**. C’est une longue suite de caractères que tu crées dans Awy et que tu
colles dans le raccourci.

Ce jeton ne permet qu’une seule chose : écrire ta position, la tienne. Il ne
permet de lire aucune donnée, ni la tienne ni celle de l’autre. Traite-le quand
même comme une clé de maison : ne l’envoie pas par message, ne le laisse pas
traîner dans une note partagée. Et si tu as un doute, révoque-le et
recommence — ça prend dix secondes.

---

## 2. Étape 1 — Créer ton jeton dans Awy

Sur ton téléphone :

1. Ouvre Awy et va dans **Réglages**.
2. Vérifie d’abord que **Partager ma position** est bien activé (section
   « Mon profil »). Sans ça, rien ne sera enregistré, même avec un raccourci
   parfaitement réglé.
3. Descends jusqu’à la section **Position en arrière-plan**.
4. Dans le champ « Nom du raccourci », écris de quoi le reconnaître plus tard —
   par exemple `mon iPhone`. C’est facultatif.
5. Touche **Créer**.

Un encadré apparaît avec ton jeton. Il ressemble à ça :

```
awy_3f9c1a7b4e08d25f6a1b8c3d9e0f2a4b6c8d1e3f5a7b9c0d
```

**Note-le maintenant.** Il ne sera plus jamais affiché : Awy n’en garde qu’une
empreinte, un peu comme un mot de passe. Personne, pas même nous, ne peut te le
redonner. Si tu le perds, il faudra en créer un nouveau.

Le plus simple : touche **Copier le jeton**, puis colle-le tout de suite dans une
note, le temps de finir la configuration. Tu supprimeras la note après.

Deux autres boutons sont là pour te simplifier la vie :

- **Copier l’URL** — l’adresse que le raccourci devra appeler.
- **Copier le corps JSON** — le message tout prêt, avec ton jeton déjà dedans.

Garde cet écran ouvert, ou copie ces trois choses dans ta note. On y revient
tout de suite.

---

## 3. Étape 2 — iPhone : l’app Raccourcis

### 3.1. Trouver l’app

L’app s’appelle **Raccourcis**. Elle est installée d’origine sur ton iPhone, et
son icône est un carré violet avec deux formes entrelacées. Si tu ne la vois pas
sur ton écran d’accueil : balaie l’écran vers le bas depuis le milieu, tape
`Raccourcis` et touche le résultat.

### 3.2. Créer le raccourci

1. En bas de l’écran, touche l’onglet **Raccourcis**.
2. En haut à droite, touche le **+**.
3. Touche **Ajouter une action**.
4. Dans la barre de recherche, tape `position`. Choisis **Obtenir la position
   actuelle**. Elle s’ajoute à ton raccourci.
5. Touche à nouveau la barre de recherche en bas, tape `URL`, et choisis
   **Obtenir le contenu de l’URL**. Elle vient se placer sous la première.
6. Dans cette deuxième action, touche le mot **URL** en bleu et colle l’adresse
   copiée depuis Awy :

   ```
   https://hfukmrrinibsdrrevahs.supabase.co/functions/v1/ingest-location
   ```

7. Toujours dans cette action, touche la petite flèche **>** (ou le mot
   « Afficher plus ») pour déplier les options.
8. Règle **Méthode** sur **POST**. Ne laisse pas GET, ça ne marchera pas.
9. Un peu plus bas, règle **Corps de la requête** sur **JSON**.
10. Touche **Ajouter un champ** et crée les champs suivants, un par un :

    | Clé        | Type    | Valeur |
    |------------|---------|--------|
    | `token`    | Texte   | ton jeton, collé |
    | `lat`      | Nombre  | la variable Latitude (voir ci-dessous) |
    | `lng`      | Nombre  | la variable Longitude |
    | `accuracy` | Nombre  | la variable Précision horizontale (facultatif) |

    Pour les trois valeurs de position : touche le champ « Valeur », puis, dans
    la barre grise juste au-dessus du clavier, touche **Position actuelle**. Une
    pastille bleue apparaît. Touche cette pastille : un menu s’ouvre et te
    propose les propriétés disponibles. Choisis **Latitude** pour `lat`,
    **Longitude** pour `lng`, **Précision horizontale** pour `accuracy`.

    Si tu ne trouves pas « Précision horizontale », laisse tomber ce champ : il
    est facultatif.

11. En haut de l’écran, touche le nom du raccourci et appelle-le
    **Envoyer ma position à Awy**.
12. Touche **Terminé** en haut à droite.

### 3.3. Le tester tout de suite

Dans la liste des raccourcis, touche celui que tu viens de créer.

La première fois, iOS te demande l’autorisation d’accéder à ta position :
accepte. Il peut aussi te demander l’autorisation d’envoyer des données à
`supabase.co` : accepte également.

Puis retourne dans Awy, **Réglages**, section **Position en arrière-plan** : sous
le nom de ton raccourci, tu dois maintenant lire « Dernier envoi il y a moins
d’une minute ». C’est gagné.

Si la ligne dit toujours « jamais utilisé », va voir la section 6, plus bas.

### 3.4. L’autorisation de localisation — l’étape qu’on oublie

Pour qu’un raccourci puisse prendre ta position **sans que tu sois devant
l’écran**, il faut une autorisation particulière :

1. Ouvre **Réglages** (les réglages de l’iPhone, pas ceux d’Awy).
2. **Confidentialité et sécurité** → **Service de localisation**.
3. Descends jusqu’à **Raccourcis** et touche-le.
4. Choisis **Toujours**.
5. Vérifie que **Position exacte** est activé.

Sans ce réglage, ton raccourci fonctionnera quand tu le lances à la main, mais
restera muet le reste du temps.

### 3.5. L’automatiser — quand tu arrives quelque part

C’est le plus utile, et de loin le moins gourmand : ton iPhone surveille déjà
tes allées et venues, on ne fait que s’y greffer.

1. Dans l’app Raccourcis, touche l’onglet **Automatisation** en bas.
2. Touche le **+** en haut à droite (ou **Nouvelle automatisation**).
3. Dans la liste, choisis **J’arrive**.
4. Touche **Lieu** et choisis un endroit : ta maison, le bureau, la salle de
   sport. Tu peux élargir ou rétrécir la zone.
5. Laisse « N’importe quand » ou restreins à une plage horaire, comme tu veux.
6. Touche **Suivant**.
7. Choisis ton raccourci **Envoyer ma position à Awy** dans la liste.
8. Écran suivant, le plus important : désactive **Demander avant d’exécuter**
   (sur les versions récentes, choisis **Exécuter immédiatement**). iOS te
   demande confirmation : accepte.
9. Désactive aussi **Notifier lors de l’exécution** si tu ne veux pas voir une
   bannière à chaque fois.
10. Touche **Terminé**.

Recommence pour **Je quitte** au même endroit, et pour les deux ou trois lieux
qui comptent dans ta semaine. Cinq ou six automatisations suffisent largement à
donner une carte vivante.

### 3.6. L’automatiser — à heure fixe

iOS ne propose pas de déclencheur « toutes les heures ». Il propose **Heure de
la journée**, qui se répète chaque jour à une heure donnée. Pour couvrir la
journée, tu crées donc une automatisation par créneau :

1. Onglet **Automatisation** → **+**.
2. Choisis **Heure de la journée**.
3. Règle l’heure (par exemple 8 h 00), répétition **Quotidiennement**.
4. **Suivant** → choisis **Envoyer ma position à Awy**.
5. Désactive **Demander avant d’exécuter**. **Terminé**.

Répète pour 10 h, 12 h, 14 h, 16 h, 18 h, 20 h, 22 h. Compte une trentaine de
secondes par créneau. Huit créneaux dans la journée, plus les arrivées et les
départs de la section précédente, donnent un suivi très correct sans jamais
solliciter le GPS pour rien.

Inutile de descendre en dessous d’une position par heure : Awy n’enregistre de
toute façon **pas plus d’un point par minute**, et les points de plus de 48 h
sont effacés automatiquement.

---

## 4. Étape 2 — Android

Deux chemins. Le premier est gratuit, le second est payant mais imbattable de
fiabilité.

### 4.1. HTTP Shortcuts (gratuit)

L’app s’appelle **HTTP Shortcuts** (auteur : Waboodoo). Elle est sur le Play
Store.

1. Installe-la et ouvre-la.
2. Touche le **+** en bas à droite → **Créer un raccourci**.
3. **Nom** : `Position vers Awy`.
4. **Méthode** : `POST`.
5. **URL** :

   ```
   https://hfukmrrinibsdrrevahs.supabase.co/functions/v1/ingest-location
   ```

6. Onglet **Request Body** (Corps de la requête) : choisis le type
   **Custom text** (texte libre), et pour le type de contenu
   `application/json`. Colle ceci dans le corps, en remplaçant `TON_JETON` par
   le tien :

   ```json
   {"token":"TON_JETON","lat":{{lat}},"lng":{{lng}},"accuracy":{{acc}}}
   ```

7. Onglet **Scripting**, partie **Run before execution** (exécuter avant la
   requête). Colle ceci :

   ```js
   const p = getLocation();
   setVariable("lat", p.latitude);
   setVariable("lng", p.longitude);
   setVariable("acc", p.accuracy);
   ```

   Puis crée les trois variables `lat`, `lng` et `acc` quand l’app te le
   propose, et insère-les dans le corps avec le bouton d’insertion de variable :
   c’est lui qui écrit la forme exacte des accolades, ne les tape pas à la main.

   Si ta version de l’app ne connaît pas `getLocation()`, ne t’acharne pas :
   passe par Tasker (section 4.2), c’est le chemin le plus sûr sur Android.

8. Enregistre, puis touche le raccourci pour le tester. Accepte la demande
   d’autorisation de localisation, en choisissant **Toujours autoriser**.
9. Vérifie dans Awy, section **Position en arrière-plan**, que la ligne indique
   un envoi récent.
10. Pour l’automatiser, HTTP Shortcuts propose des déclencheurs programmés dans
    ses réglages, et fournit aussi un widget d’écran d’accueil si tu préfères le
    lancer d’un doigt.

### 4.2. Tasker (payant, environ 4 €, le plus sûr)

**Tasker** est l’outil d’automatisation de référence sur Android. Il ne se laisse
pas endormir par le système et gère très bien la position.

Crée d’abord la tâche :

1. Onglet **Tasks** → **+** → nomme-la `Position Awy`.
2. **+** → catégorie **Location** → **Get Location v2**. Laisse les réglages par
   défaut (précision « Medium » suffit et économise la batterie).
3. **+** → catégorie **Net** → **HTTP Request**.
   - **Method** : `POST`
   - **URL** :
     `https://hfukmrrinibsdrrevahs.supabase.co/functions/v1/ingest-location`
   - **Headers** : `Content-Type: application/json`
   - **Body** :

     ```json
     {"token":"TON_JETON","lat":%gl_latitude,"lng":%gl_longitude,"accuracy":%gl_accuracy}
     ```

Puis le déclencheur :

1. Onglet **Profiles** → **+** → **Time**.
2. Coche **Repeat** et règle sur `1 hour`. Valide.
3. Associe le profil à la tâche `Position Awy`.

Tu peux aussi créer un profil **Location** ou **State → Wifi Connected** pour
déclencher à l’arrivée quelque part, exactement comme sur iPhone.

### 4.3. Le réglage Android à ne pas oublier

Android met les applications en veille pour économiser la batterie, et ça
empêche les automatisations de se déclencher. Pour l’app que tu as choisie :

- **Réglages** → **Applications** → ton app → **Batterie** → choisis
  **Sans restriction** (ou « Non optimisée » selon les marques).
- **Réglages** → **Applications** → ton app → **Autorisations** →
  **Position** → **Toujours autoriser**.

Sur Xiaomi, Huawei, Oppo et OnePlus, il faut souvent en plus activer
« Démarrage automatique » dans les réglages de l’app.

---

## 5. Les informations exactes

Si tu utilises un autre outil que ceux décrits ici, voilà tout ce dont il a
besoin.

**Adresse à appeler**

```
https://hfukmrrinibsdrrevahs.supabase.co/functions/v1/ingest-location
```

**Méthode** : `POST`
**En-tête** : `Content-Type: application/json`

**Corps du message**

```json
{
  "token": "awy_3f9c1a7b4e08d25f6a1b8c3d9e0f2a4b6c8d1e3f5a7b9c0d",
  "lat": 52.2297,
  "lng": 21.0122,
  "accuracy": 12
}
```

- `token` — ton jeton, tel quel, sans espace avant ni après.
- `lat` — la latitude, entre -90 et 90.
- `lng` — la longitude, entre -180 et 180.
- `accuracy` — la marge d’erreur en mètres. Facultatif, mais la carte est plus
  honnête avec.

Aucune autre information n’est envoyée : ni le modèle du téléphone, ni le nom du
réseau, ni quoi que ce soit d’autre.

**Réponses possibles**

| Code | Ce que ça veut dire |
|------|---------------------|
| `200` (avec le mot `ok`) | Reçu. |
| `401` | Jeton faux, mal collé ou révoqué. |
| `400` | Le message est mal formé, ou les coordonnées sont hors du monde. |
| `405` | Tu n’as pas envoyé en POST. |
| `503` | Souci passager côté serveur : réessaie plus tard. |

Un détail volontaire : le `200` est renvoyé aussi bien quand le point est
enregistré que quand il est écarté parce que tu as coupé le partage de position,
ou parce qu’il arrive moins d’une minute après le précédent. C’est fait exprès :
quelqu’un qui aurait mis la main sur ton jeton ne doit pas pouvoir deviner, à
partir de la réponse, si tu partages ta position ni quand tu as bougé.

Pour savoir si ça marche vraiment, ne regarde donc pas le code de retour :
regarde la ligne **Dernier envoi** dans Awy, et la carte.

---

## 6. La batterie

Peu de choses, en vérité.

- Une position prise **une fois par heure** coûte quelques secondes de GPS. Sur
  une journée, c’est de l’ordre de 1 % de batterie — moins que deux minutes de
  vidéo.
- Les automatisations d’**arrivée et de départ** ne coûtent quasiment rien : le
  téléphone surveille déjà ces zones pour d’autres applications, on se contente
  de s’y accrocher.
- Ce qui coûte cher, c’est la fréquence. Ne descends pas sous une position toutes
  les quinze minutes. Awy n’enregistre de toute façon pas plus d’un point par
  minute : tout le reste serait de la batterie brûlée pour rien.
- Sur iPhone, le **mode Économie d’énergie** peut retarder ou sauter des
  automatisations. C’est normal, et ça revient tout seul en rechargeant.

---

## 7. Comment tout arrêter

Trois niveaux, du plus doux au plus radical.

1. **Couper le partage, sans rien casser.** Dans Awy → Réglages → « Partager ma
   position ». Le raccourci continue d’appeler dans le vide, et plus rien n’est
   enregistré. C’est l’interrupteur général : il l’emporte toujours sur les
   raccourcis.

2. **Révoquer le jeton.** Dans Awy → Réglages → Position en arrière-plan →
   **Révoquer**, en face du raccourci concerné. À la seconde qui suit, ce jeton
   n’est plus accepté. C’est ce qu’il faut faire si tu perds ton téléphone, si tu
   as envoyé ton jeton par erreur, ou si tu changes d’appareil. Tu peux en créer
   un nouveau juste après.

3. **Supprimer le raccourci du téléphone.** Sur iPhone, onglet Automatisation,
   balaie l’automatisation vers la gauche → Supprimer ; puis fais de même avec le
   raccourci lui-même. Sur Android, supprime le raccourci ou le profil dans
   l’app que tu as utilisée.

Dans tous les cas, les positions déjà enregistrées disparaissent d’elles-mêmes au
bout de 48 heures. Rien à faire de plus.

---

## 8. Si ça ne marche pas

Reprends dans cet ordre, ça va vite.

**La ligne « Dernier envoi » ne bouge jamais, même en lançant le raccourci à la
main.**

- Le jeton est mal collé : un espace en trop au début ou à la fin suffit à le
  rendre faux. Recopie-le depuis ta note, ou crée-en un nouveau.
- L’adresse est incomplète. Elle doit finir par `/functions/v1/ingest-location`.
- La méthode est restée sur `GET`. Elle doit être sur `POST`.
- Le corps n’est pas du JSON, ou une clé est mal orthographiée. Les quatre noms
  sont exactement `token`, `lat`, `lng`, `accuracy` — en minuscules.

**Le raccourci marche à la main, mais jamais tout seul.**

- iPhone : l’automatisation a gardé « Demander avant d’exécuter ». Rouvre-la et
  désactive-le.
- iPhone : l’autorisation de localisation de l’app Raccourcis n’est pas sur
  **Toujours** (voir 3.4).
- Android : l’app est encore optimisée par la batterie (voir 4.3).

**« Dernier envoi » est récent, mais la carte ne bouge pas.**

- « Partager ma position » est coupé dans Awy. C’est le cas le plus fréquent, et
  c’est voulu : le réglage de l’app a le dernier mot.
- Tu envoies plus d’un point par minute : les points en trop sont écartés.
  Espace tes déclencheurs.
- Ton/ta partenaire regarde une carte pas encore rafraîchie : qu’il ou elle
  ferme et rouvre Awy.

**Le raccourci répond `401`.**

Le jeton a été révoqué, ou il est faux. Crée-en un nouveau dans Awy et
recolle-le dans le raccourci. Un jeton révoqué ne se remet jamais en service.

**Rien de tout ça ?**

Crée un deuxième jeton avec un nom différent, refais le raccourci depuis zéro en
suivant la section 3 ou 4 à la lettre, et teste-le à la main. Une fois qu’il
marche à la main, l’automatisation n’est plus qu’une formalité. Puis révoque
l’ancien jeton pour faire le ménage.
