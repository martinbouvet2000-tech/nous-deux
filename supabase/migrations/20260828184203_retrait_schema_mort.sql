-- ═══════════════════════════════════════════════════════════════════════════
-- RETRAIT DU SCHÉMA MORT
--
-- Six tables du schéma `public` et un bucket Storage sont des vestiges de
-- fonctionnalités abandonnées ou jamais construites. Toutes sont vides et plus
-- aucune ligne de `src/` ne les interroge. Cette migration les retire.
--
-- FILET DE SÉCURITÉ : la définition complète de tout ce qui est supprimé ici
-- (colonnes, contraintes, index, RLS, politiques, droits, trigger,
-- publication temps réel, bucket) est conservée dans
--     supabase/rollback/20260828_avant_retrait_schema_mort.sql
-- Le rejouer reconstruit l'ensemble à l'identique. Comme tout était vide,
-- il n'y a aucune donnée à restaurer, seulement des définitions.
--
-- HORS PÉRIMÈTRE, ET QUI LE RESTE : `public.vlogs` et le bucket `vlogs`
-- contiennent les souvenirs du couple. Ce sont des objets DIFFÉRENTS de ceux
-- traités ici et aucune instruction de ce fichier ne les nomme. Idem pour
-- `public.profiles`, `public.enforce_single_origin()` (qui survit, orpheline)
-- et toute autre table non listée.
--
-- IDEMPOTENCE : la migration est rejouable. Si tout a déjà disparu, elle ne
-- fait rien et ne lève aucune erreur.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- GARDE-FOU 1 — aucune des six tables ne doit contenir la moindre ligne
--
-- Raison d'être : si cette migration est rejouée tardivement, après que
-- quelqu'un ait recommencé à utiliser une de ces tables, elle doit REFUSER de
-- s'exécuter plutôt que de détruire son contenu. L'exception annule la
-- transaction entière : aucune suppression n'a alors lieu, ni ici ni plus bas.
-- Les tables déjà disparues sont ignorées (c'est ce qui rend le rejeu propre).
-- ───────────────────────────────────────────────────────────────────────────
do $garde_lignes$
declare
  nom_table text;
  nb        bigint;
  detail    text := '';
begin
  foreach nom_table in array array[
    'thoughts', 'streaks', 'photos', 'photo_albums', 'album_memories', 'timeline_events'
  ]
  loop
    if to_regclass(format('public.%I', nom_table)) is not null then
      execute format('select count(*) from public.%I', nom_table) into nb;
      if nb > 0 then
        detail := detail || format('%s : %s ligne(s) ; ', nom_table, nb);
      end if;
    end if;
  end loop;

  if detail <> '' then
    raise exception
      'ARRÊT : une ou plusieurs tables du « schéma mort » ne sont plus vides (%). Aucune suppression n''a été effectuée. Vérifier si la fonctionnalité a été reprise avant de rejouer cette migration.',
      detail;
  end if;
end
$garde_lignes$;


-- ───────────────────────────────────────────────────────────────────────────
-- GARDE-FOU 2 — aucune table VIVANTE ne doit dépendre des six par clé étrangère
--
-- Vérifié en SELECT avant écriture de cette migration : aucune dépendance de
-- ce type n'existe (les seules clés étrangères entrantes viennent des six
-- tables entre elles, d'où le `cascade` plus bas, qui ne peut donc emporter
-- qu'elles). Le contrôle est refait ici à l'exécution : si une table extérieure
-- venait à pointer vers l'une d'elles, la migration s'arrête au lieu de forcer.
-- ───────────────────────────────────────────────────────────────────────────
do $garde_dependances$
declare
  mortes text[] := array[
    'thoughts', 'streaks', 'photos', 'photo_albums', 'album_memories', 'timeline_events'
  ];
  liste  text;
begin
  select string_agg(
           format('%s.%s.%s → %s', ns_source.nspname, tbl_source.relname, con.conname, cible.relname),
           ' ; '
         )
    into liste
    from pg_constraint con
    join pg_class     tbl_source     on tbl_source.oid = con.conrelid
    join pg_namespace ns_source  on ns_source.oid = tbl_source.relnamespace
    join pg_class     cible      on cible.oid = con.confrelid
    join pg_namespace ns_cible   on ns_cible.oid = cible.relnamespace
   where con.contype = 'f'
     and ns_cible.nspname = 'public'
     and cible.relname = any (mortes)
     and not (ns_source.nspname = 'public' and tbl_source.relname = any (mortes));

  if liste is not null then
    raise exception
      'ARRÊT : des tables encore vivantes dépendent du schéma mort par clé étrangère (%). Aucune suppression n''a été effectuée : traiter ces dépendances à la main plutôt que de forcer le cascade.',
      liste;
  end if;
end
$garde_dependances$;


-- ───────────────────────────────────────────────────────────────────────────
-- SUPPRESSION DES SIX TABLES
--
-- `cascade` ne peut emporter, d'après le garde-fou 2, que des objets
-- appartenant aux six tables elles-mêmes : leurs index, leurs contraintes,
-- leurs politiques RLS, le trigger `single_origin_trigger` d'album_memories et
-- l'appartenance de `timeline_events` à la publication `supabase_realtime`.
-- L'ordre suit les clés étrangères internes (photos avant photo_albums), ce
-- qui rend le cascade inutile dans les faits — il n'est là qu'en dernier
-- recours.
-- ───────────────────────────────────────────────────────────────────────────

-- Ancienne fonctionnalité « Pensées » (messages courts entre partenaires),
-- retirée de l'application ; la route /thoughts redirige vers /memories.
drop table if exists public.thoughts cascade;

-- Compteur de « séries » de jours consécutifs : jamais branché à l'interface.
drop table if exists public.streaks cascade;

-- Album photo jamais construit : les clichés…
drop table if exists public.photos cascade;

-- …leurs albums (référencés par public.photos, supprimée juste avant)…
drop table if exists public.photo_albums cascade;

-- …et les souvenirs « punaisés » de la même fonctionnalité mort-née.
drop table if exists public.album_memories cascade;

-- Onglet « Notre histoire » : les étapes datées du couple. L'onglet a été
-- fondu dans le vlog, la table est restée vide. C'était aussi la seule des six
-- publiée en temps réel (supabase_realtime) ; le DROP l'en retire de lui-même.
drop table if exists public.timeline_events cascade;


-- ───────────────────────────────────────────────────────────────────────────
-- SUPPRESSION DU BUCKET STORAGE `album-photos`
--
-- Bucket privé de l'album photo jamais construit, vide (0 fichier). Il était
-- le point critique n° 1 de l'audit de sécurité. Ses trois politiques vivent
-- sur `storage.objects` et sont toutes bornées par
-- `bucket_id = 'album-photos'` : les retirer ne touche en rien les trois
-- politiques homonymes du bucket `vlogs`, qui restent intactes.
-- ───────────────────────────────────────────────────────────────────────────

drop policy if exists "album storage read"   on storage.objects;
drop policy if exists "album storage insert" on storage.objects;
drop policy if exists "album storage delete" on storage.objects;

do $bucket_album$
declare
  nb_fichiers bigint;
begin
  if not exists (select 1 from storage.buckets where id = 'album-photos') then
    return;  -- déjà supprimé : rejeu sans effet
  end if;

  -- Ceinture et bretelles : on ne supprime un bucket que s'il est vide. Un
  -- bucket contenant des fichiers signalerait qu'il a resservi depuis l'audit.
  select count(*) into nb_fichiers from storage.objects where bucket_id = 'album-photos';
  if nb_fichiers > 0 then
    raise exception
      'ARRÊT : le bucket album-photos contient % fichier(s). Aucune suppression n''a été effectuée.',
      nb_fichiers;
  end if;

  -- Storage protège ses tables par un trigger `protect_buckets_delete`
  -- (BEFORE DELETE FOR EACH STATEMENT → storage.protect_delete()) qui lève
  -- « Direct deletion from storage tables is not allowed » tant que le
  -- paramètre `storage.allow_delete_query` ne vaut pas 'true'. Il n'existe pas
  -- d'instruction SQL « drop bucket » : retirer la ligne de storage.buckets
  -- EST la suppression du bucket. `is_local => true` : le réglage ne vit que
  -- le temps de la transaction et disparaît au COMMIT comme au ROLLBACK.
  perform set_config('storage.allow_delete_query', 'true', true);

  delete from storage.buckets where id = 'album-photos';

  -- Refermer la garde immédiatement.
  perform set_config('storage.allow_delete_query', 'false', true);
end
$bucket_album$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN DU RETRAIT DU SCHÉMA MORT
-- ═══════════════════════════════════════════════════════════════════════════
