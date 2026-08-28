-- ═══════════════════════════════════════════════════════════════════════════
-- FILET DE SÉCURITÉ — état exact des objets AVANT le retrait du schéma mort
--
-- Projet Supabase : hfukmrrinibsdrrevahs (« nous-deux », production)
-- Capturé le      : 2026-08-28, en lecture seule, depuis
--                   information_schema.columns, pg_constraint, pg_indexes,
--                   pg_policies, pg_class.relacl, pg_trigger,
--                   storage.buckets et pg_publication_tables.
--
-- À QUOI SERT CE FICHIER
-- La migration `20260828170000_retrait_schema_mort.sql` supprime six tables du
-- schéma `public` et le bucket Storage `album-photos`. Toutes étaient VIDES au
-- moment de la capture (0 ligne, 0 fichier) : il n'y a donc AUCUNE donnée à
-- restaurer, seulement des DÉFINITIONS. Ce fichier est la seule trace de ces
-- définitions une fois la migration appliquée. Le rejouer reconstruit les six
-- tables et le bucket à l'identique — mêmes colonnes, mêmes valeurs par
-- défaut, mêmes contraintes, mêmes index, mêmes politiques RLS, mêmes droits,
-- même trigger, même appartenance à la publication temps réel.
--
-- CE QUE COUVRE CE FICHIER (rien d'autre n'est touché par la migration)
--   • public.thoughts         — ancienne fonctionnalité « Pensées », retirée
--   • public.streaks          — compteur de séries, jamais utilisé
--   • public.photos           — album photo, jamais construit
--   • public.photo_albums     — idem
--   • public.album_memories   — idem
--   • public.timeline_events  — onglet « Notre histoire », fondu dans le vlog
--   • bucket Storage `album-photos` + ses 3 politiques dans storage.objects
--
-- CE QUE CE FICHIER NE TOUCHE PAS, ET NE DOIT JAMAIS TOUCHER
--   • public.vlogs (11 lignes) et le bucket `vlogs` (11 fichiers) : ce sont
--     LES SOUVENIRS DU COUPLE. Objets distincts, hors périmètre.
--   • public.profiles, référencée par plusieurs clés étrangères ci-dessous :
--     elle doit exister pour que la section 2 passe (c'est le cas).
--   • la fonction public.enforce_single_origin() : elle survit à la migration
--     (seul son trigger disparaît avec album_memories). La section 6 se
--     contente donc de rebrancher le trigger sur la fonction existante.
--
-- COMMENT S'EN SERVIR
-- 1. Rejeu via l'outil MCP `apply_migration` (ou psql en service_role) sur le
--    MÊME projet. Ne jamais passer par `supabase db push` : l'historique local
--    ne coïncide pas avec l'historique distant.
-- 2. Les sections sont ORDONNÉES et interdépendantes pour les tables :
--       1. CREATE TABLE (photo_albums avant photos : clé étrangère)
--       2. contraintes (clés primaires, étrangères, CHECK)
--       3. index
--       4. RLS + politiques
--       5. droits (GRANT)
--       6. trigger
--       7. publication temps réel
--       8. bucket Storage et ses politiques
--    Les sections 1 à 7 (base) et la section 8 (Storage) sont indépendantes
--    l'une de l'autre : on peut ne rejouer que l'une des deux.
-- 3. Tout est écrit en `if not exists` / `drop … if exists` : le fichier est
--    rejouable sans erreur, y compris partiellement.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Les six tables (colonnes, types, valeurs par défaut, NOT NULL)
-- Reconstruites depuis information_schema.columns, dans l'ordre des colonnes
-- d'origine (ordinal_position). Le propriétaire d'origine est `postgres`.
-- ───────────────────────────────────────────────────────────────────────────

-- « Pensées » : messages courts d'un partenaire à l'autre. Fonctionnalité
-- retirée de l'application ; la table était restée.
create table if not exists public.thoughts (
  id           uuid        not null default gen_random_uuid(),
  sender_id    uuid        not null,
  receiver_id  uuid        not null,
  content      text,
  image_url    text,
  is_read      boolean     not null default false,
  created_at   timestamptz not null default now()
);

-- Compteur de « séries » (jours consécutifs). Jamais branché à l'application.
create table if not exists public.streaks (
  id                 uuid        not null default gen_random_uuid(),
  current_count      integer     not null default 0,
  longest_count      integer     not null default 0,
  last_activity_date date,
  updated_at         timestamptz not null default now()
);

-- Albums de l'album photo jamais construit. À créer AVANT `photos`, qui
-- porte une clé étrangère vers elle.
create table if not exists public.photo_albums (
  id         uuid        not null default gen_random_uuid(),
  title      text        not null,
  cover_url  text,
  created_by uuid        not null,
  created_at timestamptz not null default now()
);

-- Photos de l'album photo jamais construit.
create table if not exists public.photos (
  id          uuid        not null default gen_random_uuid(),
  album_id    uuid,
  uploaded_by uuid        not null,
  url         text        not null,
  caption     text,
  is_favorite boolean     not null default false,
  taken_at    timestamptz,
  created_at  timestamptz not null default now()
);

-- Souvenirs « punaisés » (position x/y, rotation, plan z) de l'album photo
-- jamais construit. `author` valait 'M' par défaut.
create table if not exists public.album_memories (
  id         uuid        not null default gen_random_uuid(),
  photo_url  text        not null,
  back_url   text,
  caption    text,
  author     text        not null default 'M'::text,
  taken_on   date,
  x          real        not null default 50,
  y          real        not null default 50,
  rot        real        not null default 0,
  z          integer     not null default 1,
  created_at timestamptz not null default now(),
  story      text,
  is_origin  boolean     not null default false
);

-- Onglet « Notre histoire » : les étapes datées du couple. L'onglet a été
-- fondu dans le vlog ; la table était restée, vide.
create table if not exists public.timeline_events (
  id          uuid        not null default gen_random_uuid(),
  title       text        not null,
  description text,
  emoji       text        default '💕'::text,
  event_date  date        not null,
  photo_url   text,
  created_by  uuid        not null,
  created_at  timestamptz not null default now()
);


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Contraintes (pg_constraint / pg_get_constraintdef)
-- Clés primaires, clés étrangères et CHECK, avec leurs NOMS d'origine.
-- Toutes les clés étrangères pointent vers public.profiles(id), qui n'est
-- pas touchée par la migration et doit donc exister au moment du rejeu.
-- ───────────────────────────────────────────────────────────────────────────
-- Rejouable : chaque contrainte n'est ajoutée que si son nom n'existe pas
-- déjà sur la table visée.
do $contraintes$
declare
  c record;
begin
  for c in
    select * from (values
      -- (table, nom de la contrainte, définition)
      ('thoughts',        'thoughts_pkey',                  'primary key (id)'),
      ('streaks',         'streaks_pkey',                   'primary key (id)'),
      ('photo_albums',    'photo_albums_pkey',              'primary key (id)'),
      ('photos',          'photos_pkey',                    'primary key (id)'),
      ('album_memories',  'album_memories_pkey',            'primary key (id)'),
      ('timeline_events', 'timeline_events_pkey',           'primary key (id)'),
      ('thoughts',        'thoughts_sender_id_fkey',        'foreign key (sender_id) references public.profiles(id) on delete cascade'),
      ('thoughts',        'thoughts_receiver_id_fkey',      'foreign key (receiver_id) references public.profiles(id) on delete cascade'),
      ('photo_albums',    'photo_albums_created_by_fkey',   'foreign key (created_by) references public.profiles(id) on delete cascade'),
      ('photos',          'photos_album_id_fkey',           'foreign key (album_id) references public.photo_albums(id) on delete set null'),
      ('photos',          'photos_uploaded_by_fkey',        'foreign key (uploaded_by) references public.profiles(id) on delete cascade'),
      ('timeline_events', 'timeline_events_created_by_fkey','foreign key (created_by) references public.profiles(id) on delete cascade'),
      ('thoughts',        'thoughts_content_len',           'check (((content is null) or (char_length(content) <= 2000)))')
    ) as t(tbl, nom, def)
  loop
    if not exists (
      select 1 from pg_constraint
       where conname = c.nom
         and conrelid = format('public.%I', c.tbl)::regclass
    ) then
      execute format('alter table public.%I add constraint %I %s', c.tbl, c.nom, c.def);
    end if;
  end loop;
end
$contraintes$;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Index (pg_indexes)
-- Les index de clé primaire sont créés automatiquement par la section 2 et ne
-- sont donc pas répétés ici. Ne restent que les index explicites.
-- ───────────────────────────────────────────────────────────────────────────

create index if not exists idx_thoughts_unread
  on public.thoughts using btree (receiver_id, is_read) where (is_read = false);

create index if not exists thoughts_receiver_created_idx
  on public.thoughts using btree (receiver_id, created_at desc);

create index if not exists thoughts_sender_created_idx
  on public.thoughts using btree (sender_id, created_at desc);

create index if not exists idx_photos_album
  on public.photos using btree (album_id, created_at desc);

-- Garantissait qu'un seul souvenir pouvait porter `is_origin = true`.
create unique index if not exists album_memories_single_origin
  on public.album_memories using btree (is_origin) where is_origin;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 4 — RLS et politiques (pg_policies)
-- 21 politiques au total sur les six tables (public en comptait 84 avant la
-- migration, donc 63 après). Reconstruites à l'identique : nom, rôles,
-- commande, USING, WITH CHECK. Les politiques écrites `to public` l'étaient
-- réellement (rôle PUBLIC), ce n'est pas une approximation.
-- Les expressions utilisent la forme optimisée `(select auth.uid())` /
-- `(select get_partner_id(...))` introduite par la migration de perf du
-- 28/08 — c'est bien l'état capturé.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.thoughts        enable row level security;
alter table public.streaks         enable row level security;
alter table public.photo_albums    enable row level security;
alter table public.photos          enable row level security;
alter table public.album_memories  enable row level security;
alter table public.timeline_events enable row level security;

-- ── public.thoughts ────────────────────────────────────────────────────────
drop policy if exists "Users can view sent and received thoughts" on public.thoughts;
create policy "Users can view sent and received thoughts"
  on public.thoughts as permissive for select to public
  using (((sender_id = ( select auth.uid() as uid)) or (receiver_id = ( select auth.uid() as uid))));

drop policy if exists "Users can send thoughts to partner" on public.thoughts;
create policy "Users can send thoughts to partner"
  on public.thoughts as permissive for insert to public
  with check (((sender_id = ( select auth.uid() as uid)) and (receiver_id = ( select get_partner_id(( select auth.uid() as uid)) as get_partner_id))));

drop policy if exists "Receiver can mark thoughts as read" on public.thoughts;
create policy "Receiver can mark thoughts as read"
  on public.thoughts as permissive for update to public
  using ((receiver_id = ( select auth.uid() as uid)));

-- ── public.streaks ─────────────────────────────────────────────────────────
drop policy if exists "streaks authenticated select" on public.streaks;
create policy "streaks authenticated select"
  on public.streaks as permissive for select to authenticated
  using ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null));

drop policy if exists "streaks authenticated insert" on public.streaks;
create policy "streaks authenticated insert"
  on public.streaks as permissive for insert to authenticated
  with check ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null));

drop policy if exists "streaks authenticated update" on public.streaks;
create policy "streaks authenticated update"
  on public.streaks as permissive for update to authenticated
  using ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null))
  with check ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null));

-- ── public.photo_albums ────────────────────────────────────────────────────
drop policy if exists "Both partners can view albums" on public.photo_albums;
create policy "Both partners can view albums"
  on public.photo_albums as permissive for select to public
  using (((created_by = ( select auth.uid() as uid)) or (created_by = ( select get_partner_id(( select auth.uid() as uid)) as get_partner_id))));

drop policy if exists "Users can create albums" on public.photo_albums;
create policy "Users can create albums"
  on public.photo_albums as permissive for insert to public
  with check ((created_by = ( select auth.uid() as uid)));

drop policy if exists "Both partners can update albums" on public.photo_albums;
create policy "Both partners can update albums"
  on public.photo_albums as permissive for update to public
  using (((created_by = ( select auth.uid() as uid)) or (created_by = ( select get_partner_id(( select auth.uid() as uid)) as get_partner_id))));

-- ── public.photos ──────────────────────────────────────────────────────────
drop policy if exists "Both partners can view photos" on public.photos;
create policy "Both partners can view photos"
  on public.photos as permissive for select to public
  using (((uploaded_by = ( select auth.uid() as uid)) or (uploaded_by = ( select get_partner_id(( select auth.uid() as uid)) as get_partner_id))));

drop policy if exists "Users can upload photos" on public.photos;
create policy "Users can upload photos"
  on public.photos as permissive for insert to public
  with check ((uploaded_by = ( select auth.uid() as uid)));

drop policy if exists "Both partners can update photos" on public.photos;
create policy "Both partners can update photos"
  on public.photos as permissive for update to public
  using (((uploaded_by = ( select auth.uid() as uid)) or (uploaded_by = ( select get_partner_id(( select auth.uid() as uid)) as get_partner_id))));

drop policy if exists "Users can delete own photos" on public.photos;
create policy "Users can delete own photos"
  on public.photos as permissive for delete to public
  using ((uploaded_by = ( select auth.uid() as uid)));

-- ── public.album_memories ──────────────────────────────────────────────────
drop policy if exists "album_memories authenticated select" on public.album_memories;
create policy "album_memories authenticated select"
  on public.album_memories as permissive for select to authenticated
  using ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null));

drop policy if exists "album_memories authenticated insert" on public.album_memories;
create policy "album_memories authenticated insert"
  on public.album_memories as permissive for insert to authenticated
  with check ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null));

drop policy if exists "album_memories authenticated update" on public.album_memories;
create policy "album_memories authenticated update"
  on public.album_memories as permissive for update to authenticated
  using ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null))
  with check ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null));

drop policy if exists "album_memories authenticated delete" on public.album_memories;
create policy "album_memories authenticated delete"
  on public.album_memories as permissive for delete to authenticated
  using ((( select get_partner_id(( select auth.uid() as uid)) as get_partner_id) is not null));

-- ── public.timeline_events ─────────────────────────────────────────────────
drop policy if exists "Both partners can view timeline" on public.timeline_events;
create policy "Both partners can view timeline"
  on public.timeline_events as permissive for select to public
  using (((created_by = ( select auth.uid() as uid)) or (created_by = ( select get_partner_id(( select auth.uid() as uid)) as get_partner_id))));

drop policy if exists "Users can create timeline events" on public.timeline_events;
create policy "Users can create timeline events"
  on public.timeline_events as permissive for insert to public
  with check ((created_by = ( select auth.uid() as uid)));

drop policy if exists "Both partners can update timeline" on public.timeline_events;
create policy "Both partners can update timeline"
  on public.timeline_events as permissive for update to public
  using (((created_by = ( select auth.uid() as uid)) or (created_by = ( select get_partner_id(( select auth.uid() as uid)) as get_partner_id))));

drop policy if exists "Creator can delete timeline events" on public.timeline_events;
create policy "Creator can delete timeline events"
  on public.timeline_events as permissive for delete to authenticated
  using ((created_by = ( select auth.uid() as uid)));


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Droits (pg_class.relacl traduit en GRANT)
-- Les six tables portaient `arwdDxtm` (= tous les privilèges de table) pour
-- les rôles listés. `postgres` est le propriétaire : ses droits sont
-- implicites, ils ne sont pas re-donnés ici.
-- À NOTER : `thoughts` et `timeline_events` accordaient encore tous les
-- droits à `anon` (rôle NON authentifié) — les quatre autres tables, non.
-- C'est l'état capturé, pas une recommandation : si ces tables devaient
-- revivre, les deux lignes `to anon` seraient à réexaminer.
-- ───────────────────────────────────────────────────────────────────────────

grant all on table public.thoughts        to anon, authenticated, service_role;
grant all on table public.streaks         to authenticated, service_role;
grant all on table public.photo_albums    to authenticated, service_role;
grant all on table public.photos          to authenticated, service_role;
grant all on table public.album_memories  to authenticated, service_role;
grant all on table public.timeline_events to anon, authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Trigger (pg_trigger / pg_get_triggerdef)
-- Un seul trigger utilisateur sur les six tables. La fonction
-- public.enforce_single_origin() N'EST PAS supprimée par la migration : elle
-- existe toujours, il suffit de rebrancher le trigger dessus.
-- ───────────────────────────────────────────────────────────────────────────

drop trigger if exists single_origin_trigger on public.album_memories;
create trigger single_origin_trigger
  before insert or update of is_origin on public.album_memories
  for each row execute function public.enforce_single_origin();


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 7 — Publication temps réel (pg_publication_tables)
-- Sur les six tables, SEULE `timeline_events` appartenait à la publication
-- `supabase_realtime`. Les cinq autres n'y étaient pas : ne rien ajouter pour
-- elles. REPLICA IDENTITY était partout la valeur par défaut ('d'), aucune
-- commande n'est donc nécessaire de ce côté.
-- ───────────────────────────────────────────────────────────────────────────

do $realtime$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'timeline_events'
  ) then
    alter publication supabase_realtime add table public.timeline_events;
  end if;
end
$realtime$;


-- ───────────────────────────────────────────────────────────────────────────
-- SECTION 8 — Bucket Storage `album-photos` et ses politiques
-- Le bucket contenait 0 fichier au moment de la capture. Il était PRIVÉ
-- (public = false), sans limite de taille ni restriction de type MIME, sans
-- propriétaire, de type STANDARD, créé le 2026-06-12 22:31:28.778624+00.
-- Ses trois politiques vivaient sur storage.objects et étaient bornées par
-- `bucket_id = 'album-photos'`. Elles ne concernent en RIEN le bucket
-- `vlogs`, dont les trois politiques homonymes restent en place.
-- ───────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types, avif_autodetection)
values ('album-photos', 'album-photos', false, null, null, false)
on conflict (id) do nothing;

drop policy if exists "album storage read" on storage.objects;
create policy "album storage read"
  on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'album-photos'::text) and (((storage.foldername(name))[1] = (auth.uid())::text) or ((storage.foldername(name))[1] = (get_partner_id(auth.uid()))::text))));

drop policy if exists "album storage insert" on storage.objects;
create policy "album storage insert"
  on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'album-photos'::text) and ((storage.foldername(name))[1] = (auth.uid())::text)));

drop policy if exists "album storage delete" on storage.objects;
create policy "album storage delete"
  on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'album-photos'::text) and ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN DU FILET DE SÉCURITÉ
-- ═══════════════════════════════════════════════════════════════════════════
