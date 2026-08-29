-- ═══════════════════════════════════════════════════════════════════════════
-- Awy — notifications push (Web Push), de bout en bout.
--
-- CE QUE FAIT CETTE MIGRATION
--   1. Extensions : `pg_net` (appel HTTP asynchrone depuis la base) et
--      `pg_cron` (tâche quotidienne des capsules).
--   2. Table `push_subscriptions` : un abonnement par navigateur/appareil,
--      protégé par RLS — chacun ne voit et ne gère QUE les siens.
--   3. `public.envoyer_push(...)` : le pont base → fonction Edge `send-push`.
--      SECURITY DEFINER, search_path verrouillé, secret lu dans le Vault,
--      et surtout NON exécutable par `authenticated` : personne ne doit
--      pouvoir se servir de la base comme d'un émetteur de notifications.
--   4. `public.lire_secret_push(...)` : lecture du Vault réservée au
--      `service_role`, pour la fonction Edge. Liste blanche de deux noms.
--   5. Les déclencheurs d'écriture : taps, love_notes, gratitudes, vlogs
--      (after insert) et moods (after insert or update).
--   6. La tâche quotidienne des capsules arrivées à leur date.
--
-- ⚠ RÈGLE ABSOLUE — UNE NOTIFICATION NE RÉVÈLE JAMAIS CE QUE L'APP CACHE
--   Une notification s'affiche sur un écran verrouillé, parfois devant
--   quelqu'un d'autre. Aucun message composé ici ne lit une colonne de
--   contenu. Concrètement, et c'est vérifiable en relisant ce fichier :
--     • `moods`     → on annonce « a posé son humeur », jamais `state`,
--                     `emoji`, `label` ni `note`. La révélation reste
--                     réciproque : on ne découvre l'humeur qu'en posant la
--                     sienne, dans l'app.
--     • `capsules`  → on annonce qu'une capsule arrive à sa date, jamais
--                     `content`. Le sceau tient toujours à la règle RLS.
--     • `love_notes`, `gratitudes`, `vlogs` → le geste et son auteur·ice,
--                     jamais `content`, `items` ni `caption`.
--   Seul le prénom (`profiles.display_name`) figure dans un message.
--   Les textes sont le miroir exact de `src/lib/pushMessages.ts`, et un test
--   (`src/lib/__tests__/pushMessages.test.ts`) relit CE fichier pour vérifier
--   qu'ils n'ont pas divergé et qu'aucune colonne de contenu n'y apparaît.
--
-- SECRETS
--   Rien de sensible n'est écrit ici. `vapid_private_key` et
--   `push_hook_secret` vivent dans Supabase Vault et sont lus à l'exécution
--   via `vault.decrypted_secrets`. La clé PUBLIQUE VAPID est publique par
--   nature : elle est côté client (`VITE_VAPID_PUBLIC_KEY`).
--
-- IDEMPOTENCE : `create … if not exists`, `create or replace`,
--   `drop policy/trigger if exists` puis `create`. Rejouable sans erreur.
--
-- ROLLBACK :
--   do $r$ begin
--     if exists (select 1 from cron.job where jobname = 'awy_capsules_du_jour')
--       then perform cron.unschedule('awy_capsules_du_jour'); end if;
--   end $r$;
--   drop trigger if exists taps_push        on public.taps;
--   drop trigger if exists love_notes_push  on public.love_notes;
--   drop trigger if exists gratitudes_push  on public.gratitudes;
--   drop trigger if exists vlogs_push       on public.vlogs;
--   drop trigger if exists moods_push       on public.moods;
--   drop function if exists public.push_apres_tap(), public.push_apres_petit_mot(),
--                           public.push_apres_gratitude(), public.push_apres_vlog(),
--                           public.push_apres_humeur(), public.notifier_capsules_du_jour(),
--                           public.lire_secret_push(text),
--                           public.envoyer_push(uuid, text, text, text, text);
--   drop table if exists public.push_subscriptions;
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Extensions
-- ═══════════════════════════════════════════════════════════════════════════

-- Appels HTTP asynchrones depuis Postgres. Asynchrone est ici une qualité :
-- un déclencheur ne doit jamais faire attendre l'insertion d'un « tap ».
create extension if not exists pg_net with schema extensions;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Les abonnements
-- ═══════════════════════════════════════════════════════════════════════════
-- Une ligne = un navigateur sur un appareil. Martin en aura une pour son
-- iPhone, peut-être une pour son ordinateur ; Clarisse les siennes. Rien
-- d'intime n'y est stocké : une URL d'endpoint, deux clés publiques de
-- chiffrement, et de quoi reconnaître l'appareil dans la liste.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- L'URL fournie par le service de push (Apple, Google, Mozilla…). Unique :
  -- c'est elle qui identifie l'appareil, et elle sert de cible à l'upsert.
  endpoint    text not null unique,
  -- Clés publiques de l'abonnement (chiffrement aes128gcm côté fonction Edge).
  p256dh      text not null,
  auth        text not null,
  -- Pour distinguer « le téléphone » de « l'ordinateur » dans la liste.
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Abonnements Web Push, un par navigateur. Aucun contenu intime : endpoint + clés publiques.';

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- RLS : strictement ses propres abonnements, dans les quatre sens.
-- `(select auth.uid())` — forme retenue par la migration 20260828143000 :
-- évaluée une fois par requête plutôt qu'une fois par ligne.
drop policy if exists "push_subscriptions select own" on public.push_subscriptions;
create policy "push_subscriptions select own" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "push_subscriptions insert own" on public.push_subscriptions;
create policy "push_subscriptions insert own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- USING borne les lignes modifiables, WITH CHECK interdit de réattribuer
-- un abonnement à quelqu'un d'autre au passage.
drop policy if exists "push_subscriptions update own" on public.push_subscriptions;
create policy "push_subscriptions update own" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "push_subscriptions delete own" on public.push_subscriptions;
create policy "push_subscriptions delete own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Droits de table : rien pour `anon`, jamais.
revoke all on table public.push_subscriptions from anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — Le pont vers la fonction Edge
-- ═══════════════════════════════════════════════════════════════════════════

-- Lecture du Vault réservée à la fonction Edge (`service_role`).
-- La liste blanche de noms est délibérée : même si la clé service_role fuitait,
-- cette fonction ne deviendrait pas une lucarne sur tout le coffre.
create or replace function public.lire_secret_push(nom text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = nom
    and nom in ('vapid_private_key', 'push_hook_secret')
  limit 1
$fn$;

revoke execute on function public.lire_secret_push(text) from public, anon, authenticated;
grant  execute on function public.lire_secret_push(text) to service_role;

-- Le pont base → fonction Edge.
--
-- `search_path` verrouillé et volontairement à deux entrées pour pg_net :
-- selon la version, l'extension pose `http_post` dans `net` ou dans
-- `extensions`. On cite les deux et on appelle sans qualifier — ainsi la
-- fonction marche quelle que soit l'installation, sans jamais dépendre d'un
-- search_path fourni par l'appelant.
create or replace function public.envoyer_push(
  destinataire uuid,
  titre        text,
  corps        text,
  lien         text default '/',
  etiquette    text default 'awy'
)
returns void
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $fn$
declare
  secret_hook text;
  url_fonction constant text := 'https://hfukmrrinibsdrrevahs.supabase.co/functions/v1/send-push';
begin
  if destinataire is null then
    return;
  end if;

  -- Personne d'abonné en face : inutile de réveiller la fonction Edge.
  if not exists (select 1 from public.push_subscriptions s where s.user_id = destinataire) then
    return;
  end if;

  select s.decrypted_secret into secret_hook
  from vault.decrypted_secrets s
  where s.name = 'push_hook_secret'
  limit 1;

  -- Secret absent : on se tait plutôt que d'émettre un appel qui serait refusé.
  if secret_hook is null then
    raise notice 'Awy : secret push_hook_secret absent du Vault, notification non émise';
    return;
  end if;

  perform http_post(
    url     := url_fonction,
    body    := jsonb_build_object(
                 'destinataire', destinataire,
                 'titre',        titre,
                 'corps',        corps,
                 'lien',         coalesce(lien, '/'),
                 'etiquette',    coalesce(etiquette, 'awy')
               ),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-awy-secret', secret_hook
               ),
    timeout_milliseconds := 5000
  );
end;
$fn$;

-- Cette fonction ne doit être appelable QUE par les déclencheurs (qui tournent
-- sous le rôle propriétaire, indépendamment des grants EXECUTE) et par la tâche
-- cron. Surtout pas depuis /rest/v1/rpc/ : ce serait offrir à n'importe quelle
-- session connectée un émetteur de notifications au texte libre.
-- Même geste que la migration 20260826153500.
revoke execute on function public.envoyer_push(uuid, text, text, text, text) from public;
revoke execute on function public.envoyer_push(uuid, text, text, text, text) from anon;
revoke execute on function public.envoyer_push(uuid, text, text, text, text) from authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Les déclencheurs d'écriture
-- ═══════════════════════════════════════════════════════════════════════════
-- Invariants communs aux cinq :
--   • on ne notifie QUE le/la partenaire, jamais l'auteur·ice de son propre
--     geste (garde explicite `<> auteur` dans chaque fonction) ;
--   • un échec d'envoi ne doit JAMAIS empêcher le geste : le bloc `exception`
--     avale l'erreur et laisse l'insertion aboutir ;
--   • aucune colonne de contenu n'est lue. Seul `display_name` l'est.

-- ─── Envie d'appel (le plus urgent : un signal en retard ne sert à rien) ────
create or replace function public.push_apres_tap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  prenom text;
begin
  if new.receiver_id is null or new.receiver_id = new.sender_id then
    return new;
  end if;
  select p.display_name into prenom from public.profiles p where p.id = new.sender_id;
  begin
    perform public.envoyer_push(
      new.receiver_id,
      'Envie d’appel',
      coalesce(prenom, 'Ton/ta partenaire') || ' a envie de t’entendre, là, maintenant.',
      '/',
      'awy-appel'
    );
  exception when others then
    raise notice 'Awy : notification « appel » non émise (%)', sqlerrm;
  end;
  return new;
end;
$fn$;

drop trigger if exists taps_push on public.taps;
create trigger taps_push after insert on public.taps
  for each row execute function public.push_apres_tap();

-- ─── Petit mot ─────────────────────────────────────────────────────────────
create or replace function public.push_apres_petit_mot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  prenom text;
begin
  if new.receiver_id is null or new.receiver_id = new.sender_id then
    return new;
  end if;
  select p.display_name into prenom from public.profiles p where p.id = new.sender_id;
  begin
    -- `new.content` n'est délibérément pas lu : le mot se lit dans l'app.
    perform public.envoyer_push(
      new.receiver_id,
      'Petit mot',
      coalesce(prenom, 'Ton/ta partenaire') || ' t’a laissé un petit mot.',
      '/',
      'awy-petit-mot'
    );
  exception when others then
    raise notice 'Awy : notification « petit mot » non émise (%)', sqlerrm;
  end;
  return new;
end;
$fn$;

drop trigger if exists love_notes_push on public.love_notes;
create trigger love_notes_push after insert on public.love_notes
  for each row execute function public.push_apres_petit_mot();

-- ─── Humeur ────────────────────────────────────────────────────────────────
-- Le cas le plus délicat. L'app masque volontairement l'humeur du/de la
-- partenaire tant qu'on n'a pas posé la sienne : la notification annonce le
-- geste, invite à la réciprocité, et ne nomme jamais l'état.
create or replace function public.push_apres_humeur()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  partenaire uuid;
  prenom text;
begin
  -- Une mise à jour qui ne change ni l'état ni l'emoji (note retouchée,
  -- horodatage) ne mérite pas de faire vibrer un téléphone une seconde fois.
  if tg_op = 'UPDATE'
     and new.state is not distinct from old.state
     and new.emoji is not distinct from old.emoji then
    return new;
  end if;

  partenaire := public.get_partner_id(new.user_id);
  if partenaire is null or partenaire = new.user_id then
    return new;
  end if;

  select p.display_name into prenom from public.profiles p where p.id = new.user_id;
  begin
    perform public.envoyer_push(
      partenaire,
      'Humeur du jour',
      coalesce(prenom, 'Ton/ta partenaire') || ' a posé son humeur. Pose la tienne pour la découvrir.',
      '/',
      'awy-humeur'
    );
  exception when others then
    raise notice 'Awy : notification « humeur » non émise (%)', sqlerrm;
  end;
  return new;
end;
$fn$;

drop trigger if exists moods_push on public.moods;
create trigger moods_push after insert or update on public.moods
  for each row execute function public.push_apres_humeur();

-- ─── Gratitude ─────────────────────────────────────────────────────────────
create or replace function public.push_apres_gratitude()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  partenaire uuid;
  prenom text;
begin
  partenaire := public.get_partner_id(new.user_id);
  if partenaire is null or partenaire = new.user_id then
    return new;
  end if;
  select p.display_name into prenom from public.profiles p where p.id = new.user_id;
  begin
    -- `new.items` n'est pas lu : ces phrases-là se lisent dans l'app.
    perform public.envoyer_push(
      partenaire,
      'Gratitude',
      coalesce(prenom, 'Ton/ta partenaire') || ' a noté ses gratitudes du jour.',
      '/',
      'awy-gratitude'
    );
  exception when others then
    raise notice 'Awy : notification « gratitude » non émise (%)', sqlerrm;
  end;
  return new;
end;
$fn$;

drop trigger if exists gratitudes_push on public.gratitudes;
create trigger gratitudes_push after insert on public.gratitudes
  for each row execute function public.push_apres_gratitude();

-- ─── Vlog ──────────────────────────────────────────────────────────────────
create or replace function public.push_apres_vlog()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  partenaire uuid;
  prenom text;
begin
  partenaire := public.get_partner_id(new.author_id);
  if partenaire is null or partenaire = new.author_id then
    return new;
  end if;
  select p.display_name into prenom from public.profiles p where p.id = new.author_id;
  begin
    -- Ni `new.caption`, ni `new.media_path` : le moment se regarde dans l'app.
    perform public.envoyer_push(
      partenaire,
      'Vlog',
      coalesce(prenom, 'Ton/ta partenaire') || ' a ajouté un moment au vlog.',
      '/memories',
      'awy-vlog'
    );
  exception when others then
    raise notice 'Awy : notification « vlog » non émise (%)', sqlerrm;
  end;
  return new;
end;
$fn$;

drop trigger if exists vlogs_push on public.vlogs;
create trigger vlogs_push after insert on public.vlogs
  for each row execute function public.push_apres_vlog();

-- Les fonctions de déclencheur ne doivent être appelables par personne en RPC
-- (elles s'exécutent de toute façon sous le rôle propriétaire) — cf. 20260826153500.
do $g$
declare f text;
begin
  foreach f in array array[
    'push_apres_tap', 'push_apres_petit_mot', 'push_apres_humeur',
    'push_apres_gratitude', 'push_apres_vlog'
  ]
  loop
    execute format('revoke execute on function public.%I() from public, anon, authenticated', f);
  end loop;
end
$g$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — Les capsules : une tâche quotidienne, pas un déclencheur
-- ═══════════════════════════════════════════════════════════════════════════
-- Une capsule n'a rien à annoncer le jour où on l'écrit — ce serait même
-- éventer la surprise. Ce qui compte, c'est le jour où elle s'ouvre : aucune
-- écriture n'a lieu ce jour-là, d'où le rendez-vous quotidien.

create or replace function public.notifier_capsules_du_jour()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c record;
  prenom text;
  envoyees integer := 0;
begin
  -- Un couple, une capsule ou dix : une notification par expéditeur·ice suffit.
  for c in
    select distinct cap.receiver_id, cap.sender_id
    from public.capsules cap
    where cap.reveal_date = current_date
      and cap.is_opened = false
  loop
    select p.display_name into prenom from public.profiles p where p.id = c.sender_id;
    begin
      -- `cap.content` n'est jamais lu : la capsule reste scellée jusqu'à ce
      -- qu'on l'ouvre soi-même, dans l'app.
      perform public.envoyer_push(
        c.receiver_id,
        'Capsule à ouvrir',
        'Une capsule de ' || coalesce(prenom, 'ton/ta partenaire') || ' arrive à sa date. Elle t’attend.',
        '/memories?tab=capsules',
        'awy-capsule'
      );
      envoyees := envoyees + 1;
    exception when others then
      raise notice 'Awy : notification « capsule » non émise (%)', sqlerrm;
    end;
  end loop;
  return envoyees;
end;
$fn$;

revoke execute on function public.notifier_capsules_du_jour() from public;
revoke execute on function public.notifier_capsules_du_jour() from anon;
revoke execute on function public.notifier_capsules_du_jour() from authenticated;

-- Rendez-vous quotidien à 07 h 00 UTC — 9 h à Paris en été, 8 h en hiver :
-- le matin, à une heure où une capsule fait plaisir.
--
-- Tout est enveloppé : si `pg_cron` n'est pas disponible sur l'instance, le
-- reste de la migration (les cinq déclencheurs) doit quand même s'appliquer.
do $cron$
begin
  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'Awy : pg_cron indisponible (%) — planifie notifier_capsules_du_jour() autrement.', sqlerrm;
    return;
  end;

  -- Replanification idempotente : on retire l'ancienne entrée avant d'inscrire
  -- la nouvelle, sinon un rejeu créerait un doublon de tâche.
  if exists (select 1 from cron.job where jobname = 'awy_capsules_du_jour') then
    perform cron.unschedule('awy_capsules_du_jour');
  end if;

  perform cron.schedule(
    'awy_capsules_du_jour',
    '0 7 * * *',
    'select public.notifier_capsules_du_jour()'
  );
end
$cron$;
