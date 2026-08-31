-- ═══════════════════════════════════════════════════════════════════════════
-- Point 18 de l'audit — « Nettoyer la suppression de compte (RGPD) »
--
-- CONSTAT
-- `public.delete_my_account()` (posée en 20260818120000) se contentait de :
--     1. `perform public.unlink_partner()`   → déliaison des deux profils
--     2. `delete from auth.users where id = my_uuid`
-- Les cascades FK font le reste côté `public` (profiles, vlogs, moods, taps,
-- thoughts, love_notes, capsules, gratitudes, locations, schedule_slots,
-- availability, calendar_events, countdowns, todo_lists, watch_items,
-- timeline_events, photos, photo_albums, question_answers, bucket_items…) et
-- côté `auth` (identities, sessions → refresh_tokens, mfa_*, one_time_tokens,
-- oauth_*, webauthn_*).
--
-- MAIS deux catégories de données personnelles SURVIVAIENT :
--
--   A. LE STOCKAGE. `storage.objects` n'a AUCUNE clé étrangère vers
--      `auth.users` (vérifié : seul `objects_bucketId_fkey` existe). Les vidéos
--      et photos du vlog — déposées sous `{auth.uid()}/{uuid}.{ext}` dans le
--      bucket privé `vlogs` (cf. VlogComposer.tsx et les policies Storage de
--      20260819120000) — restaient donc indéfiniment en base après un
--      « effacement définitif » promis à l'utilisateur. Même chose pour le
--      bucket `album-photos`, cloisonné sur le même modèle en 20260826152942.
--
--   B. `public.daily_questions`. C'est la seule table de `public` dont une
--      colonne uuid porteuse d'identité (`couple_id`) n'a pas de clé étrangère.
--      Les lignes clefées sur l'uuid du compte supprimé restaient orphelines.
--
-- CE QUE FAIT CETTE MIGRATION
-- Redéfinit `delete_my_account()` pour purger aussi A et B, sans jamais toucher
-- aux données du/de la partenaire. Aucun changement de schéma, aucune policy
-- modifiée. Idempotente et rejouable : `create or replace` + revoke/grant.
--
-- ⚠️ LIMITE CONNUE — À LIRE AVANT DE S'EN CONTENTER
-- Supprimer une ligne de `storage.objects` retire le fichier de l'API Storage
-- (plus aucun listing, plus aucune URL signée possible : il devient
-- inatteignable), mais NE SUPPRIME PAS le blob correspondant du magasin S3
-- sous-jacent. Une purge réellement complète des octets exige l'API Storage
-- (`storage.from(bucket).remove([...])`) — voir la note « côté client » en bas
-- de fichier. Cette migration est donc le meilleur effacement atteignable en
-- SQL seul, et une nette amélioration, pas une purge physique.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
-- search_path verrouillé, identique à la version précédente. Toutes les
-- références ci-dessous sont de toute façon qualifiées par leur schéma
-- (public., auth., storage.), et `pg_temp` est placé en dernier : un objet
-- temporaire créé par un appelant malveillant ne peut donc rien masquer.
set search_path = public, auth, pg_temp
as $$
declare
  -- SEULE source d'identité de toute la fonction. La fonction ne prend aucun
  -- paramètre et ne construit aucun SQL dynamique : il n'existe donc aucune
  -- surface permettant à un appel malveillant d'élargir la portée au-delà de
  -- son propre compte. Chaque DELETE ci-dessous est borné par `my_uuid`.
  my_uuid uuid := auth.uid();
  nb_objets    integer := 0;
  nb_multipart integer := 0;
  nb_questions integer := 0;
begin
  if my_uuid is null then
    raise exception 'Non authentifié';
  end if;

  -- ── 1. Déliaison ────────────────────────────────────────────────────────
  -- Remet `partner_id` à NULL des deux côtés. Fait en premier pour que le/la
  -- partenaire ne conserve aucun pointeur vers le compte en cours de
  -- suppression, même si une étape ultérieure échouait.
  perform public.unlink_partner();

  -- ── 2. Purge du stockage (le correctif de ce point d'audit) ─────────────
  -- Storage protège ses tables par un trigger `protect_objects_delete`
  -- (BEFORE DELETE FOR EACH STATEMENT → storage.protect_delete()) qui lève
  -- « Direct deletion from storage tables is not allowed » sauf si le
  -- paramètre `storage.allow_delete_query` vaut 'true'. Sans cette ligne, la
  -- fonction échouerait et la suppression de compte entière serait annulée.
  -- `is_local => true` : le réglage est LOCAL À LA TRANSACTION, il disparaît au
  -- COMMIT comme au ROLLBACK et ne peut pas fuiter vers d'autres requêtes.
  perform set_config('storage.allow_delete_query', 'true', true);

  -- Les deux buckets du projet (`vlogs`, `album-photos`) rangent les fichiers
  -- sous `{user_id}/…` et leurs policies d'INSERT imposent
  -- `(storage.foldername(name))[1] = auth.uid()::text`. On ne filtre
  -- volontairement PAS sur `bucket_id` : tout bucket ajouté plus tard sera
  -- couvert automatiquement.
  -- Double critère (ceinture + bretelles), les deux strictement bornés à
  -- `my_uuid` : `owner` couvre les dépôts faits hors convention de chemin, le
  -- préfixe de dossier couvre les lignes dont `owner` serait NULL (import,
  -- service_role…). Aucun des deux ne peut désigner un fichier du/de la
  -- partenaire : la policy d'INSERT interdit d'écrire dans le dossier d'autrui.
  delete from storage.objects o
   where o.owner = my_uuid
      or (storage.foldername(o.name))[1] = my_uuid::text;
  get diagnostics nb_objets = row_count;

  -- Téléversements multipart interrompus : ils portent des octets déjà envoyés
  -- et ne sont rattachés à rien d'autre. `..._parts` cascade depuis
  -- `s3_multipart_uploads` (FK ON DELETE CASCADE), on le nettoie tout de même
  -- explicitement au cas où des parts subsisteraient sans en-tête.
  delete from storage.s3_multipart_uploads where owner_id = my_uuid::text;
  get diagnostics nb_multipart = row_count;
  delete from storage.s3_multipart_uploads_parts where owner_id = my_uuid::text;

  -- Refermer la garde immédiatement : plus rien ne doit pouvoir supprimer dans
  -- Storage après ce point, même en cas d'évolution de la fonction.
  perform set_config('storage.allow_delete_query', 'false', true);

  -- ── 3. Questions du jour clefées sur mon uuid ───────────────────────────
  -- `daily_questions.couple_id` = `public.get_couple_id()` = `least(id,
  -- partner_id)`, sans clé étrangère : rien ne nettoie ces lignes.
  -- On ne supprime QUE celles portant mon propre uuid. Deux cas :
  --   * mon uuid était le plus petit du couple → après ma suppression le/la
  --     partenaire reprend son uuid comme couple_id et ne pourrait de toute
  --     façon plus jamais lire ces lignes (RLS `couple_id = get_couple_id()`) :
  --     ce sont des orphelines, portant mon identifiant. On les efface.
  --   * l'uuid du/de la partenaire était le plus petit → les lignes portent SON
  --     uuid, restent lisibles par elle/lui : ce sont SES données, on n'y
  --     touche pas. La condition `couple_id = my_uuid` les exclut d'office.
  -- ATTENTION : `question_answers.question_id` est en ON DELETE CASCADE vers
  -- `daily_questions`. Supprimer une question emporte donc AUSSI les réponses
  -- du/de la partenaire, qui garde pourtant son compte. On ne supprime donc
  -- qu'une question sur laquelle il/elle n'a rien écrit. Mes propres réponses
  -- partent de toute façon par cascade depuis `auth.users` (étape 4).
  -- Compromis assumé : les questions conservées gardent mon uuid en
  -- `couple_id`, mais cet uuid ne sera plus rattachable à personne une fois
  -- `auth.users` purgé — préférable à détruire les souvenirs du/de la
  -- partenaire.
  delete from public.daily_questions dq
   where dq.couple_id = my_uuid
     and not exists (
       select 1
         from public.question_answers qa
        where qa.question_id = dq.id
          and qa.user_id <> my_uuid
     );
  get diagnostics nb_questions = row_count;

  -- ── 4. Le compte lui-même ───────────────────────────────────────────────
  -- En dernier : tant qu'il existe, un échec d'une étape ci-dessus annule tout
  -- (la fonction est atomique) et laisse un compte réessayable, plutôt qu'un
  -- compte supprimé dont les fichiers auraient survécu.
  -- Déclenche les cascades `public` (profiles → toutes les tables du couple)
  -- et `auth` (sessions, identities, tokens…).
  delete from auth.users where id = my_uuid;

  -- Trace d'audit RGPD : uniquement des compteurs, jamais d'identifiant.
  raise notice 'Suppression de compte : % objet(s) Storage, % téléversement(s) multipart, % question(s) du jour purgé(e)s.',
    nb_objets, nb_multipart, nb_questions;
end;
$$;

comment on function public.delete_my_account() is
  'Efface définitivement le compte de auth.uid() : déliaison, purge du stockage '
  '(storage.objects + multipart, tous buckets, bornée au seul appelant), purge '
  'des daily_questions clefées sur son uuid, puis suppression de auth.users qui '
  'cascade sur tout le reste. Ne touche jamais aux données du/de la partenaire. '
  'Limite : les blobs S3 sous-jacents ne sont pas supprimés par SQL (voir la '
  'migration 20260828144500).';

-- ── Droits d'exécution ────────────────────────────────────────────────────
-- Même schéma que 20260818120000 et 20260826153500 : jamais `public` ni `anon`,
-- uniquement `authenticated`. `create or replace` conserve l'ACL existante, on
-- la réaffirme quand même pour que la migration soit autoportante et rejouable.
revoke execute on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant  execute on function public.delete_my_account() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- RESTE À FAIRE CÔTÉ CLIENT (hors périmètre de cette migration)
--
-- Pour que les octets eux-mêmes disparaissent du magasin S3, `deleteAccount()`
-- (src/stores/authStore.ts) devrait, AVANT d'appeler le RPC, lister ses vlogs
-- et faire un `supabase.storage.from('vlogs').remove(paths)` — l'appel existe
-- déjà pour la suppression unitaire dans VlogFeed.tsx. La purge SQL ci-dessus
-- reste indispensable comme filet : elle garantit qu'aucune ligne ne survit
-- même si l'appel client échoue ou est contourné.
--
-- Alternative plus robuste : une Edge Function en service_role qui appelle
-- l'API Storage puis le RPC.
-- ═══════════════════════════════════════════════════════════════════════════
