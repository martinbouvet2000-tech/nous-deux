-- ═══════════════════════════════════════════════════════════════════════════
-- Awy — jetons de position en arrière-plan.
--
-- POURQUOI CETTE MIGRATION EXISTE
--   Une application web n’a aucun accès à la position quand elle est fermée :
--   ni sur iPhone, ni sur Android, et un service worker n’a pas le droit
--   d’appeler le GPS. La carte ne peut donc bouger que lorsque l’un des deux
--   ouvre Awy. Le contournement : un raccourci natif du téléphone (Raccourcis
--   sur iOS, HTTP Shortcuts ou Tasker sur Android) qui envoie la position à
--   Supabase sans ouvrir l’app. Il lui faut une clé — c’est ce jeton.
--
-- CE QUE FAIT CETTE MIGRATION
--   1. Table `location_tokens` : une ligne = un raccourci sur un téléphone.
--      Le jeton en clair n’y est JAMAIS écrit ; seule son empreinte SHA-256.
--   2. RLS : chacun ne voit et ne gère que ses propres jetons. Rien pour `anon`.
--   3. `public.creer_jeton_position(etiquette)` : fabrique un jeton aléatoire,
--      en stocke l’empreinte et le renvoie EN CLAIR UNE SEULE FOIS, comme une
--      clé d’API. Personne, pas même la base, ne peut le relire ensuite.
--   4. `public.revoquer_jeton_position(jeton_id)` : bornée à ses propres jetons.
--   5. `public.enregistrer_position(jeton, lat, lng, precision_m)` : le seul
--      point d’entrée des raccourcis, réservé au `service_role` (donc à la
--      fonction Edge `ingest-location`). Elle vérifie l’empreinte, refuse un
--      jeton révoqué, respecte `profiles.share_location`, borne les
--      coordonnées, limite à un point par minute — et n’écrit QUE pour le
--      propriétaire du jeton.
--
-- ⚠ MODÈLE DE SÉCURITÉ — CE QU’UN JETON VOLÉ PERMET, ET CE QU’IL NE PERMET PAS
--   Un jeton volé permet UNIQUEMENT d’écrire des positions au nom de la
--   personne qui l’a créé. C’est vrai par construction, et c’est vérifiable en
--   relisant `enregistrer_position` :
--     • le `user_id` de l’insertion vient de la ligne du jeton (variable
--       `proprietaire`), jamais d’un paramètre : on ne peut pas viser
--       quelqu’un d’autre, ni son/sa partenaire ;
--     • la fonction ne fait aucun `select` de données et ne renvoie qu’un code
--       d’état : elle ne peut rien lire, ni positions, ni profils ;
--     • elle n’est exécutable ni par `anon`, ni par `authenticated` : sans la
--       clé `service_role`, un jeton seul ne sert à rien face à /rest/v1/rpc/ ;
--     • le partage coupé (`profiles.share_location = false`) l’emporte : rien
--       n’est enregistré, le réglage de l’app reste le dernier mot ;
--     • la purge des 48 h (`locations_prune`, migration 20260819120000)
--       s’applique aux points ainsi insérés comme aux autres.
--   Le pire d’un vol de jeton est donc une fausse position sur la carte de son
--   propre couple, arrêtable en une seconde : « Révoquer », dans les Réglages.
--
-- IDEMPOTENCE : `create … if not exists`, `create or replace`,
--   `drop policy if exists` puis `create`. Rejouable sans erreur.
--
-- ROLLBACK :
--   drop function if exists public.enregistrer_position(text, double precision, double precision, int);
--   drop function if exists public.revoquer_jeton_position(uuid);
--   drop function if exists public.creer_jeton_position(text);
--   drop table if exists public.location_tokens;
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — La table des jetons
-- ═══════════════════════════════════════════════════════════════════════════
-- `pgcrypto` est déjà installé dans le schéma `extensions` (voir la liste des
-- extensions du projet). On l’exige quand même, pour qu’un environnement neuf
-- rejoue cette migration sans surprise.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.location_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- L’empreinte SHA-256 du jeton, en hexadécimal. Le jeton en clair n’existe
  -- que le temps d’un aller-retour vers l’écran des Réglages : ni ici, ni dans
  -- les journaux, ni nulle part ailleurs. Une lecture de cette table ne révèle
  -- donc rien d’exploitable — on ne remonte pas d’une empreinte à son jeton.
  token_hash   text not null unique,
  -- « iPhone de Martin », « Tasker » : de quoi reconnaître le raccourci qu’on
  -- révoque. Facultatif, et jamais rien d’intime.
  label        text,
  created_at   timestamptz not null default now(),
  -- Renseigné à chaque appel accepté. C’est le seul témoin utile : « ton
  -- raccourci a parlé il y a 4 minutes » suffit à diagnostiquer un téléphone
  -- mal réglé, sans rien exposer d’autre.
  last_used_at timestamptz,
  revoked_at   timestamptz,
  constraint location_tokens_label_court check (label is null or char_length(label) between 1 and 40)
);

-- Pour un dépôt déjà déployé avant l’ajout d’une colonne : on ne casse rien.
alter table public.location_tokens add column if not exists label        text;
alter table public.location_tokens add column if not exists last_used_at timestamptz;
alter table public.location_tokens add column if not exists revoked_at   timestamptz;

comment on table public.location_tokens is
  'Jetons des raccourcis de position (iOS Raccourcis, Android HTTP Shortcuts/Tasker). Empreinte SHA-256 seulement, jamais le jeton en clair.';
comment on column public.location_tokens.token_hash is
  'encode(digest(jeton, ''sha256''), ''hex''). Irréversible : la base ne peut pas réafficher un jeton.';

create index if not exists location_tokens_user_idx
  on public.location_tokens (user_id);

alter table public.location_tokens enable row level security;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — RLS : ses jetons, rien que ses jetons
-- ═══════════════════════════════════════════════════════════════════════════
-- `(select auth.uid())` — forme retenue par la migration 20260828143000 :
-- évaluée une fois par requête plutôt qu’une fois par ligne.
--
-- Pas de politique INSERT ni UPDATE : créer et révoquer passent par les deux
-- fonctions ci-dessous, qui sont le seul chemin sanctionné. La lecture montre
-- la liste (étiquette, dates) et la suppression permet de faire le ménage dans
-- les lignes révoquées.

drop policy if exists "location_tokens select own" on public.location_tokens;
create policy "location_tokens select own" on public.location_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "location_tokens delete own" on public.location_tokens;
create policy "location_tokens delete own" on public.location_tokens
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Droits de table : rien pour `anon`, jamais.
revoke all on table public.location_tokens from anon;
grant select, delete on table public.location_tokens to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — Créer un jeton (affiché une seule fois)
-- ═══════════════════════════════════════════════════════════════════════════
-- 24 octets aléatoires en hexadécimal, préfixés `awy_` : 192 bits d’entropie,
-- une chaîne sans caractère ambigu, qui se colle sans échappement dans un
-- champ de l’app Raccourcis comme dans un corps JSON.
--
-- SECURITY DEFINER parce que la fonction écrit une ligne qu’aucune politique
-- INSERT n’autorise. Elle reste bornée à `auth.uid()` : impossible de créer un
-- jeton au nom de quelqu’un d’autre.
create or replace function public.creer_jeton_position(etiquette text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  moi   uuid := (select auth.uid());
  jeton text;
begin
  if moi is null then
    raise exception 'Connexion requise pour créer un jeton.' using errcode = 'P0001';
  end if;

  -- Garde-fou de bon sens : deux téléphones et un ordinateur, cela ne fait pas
  -- dix raccourcis. Au-delà, c’est un oubli de ménage — ou pire.
  if (select count(*) from public.location_tokens t
      where t.user_id = moi and t.revoked_at is null) >= 10 then
    raise exception 'Tu as déjà dix jetons actifs. Révoque-en un avant d’en créer un nouveau.'
      using errcode = 'P0001';
  end if;

  jeton := 'awy_' || encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.location_tokens (user_id, token_hash, label)
  values (
    moi,
    encode(extensions.digest(jeton, 'sha256'), 'hex'),
    nullif(btrim(coalesce(etiquette, '')), '')
  );

  -- Unique retour du jeton en clair de toute sa vie.
  return jeton;
end;
$fn$;

comment on function public.creer_jeton_position(text) is
  'Crée un jeton de position et le renvoie en clair une seule fois. Seule son empreinte est stockée.';

revoke execute on function public.creer_jeton_position(text) from public;
revoke execute on function public.creer_jeton_position(text) from anon;
grant  execute on function public.creer_jeton_position(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Révoquer un jeton
-- ═══════════════════════════════════════════════════════════════════════════
-- On marque au lieu de supprimer : la ligne révoquée reste visible dans les
-- Réglages, ce qui permet de vérifier d’un coup d’œil que le bon raccourci a
-- bien été coupé. La suppression définitive reste possible (politique DELETE).
create or replace function public.revoquer_jeton_position(jeton_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  moi     uuid := (select auth.uid());
  touchee int;
begin
  if moi is null or jeton_id is null then
    return false;
  end if;

  update public.location_tokens
     set revoked_at = now()
   where id = jeton_id
     and user_id = moi           -- bornage explicite : ses jetons, rien d’autre
     and revoked_at is null;

  get diagnostics touchee = row_count;
  return touchee > 0;
end;
$fn$;

comment on function public.revoquer_jeton_position(uuid) is
  'Révoque immédiatement un de ses propres jetons de position. Le raccourci du téléphone cesse d’être accepté.';

revoke execute on function public.revoquer_jeton_position(uuid) from public;
revoke execute on function public.revoquer_jeton_position(uuid) from anon;
grant  execute on function public.revoquer_jeton_position(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — Enregistrer une position (le point d’entrée des raccourcis)
-- ═══════════════════════════════════════════════════════════════════════════
-- Appelée uniquement par la fonction Edge `ingest-location`, avec la clé
-- `service_role`. Elle ne renvoie qu’un code d’état, jamais une donnée :
--   'ok'                    → point enregistré
--   'jeton_invalide'        → jeton inconnu, vide ou révoqué
--   'coordonnees_invalides' → hors bornes, NaN ou infini
--   'partage_coupe'         → `profiles.share_location` est à false
--   'trop_frequent'         → moins d’une minute depuis le dernier point
--
-- L’ordre des vérifications est délibéré : le jeton d’abord. Ainsi, un appel
-- sans jeton valable ne peut rien apprendre du reste — ni si quelqu’un partage
-- sa position, ni quand il l’a fait pour la dernière fois.
create or replace function public.enregistrer_position(
  jeton       text,
  lat         double precision,
  lng         double precision,
  precision_m int default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
#variable_conflict use_variable
-- La directive ci-dessus lève une ambiguïté de principe : les paramètres `lat`
-- et `lng` portent le nom de deux colonnes de `public.locations`. Dans ce
-- corps, ces deux noms désignent les paramètres, jamais des colonnes.
declare
  empreinte    text;
  proprietaire uuid;
  revoque      timestamptz;
  jeton_uuid   uuid;
begin
  -- ─── 1. Le jeton ────────────────────────────────────────────────────────
  -- Un jeton fait 52 caractères ('awy_' + 48 hex). En dessous de 16, inutile
  -- de calculer quoi que ce soit : c’est du bruit, pas une tentative crédible.
  if jeton is null or char_length(jeton) < 16 then
    return 'jeton_invalide';
  end if;

  empreinte := encode(extensions.digest(jeton, 'sha256'), 'hex');

  select t.id, t.user_id, t.revoked_at
    into jeton_uuid, proprietaire, revoque
    from public.location_tokens t
   where t.token_hash = empreinte;

  -- Jeton inconnu ou révoqué : même réponse pour les deux. Rien à en tirer.
  if proprietaire is null or revoque is not null then
    return 'jeton_invalide';
  end if;

  -- Le jeton est bon : on horodate son usage AVANT de juger le contenu. C’est
  -- ce qui permet à quelqu’un de vérifier dans les Réglages que son téléphone
  -- appelle bien, même quand le point est ensuite écarté.
  update public.location_tokens set last_used_at = now() where id = jeton_uuid;

  -- ─── 2. Les coordonnées ─────────────────────────────────────────────────
  -- Les comparaisons attrapent aussi NaN et les infinis : en PostgreSQL, NaN
  -- est supérieur à toute autre valeur, donc `lat > 90` est vrai pour NaN.
  if lat is null or lng is null
     or lat < -90  or lat > 90
     or lng < -180 or lng > 180 then
    return 'coordonnees_invalides';
  end if;

  -- ─── 3. Le réglage de l’app a le dernier mot ────────────────────────────
  -- Partage coupé dans les Réglages : rien n’est enregistré, quel que soit le
  -- nombre de raccourcis encore actifs sur le téléphone. Le bouton de l’app
  -- reste l’interrupteur général.
  if not exists (
    select 1 from public.profiles p
     where p.id = proprietaire and p.share_location
  ) then
    return 'partage_coupe';
  end if;

  -- ─── 4. Anti-spam : un point par minute au maximum ──────────────────────
  -- Une automatisation horaire n’y touche jamais. Cela borne en revanche un
  -- raccourci mal réglé qui bouclerait, et un jeton volé qui voudrait noyer la
  -- carte sous de fausses positions.
  if exists (
    select 1 from public.locations l
     where l.user_id = proprietaire
       and l.recorded_at > now() - interval '1 minute'
  ) then
    return 'trop_frequent';
  end if;

  -- ─── 5. L’écriture ──────────────────────────────────────────────────────
  -- `proprietaire` vient de la ligne du jeton, JAMAIS d’un paramètre : un
  -- jeton n’écrit que pour la personne qui l’a créé. Le déclencheur
  -- `locations_prune` fera comme d’habitude le ménage au-delà de 48 h.
  insert into public.locations (user_id, lat, lng, accuracy)
  values (
    proprietaire,
    lat,
    lng,
    -- Une précision absurde (négative, ou 300 km) ne vaut pas mieux qu’absente.
    case when precision_m is null or precision_m < 0 or precision_m > 100000
         then null else precision_m::real end
  );

  return 'ok';
end;
$fn$;

comment on function public.enregistrer_position(text, double precision, double precision, int) is
  'Enregistre une position pour le propriétaire du jeton. Réservée au service_role (fonction Edge ingest-location).';

-- Le geste décisif, dans l’esprit de la migration 20260826153500 : les default
-- privileges de Supabase accordent EXECUTE à `public` (donc à `anon` et
-- `authenticated`) à la création. On les retire tous. Seul le `service_role`,
-- c’est-à-dire la fonction Edge, garde la main : un jeton présenté à
-- /rest/v1/rpc/enregistrer_position se heurte à un refus de droits.
revoke execute on function public.enregistrer_position(text, double precision, double precision, int) from public;
revoke execute on function public.enregistrer_position(text, double precision, double precision, int) from anon;
revoke execute on function public.enregistrer_position(text, double precision, double precision, int) from authenticated;
grant  execute on function public.enregistrer_position(text, double precision, double precision, int) to service_role;
