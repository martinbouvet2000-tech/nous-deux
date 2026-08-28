-- ═══════════════════════════════════════════════════════════════════════════
-- FILET DE SÉCURITÉ — état de la base AVANT les migrations du 28/08/2026
--
-- Projet Supabase : hfukmrrinibsdrrevahs (« nous-deux », production)
-- Capturé le      : 2026-08-28, par lecture seule de pg_policies, pg_indexes,
--                   pg_proc, pg_class et pg_publication_tables.
--
-- À QUOI SERT CE FICHIER
-- Il photographie l'état exact des objets que les trois migrations suivantes
-- s'apprêtent à modifier :
--     20260828144500_purge_stockage_suppression_compte.sql
--     20260828143000_perf_index_et_rls.sql
--     20260828110130_ajout_realtime_gratitudes_bucket.sql
-- Rejouer ce fichier restaure ces objets tels qu'ils étaient. C'est la seule
-- assurance en cas de problème : il n'existe pas d'autre sauvegarde de ces
-- définitions.
--
-- COMMENT S'EN SERVIR
-- 1. Le rejeu se fait via l'outil MCP `apply_migration` (ou psql en
--    service_role) sur le MÊME projet. Ne jamais passer par `supabase db push`
--    (l'historique local ne coïncide pas avec l'historique distant).
-- 2. Les sections sont indépendantes : on peut n'en rejouer qu'une.
--      • Section 1 : les 84 politiques RLS du schéma `public`, chacune sous la
--        forme `drop policy if exists … ; create policy … ;`. Rejouer la
--        section entière ramène exactement les 84 politiques d'origine (celles
--        écrites en `auth.uid()` nu, avant la réécriture en
--        `(select auth.uid())`). Intégrité vérifiée : md5 du bloc =
--        5c401308dac3219e88880d2f3dffdfb0.
--      • Section 2 : recrée les 3 index dupliqués supprimés par la migration
--        de perf. Leurs jumeaux (calendar_events_start_idx,
--        moods_user_created_idx, thoughts_receiver_created_idx) n'étant pas
--        touchés, cette section n'est utile que pour un retour à l'identique.
--      • Section 3 : la définition d'origine de `public.delete_my_account()`
--        (version courte de 20260818120000, sans purge du stockage). La
--        rejouer ANNULE le correctif RGPD. Les droits d'exécution d'origine
--        sont rappelés en 3bis à titre informatif.
--      • Section 4 : remet `gratitudes` et `bucket_items` en REPLICA IDENTITY
--        DEFAULT.
--      • Section 5 : liste informative des tables déjà publiées dans
--        `supabase_realtime` au moment de la capture. À noter : `gratitudes`
--        et `bucket_items` y figuraient DÉJÀ ; la migration realtime ne fait
--        donc que changer leur REPLICA IDENTITY. Aucun `alter publication …
--        drop table` n'est proposé ici, retirer une table de la publication
--        casserait le temps réel côté client.
-- 3. Rien dans ce fichier ne touche aux DONNÉES : aucun insert, update ou
--    delete. Seules des définitions d'objets sont recréées.
--
-- ⚠️ Ce fichier reflète l'état AU MOMENT DE LA CAPTURE. Si la base a changé
--    depuis, refaire une capture avant de s'en servir.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Les 84 politiques RLS du schéma public (état d'origine) ────────────
-- 83 d'entre elles utilisent `auth.uid()` non enveloppé ; la 84e
-- (« Everyone can read question bank ») est en `using (true)` et n'est pas
-- modifiée par la migration de perf.

drop policy if exists "album_memories authenticated delete" on public.album_memories;
create policy "album_memories authenticated delete" on public.album_memories as permissive for delete to authenticated
  using ((get_partner_id(auth.uid()) IS NOT NULL));

drop policy if exists "album_memories authenticated insert" on public.album_memories;
create policy "album_memories authenticated insert" on public.album_memories as permissive for insert to authenticated
  with check ((get_partner_id(auth.uid()) IS NOT NULL));

drop policy if exists "album_memories authenticated select" on public.album_memories;
create policy "album_memories authenticated select" on public.album_memories as permissive for select to authenticated
  using ((get_partner_id(auth.uid()) IS NOT NULL));

drop policy if exists "album_memories authenticated update" on public.album_memories;
create policy "album_memories authenticated update" on public.album_memories as permissive for update to authenticated
  using ((get_partner_id(auth.uid()) IS NOT NULL))
  with check ((get_partner_id(auth.uid()) IS NOT NULL));

drop policy if exists "availability select partners" on public.availability;
create policy "availability select partners" on public.availability as permissive for select to authenticated
  using (((user_id = auth.uid()) OR (user_id = get_partner_id(auth.uid()))));

drop policy if exists "availability update own" on public.availability;
create policy "availability update own" on public.availability as permissive for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "availability upsert own" on public.availability;
create policy "availability upsert own" on public.availability as permissive for insert to authenticated
  with check ((user_id = auth.uid()));

drop policy if exists "Users can delete own bucket items" on public.bucket_items;
create policy "Users can delete own bucket items" on public.bucket_items as permissive for delete to public
  using ((created_by = auth.uid()));

drop policy if exists "Users can insert bucket items" on public.bucket_items;
create policy "Users can insert bucket items" on public.bucket_items as permissive for insert to public
  with check ((created_by = auth.uid()));

drop policy if exists "Users can update bucket items" on public.bucket_items;
create policy "Users can update bucket items" on public.bucket_items as permissive for update to public
  using (((created_by = auth.uid()) OR (created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.partner_id = auth.uid()))) OR (created_by IN ( SELECT profiles.partner_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

drop policy if exists "Users can view couple bucket items" on public.bucket_items;
create policy "Users can view couple bucket items" on public.bucket_items as permissive for select to public
  using (((created_by = auth.uid()) OR (created_by IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.partner_id = auth.uid()))) OR (created_by IN ( SELECT profiles.partner_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));

drop policy if exists "Both partners can delete events" on public.calendar_events;
create policy "Both partners can delete events" on public.calendar_events as permissive for delete to authenticated
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Both partners can view events" on public.calendar_events;
create policy "Both partners can view events" on public.calendar_events as permissive for select to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Users can create events" on public.calendar_events;
create policy "Users can create events" on public.calendar_events as permissive for insert to public
  with check ((created_by = auth.uid()));

drop policy if exists "Users can update events" on public.calendar_events;
create policy "Users can update events" on public.calendar_events as permissive for update to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Receiver can open capsule" on public.capsules;
create policy "Receiver can open capsule" on public.capsules as permissive for update to authenticated
  using (((receiver_id = auth.uid()) AND (reveal_date <= CURRENT_DATE)))
  with check (((receiver_id = auth.uid()) AND (reveal_date <= CURRENT_DATE)));

drop policy if exists "Sender can delete unopened capsule" on public.capsules;
create policy "Sender can delete unopened capsule" on public.capsules as permissive for delete to authenticated
  using (((sender_id = auth.uid()) AND (is_opened = false)));

drop policy if exists "Users can create capsules" on public.capsules;
create policy "Users can create capsules" on public.capsules as permissive for insert to public
  with check (((sender_id = auth.uid()) AND (receiver_id = get_partner_id(auth.uid()))));

drop policy if exists "Users can view own capsules when revealed" on public.capsules;
create policy "Users can view own capsules when revealed" on public.capsules as permissive for select to public
  using (((sender_id = auth.uid()) OR ((receiver_id = auth.uid()) AND (reveal_date <= CURRENT_DATE))));

drop policy if exists "Both partners can view countdowns" on public.countdowns;
create policy "Both partners can view countdowns" on public.countdowns as permissive for select to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Users can create countdowns" on public.countdowns;
create policy "Users can create countdowns" on public.countdowns as permissive for insert to public
  with check ((created_by = auth.uid()));

drop policy if exists "Users can delete own countdowns" on public.countdowns;
create policy "Users can delete own countdowns" on public.countdowns as permissive for delete to public
  using ((created_by = auth.uid()));

drop policy if exists "Users can update own countdowns" on public.countdowns;
create policy "Users can update own countdowns" on public.countdowns as permissive for update to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "daily_questions couple select" on public.daily_questions;
create policy "daily_questions couple select" on public.daily_questions as permissive for select to authenticated
  using ((couple_id = get_couple_id(auth.uid())));

drop policy if exists "Both partners can view gratitudes" on public.gratitudes;
create policy "Both partners can view gratitudes" on public.gratitudes as permissive for select to public
  using (((user_id = auth.uid()) OR (user_id = get_partner_id(auth.uid()))));

drop policy if exists "Users can delete own gratitudes" on public.gratitudes;
create policy "Users can delete own gratitudes" on public.gratitudes as permissive for delete to authenticated
  using ((user_id = auth.uid()));

drop policy if exists "Users can insert own gratitudes" on public.gratitudes;
create policy "Users can insert own gratitudes" on public.gratitudes as permissive for insert to public
  with check ((user_id = auth.uid()));

drop policy if exists "Users can update own gratitudes" on public.gratitudes;
create policy "Users can update own gratitudes" on public.gratitudes as permissive for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "locations delete own" on public.locations;
create policy "locations delete own" on public.locations as permissive for delete to authenticated
  using ((user_id = auth.uid()));

drop policy if exists "locations insert own" on public.locations;
create policy "locations insert own" on public.locations as permissive for insert to authenticated
  with check ((user_id = auth.uid()));

drop policy if exists "locations select partners" on public.locations;
create policy "locations select partners" on public.locations as permissive for select to authenticated
  using (((user_id = auth.uid()) OR ((user_id = get_partner_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = locations.user_id) AND p.share_location))))));

drop policy if exists "Users can insert love notes for their partner" on public.love_notes;
create policy "Users can insert love notes for their partner" on public.love_notes as permissive for insert to authenticated
  with check (((sender_id = auth.uid()) AND (receiver_id = get_partner_id(auth.uid()))));

drop policy if exists "Users can update their own love notes" on public.love_notes;
create policy "Users can update their own love notes" on public.love_notes as permissive for update to authenticated
  using ((sender_id = auth.uid()))
  with check ((sender_id = auth.uid()));

drop policy if exists "Users can view their own love notes" on public.love_notes;
create policy "Users can view their own love notes" on public.love_notes as permissive for select to public
  using (((sender_id = auth.uid()) OR (receiver_id = auth.uid())));

drop policy if exists "Users can delete own moods" on public.moods;
create policy "Users can delete own moods" on public.moods as permissive for delete to public
  using ((user_id = auth.uid()));

drop policy if exists "Users can insert own moods" on public.moods;
create policy "Users can insert own moods" on public.moods as permissive for insert to public
  with check ((user_id = auth.uid()));

drop policy if exists "Users can view own and partner moods" on public.moods;
create policy "Users can view own and partner moods" on public.moods as permissive for select to public
  using (((user_id = auth.uid()) OR (user_id = get_partner_id(auth.uid()))));

drop policy if exists "Both partners can update albums" on public.photo_albums;
create policy "Both partners can update albums" on public.photo_albums as permissive for update to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Both partners can view albums" on public.photo_albums;
create policy "Both partners can view albums" on public.photo_albums as permissive for select to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Users can create albums" on public.photo_albums;
create policy "Users can create albums" on public.photo_albums as permissive for insert to public
  with check ((created_by = auth.uid()));

drop policy if exists "Both partners can update photos" on public.photos;
create policy "Both partners can update photos" on public.photos as permissive for update to public
  using (((uploaded_by = auth.uid()) OR (uploaded_by = get_partner_id(auth.uid()))));

drop policy if exists "Both partners can view photos" on public.photos;
create policy "Both partners can view photos" on public.photos as permissive for select to public
  using (((uploaded_by = auth.uid()) OR (uploaded_by = get_partner_id(auth.uid()))));

drop policy if exists "Users can delete own photos" on public.photos;
create policy "Users can delete own photos" on public.photos as permissive for delete to public
  using ((uploaded_by = auth.uid()));

drop policy if exists "Users can upload photos" on public.photos;
create policy "Users can upload photos" on public.photos as permissive for insert to public
  with check ((uploaded_by = auth.uid()));

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles as permissive for insert to public
  with check ((id = auth.uid()));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles as permissive for update to public
  using ((id = auth.uid()));

drop policy if exists "Users can view own and partner profile" on public.profiles;
create policy "Users can view own and partner profile" on public.profiles as permissive for select to public
  using (((id = auth.uid()) OR (id = get_partner_id(auth.uid()))));

drop policy if exists question_answers_delete on public.question_answers;
create policy question_answers_delete on public.question_answers as permissive for delete to authenticated
  using ((auth.uid() = user_id));

drop policy if exists question_answers_insert on public.question_answers;
create policy question_answers_insert on public.question_answers as permissive for insert to authenticated
  with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM daily_questions d
  WHERE ((d.id = question_answers.question_id) AND (d.couple_id = get_couple_id(auth.uid())))))));

drop policy if exists question_answers_select on public.question_answers;
create policy question_answers_select on public.question_answers as permissive for select to authenticated
  using (((user_id = auth.uid()) OR ((user_id = get_partner_id(auth.uid())) AND has_answered(question_id, auth.uid()))));

drop policy if exists question_answers_update on public.question_answers;
create policy question_answers_update on public.question_answers as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "Everyone can read question bank" on public.question_bank;
create policy "Everyone can read question bank" on public.question_bank as permissive for select to public
  using (true);

drop policy if exists "schedule delete own" on public.schedule_slots;
create policy "schedule delete own" on public.schedule_slots as permissive for delete to authenticated
  using ((user_id = auth.uid()));

drop policy if exists "schedule insert own" on public.schedule_slots;
create policy "schedule insert own" on public.schedule_slots as permissive for insert to authenticated
  with check ((user_id = auth.uid()));

drop policy if exists "schedule select partners" on public.schedule_slots;
create policy "schedule select partners" on public.schedule_slots as permissive for select to authenticated
  using (((user_id = auth.uid()) OR (user_id = get_partner_id(auth.uid()))));

drop policy if exists "schedule update own" on public.schedule_slots;
create policy "schedule update own" on public.schedule_slots as permissive for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

drop policy if exists "streaks authenticated insert" on public.streaks;
create policy "streaks authenticated insert" on public.streaks as permissive for insert to authenticated
  with check ((get_partner_id(auth.uid()) IS NOT NULL));

drop policy if exists "streaks authenticated select" on public.streaks;
create policy "streaks authenticated select" on public.streaks as permissive for select to authenticated
  using ((get_partner_id(auth.uid()) IS NOT NULL));

drop policy if exists "streaks authenticated update" on public.streaks;
create policy "streaks authenticated update" on public.streaks as permissive for update to authenticated
  using ((get_partner_id(auth.uid()) IS NOT NULL))
  with check ((get_partner_id(auth.uid()) IS NOT NULL));

drop policy if exists "Users can send taps" on public.taps;
create policy "Users can send taps" on public.taps as permissive for insert to public
  with check (((sender_id = auth.uid()) AND (receiver_id = get_partner_id(auth.uid()))));

drop policy if exists "Users can view sent and received taps" on public.taps;
create policy "Users can view sent and received taps" on public.taps as permissive for select to public
  using (((sender_id = auth.uid()) OR (receiver_id = auth.uid())));

drop policy if exists "Receiver can mark thoughts as read" on public.thoughts;
create policy "Receiver can mark thoughts as read" on public.thoughts as permissive for update to public
  using ((receiver_id = auth.uid()));

drop policy if exists "Users can send thoughts to partner" on public.thoughts;
create policy "Users can send thoughts to partner" on public.thoughts as permissive for insert to public
  with check (((sender_id = auth.uid()) AND (receiver_id = get_partner_id(auth.uid()))));

drop policy if exists "Users can view sent and received thoughts" on public.thoughts;
create policy "Users can view sent and received thoughts" on public.thoughts as permissive for select to public
  using (((sender_id = auth.uid()) OR (receiver_id = auth.uid())));

drop policy if exists "Both partners can update timeline" on public.timeline_events;
create policy "Both partners can update timeline" on public.timeline_events as permissive for update to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Both partners can view timeline" on public.timeline_events;
create policy "Both partners can view timeline" on public.timeline_events as permissive for select to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Creator can delete timeline events" on public.timeline_events;
create policy "Creator can delete timeline events" on public.timeline_events as permissive for delete to authenticated
  using ((created_by = auth.uid()));

drop policy if exists "Users can create timeline events" on public.timeline_events;
create policy "Users can create timeline events" on public.timeline_events as permissive for insert to public
  with check ((created_by = auth.uid()));

drop policy if exists "Both partners can create todo items" on public.todo_items;
create policy "Both partners can create todo items" on public.todo_items as permissive for insert to public
  with check ((list_id IN ( SELECT todo_lists.id
   FROM todo_lists
  WHERE ((todo_lists.created_by = auth.uid()) OR (todo_lists.created_by = get_partner_id(auth.uid()))))));

drop policy if exists "Both partners can delete todo items" on public.todo_items;
create policy "Both partners can delete todo items" on public.todo_items as permissive for delete to public
  using ((list_id IN ( SELECT todo_lists.id
   FROM todo_lists
  WHERE ((todo_lists.created_by = auth.uid()) OR (todo_lists.created_by = get_partner_id(auth.uid()))))));

drop policy if exists "Both partners can update todo items" on public.todo_items;
create policy "Both partners can update todo items" on public.todo_items as permissive for update to public
  using ((list_id IN ( SELECT todo_lists.id
   FROM todo_lists
  WHERE ((todo_lists.created_by = auth.uid()) OR (todo_lists.created_by = get_partner_id(auth.uid()))))));

drop policy if exists "Both partners can view todo items" on public.todo_items;
create policy "Both partners can view todo items" on public.todo_items as permissive for select to public
  using ((list_id IN ( SELECT todo_lists.id
   FROM todo_lists
  WHERE ((todo_lists.created_by = auth.uid()) OR (todo_lists.created_by = get_partner_id(auth.uid()))))));

drop policy if exists "Both partners can update todo lists" on public.todo_lists;
create policy "Both partners can update todo lists" on public.todo_lists as permissive for update to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Both partners can view todo lists" on public.todo_lists;
create policy "Both partners can view todo lists" on public.todo_lists as permissive for select to public
  using (((created_by = auth.uid()) OR (created_by = get_partner_id(auth.uid()))));

drop policy if exists "Users can create todo lists" on public.todo_lists;
create policy "Users can create todo lists" on public.todo_lists as permissive for insert to public
  with check ((created_by = auth.uid()));

drop policy if exists "Users can delete own todo lists" on public.todo_lists;
create policy "Users can delete own todo lists" on public.todo_lists as permissive for delete to public
  using ((created_by = auth.uid()));

drop policy if exists "vlogs delete own" on public.vlogs;
create policy "vlogs delete own" on public.vlogs as permissive for delete to authenticated
  using ((author_id = auth.uid()));

drop policy if exists "vlogs insert own" on public.vlogs;
create policy "vlogs insert own" on public.vlogs as permissive for insert to authenticated
  with check ((author_id = auth.uid()));

drop policy if exists "vlogs select partners" on public.vlogs;
create policy "vlogs select partners" on public.vlogs as permissive for select to authenticated
  using (((author_id = auth.uid()) OR (author_id = get_partner_id(auth.uid()))));

drop policy if exists "vlogs update own" on public.vlogs;
create policy "vlogs update own" on public.vlogs as permissive for update to authenticated
  using ((author_id = auth.uid()))
  with check ((author_id = auth.uid()));

drop policy if exists "Both partners can update watch items" on public.watch_items;
create policy "Both partners can update watch items" on public.watch_items as permissive for update to public
  using (((added_by = auth.uid()) OR (added_by = get_partner_id(auth.uid()))));

drop policy if exists "Both partners can view watch items" on public.watch_items;
create policy "Both partners can view watch items" on public.watch_items as permissive for select to public
  using (((added_by = auth.uid()) OR (added_by = get_partner_id(auth.uid()))));

drop policy if exists "Users can add watch items" on public.watch_items;
create policy "Users can add watch items" on public.watch_items as permissive for insert to public
  with check ((added_by = auth.uid()));

drop policy if exists "Users can delete own watch items" on public.watch_items;
create policy "Users can delete own watch items" on public.watch_items as permissive for delete to public
  using ((added_by = auth.uid()));

-- ─── 2. Les 3 index dupliqués supprimés par 20260828143000 ────────────────
CREATE INDEX idx_calendar_events_date ON public.calendar_events USING btree (start_at);
CREATE INDEX idx_moods_user_date ON public.moods USING btree (user_id, created_at DESC);
CREATE INDEX idx_thoughts_receiver ON public.thoughts USING btree (receiver_id, created_at DESC);

-- ─── 3. Définition actuelle de public.delete_my_account() ────────────────
CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  my_uuid uuid := auth.uid();
begin
  if my_uuid is null then raise exception 'Non authentifié'; end if;
  perform public.unlink_partner();
  delete from auth.users where id = my_uuid;
end;
$function$
;

-- ─── 3bis. Droits d'exécution actuels sur delete_my_account() ───────────
-- proacl = postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres

-- ─── 4. REPLICA IDENTITY actuelle (d = default = clé primaire) ──────────
alter table public.bucket_items replica identity default;
alter table public.gratitudes replica identity default;

-- ─── 5. Tables de la publication supabase_realtime (état actuel) ────────
--   public.availability
--   public.bucket_items
--   public.calendar_events
--   public.capsules
--   public.countdowns
--   public.gratitudes
--   public.locations
--   public.love_notes
--   public.moods
--   public.question_answers
--   public.schedule_slots
--   public.taps
--   public.timeline_events
--   public.todo_items
--   public.todo_lists
--   public.vlogs
--   public.watch_items
