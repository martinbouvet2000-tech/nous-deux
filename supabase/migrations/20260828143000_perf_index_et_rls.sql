-- ═══════════════════════════════════════════════════════════════════════════
-- Point 20 de l'audit — « Perf base ». Réponse aux avis de performance Supabase.
--
-- CONTEXTE MESURÉ AVANT ÉCRITURE (SELECT seuls, aucune écriture) :
--   Table la plus grosse de la base : `moods` = 44 lignes. Puis `taps` = 27,
--   `daily_questions` = 11, `vlogs` = 9. Toutes les autres : 0 à 5 lignes.
--   Aucune table ne dépasse 72 kB au total (index compris) : chacune tient dans
--   une ou deux pages heap. Un seq scan y coûte UNE lecture de page.
--
-- CE QUE ÇA IMPLIQUE — et c'est le cœur de cette migration :
--   L'advisor remonte 107 avis. La très grande majorité est du bruit à cette
--   échelle. On n'applique donc QUE ce qui a un coût nul et un bénéfice réel,
--   et on documente explicitement ce qu'on refuse de faire (voir section 3).
--
-- CONTENU :
--   1. Suppression de 3 index strictement dupliqués (gain réel, coût nul).
--   2. Réécriture des 83 policies RLS `auth_rls_initplan` : `auth.uid()`
--      devient `(select auth.uid())`, évalué UNE fois par requête au lieu
--      d'une fois par ligne. Sémantique STRICTEMENT identique.
--   3. Liste motivée des avis volontairement ignorés (dont les 15 index de
--      clés étrangères : refusés, argumentaire en section 3).
--
-- ⚠ SÉCURITÉ — invariant de cette migration :
--   AUCUNE portée de sécurité n'est modifiée. Chaque policy est recréée avec
--   EXACTEMENT la même expression, les mêmes rôles (`to authenticated` ou
--   défaut PUBLIC), la même commande, et la même présence/absence de
--   WITH CHECK. Les correctifs de confidentialité récents sont préservés tels
--   quels : scope couple de `streaks`/`album_memories` (get_partner_id IS NOT
--   NULL), capsules scellées, etc. Seules les parenthèses `(select …)` sont
--   ajoutées. Les policies du schéma `storage` (buckets `album-photos` et
--   `vlogs`) ne sont PAS touchées.
--
--   Rappel Postgres : pour une policy UPDATE créée sans WITH CHECK, c'est
--   l'expression USING qui sert aussi de contrôle à l'écriture. On reproduit
--   donc l'absence de WITH CHECK à l'identique là où c'était le cas.
--
-- IDEMPOTENCE : `drop index if exists` + `drop policy if exists` / `create
--   policy`. Rejouable sans erreur. (`create or replace policy` n'existe pas
--   en Postgres 15/17, d'où le couple drop/create.)
--   À jouer dans une transaction — c'est ce que fait `supabase db push` — pour
--   qu'il n'existe aucun instant où une table serait sans policy.
--
-- ROLLBACK : rejouer les migrations 20260818120000, 20260819120000 et les
--   correctifs 20260826* qui contiennent les définitions d'origine, puis
--   recréer les 3 index supprimés (définitions rappelées en section 1).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — Index strictement dupliqués (lint `duplicate_index`)
-- ═══════════════════════════════════════════════════════════════════════════
-- Trois paires d'index ont des définitions rigoureusement identiques (vérifié
-- via pg_indexes.indexdef, colonnes ET ordre de tri identiques). Le doublon
-- n'apporte rien : il est maintenu à chaque INSERT/UPDATE et occupe de la
-- place, pour un plan de requête inchangé. C'est le seul gain de cette
-- migration qui compte vraiment au quotidien, `moods` étant la table la plus
-- écrite de l'app (une humeur par jour et par personne, + realtime).
--
-- On garde systématiquement l'index déclaré dans les migrations versionnées
-- (`*_idx`, migration 20260818120000) et on supprime le doublon `idx_*` créé
-- hors migration : ainsi un `supabase db reset` reproduit exactement cet état.
--
-- Définitions supprimées, pour rollback :
--   create index idx_calendar_events_date on public.calendar_events (start_at);
--   create index idx_moods_user_date on public.moods (user_id, created_at desc);
--   create index idx_thoughts_receiver on public.thoughts (receiver_id, created_at desc);

-- Doublon de `calendar_events_start_idx` (start_at)
drop index if exists public.idx_calendar_events_date;

-- Doublon de `moods_user_created_idx` (user_id, created_at desc)
drop index if exists public.idx_moods_user_date;

-- Doublon de `thoughts_receiver_created_idx` (receiver_id, created_at desc)
drop index if exists public.idx_thoughts_receiver;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — RLS : `auth.uid()` évalué une fois, pas par ligne
--             (lint `auth_rls_initplan`, 83 occurrences)
-- ═══════════════════════════════════════════════════════════════════════════
-- Écrit `auth.uid()`, Postgres traite l'appel comme une expression à évaluer
-- pour CHAQUE ligne examinée. Écrit `(select auth.uid())`, le planificateur en
-- fait un InitPlan : évalué UNE seule fois, en amont, puis réutilisé comme une
-- constante. Le résultat est le même — `auth.uid()` est STABLE et ne dépend
-- d'aucune colonne — donc la portée de la policy est inchangée.
--
-- Même traitement pour `get_partner_id(auth.uid())` / `get_couple_id(auth.uid())` :
-- ce sont des fonctions SECURITY DEFINER qui lisent `profiles`. Appelées par
-- ligne, elles multiplient les allers-retours. On enveloppe l'appel COMPLET —
-- `(select get_partner_id((select auth.uid())))` — car il ne dépend, lui non
-- plus, d'aucune colonne de la ligne courante : un seul InitPlan.
--   * le `select` intérieur satisfait le linter (qui cherche littéralement
--     « (select auth.uid() ») ;
--   * le `select` extérieur est celui qui fait le vrai travail : il empêche le
--     ré-appel de la fonction à chaque ligne.
--
-- EXCEPTION à ne pas rater : `has_answered(question_id, auth.uid())` dépend de
-- la colonne `question_id`, donc de la ligne. L'envelopper entièrement
-- CHANGERAIT le résultat. On n'y réécrit que l'argument `auth.uid()`.
-- Idem pour le `EXISTS (… where p.id = locations.user_id …)` de `locations` :
-- corrélé, laissé tel quel.
--
-- Honnêteté sur le gain : à 44 lignes, ce gain n'est pas mesurable aujourd'hui.
-- On l'applique parce qu'il est GRATUIT (aucun coût en écriture, aucun octet
-- de stockage, contrairement à un index), qu'il tient si les tables grossissent,
-- et qu'il fait tomber 83 des 107 avis — ce qui rend l'advisor à nouveau
-- utilisable comme signal.

-- ─── album_memories ────────────────────────────────────────────────────────
-- Scope « membre d'un couple lié » (correctif confidentialité 2) : conservé
-- à l'identique, seule l'évaluation change.
drop policy if exists "album_memories authenticated select" on public.album_memories;
create policy "album_memories authenticated select" on public.album_memories
  for select to authenticated
  using ((select get_partner_id((select auth.uid()))) is not null);

drop policy if exists "album_memories authenticated insert" on public.album_memories;
create policy "album_memories authenticated insert" on public.album_memories
  for insert to authenticated
  with check ((select get_partner_id((select auth.uid()))) is not null);

drop policy if exists "album_memories authenticated update" on public.album_memories;
create policy "album_memories authenticated update" on public.album_memories
  for update to authenticated
  using ((select get_partner_id((select auth.uid()))) is not null)
  with check ((select get_partner_id((select auth.uid()))) is not null);

drop policy if exists "album_memories authenticated delete" on public.album_memories;
create policy "album_memories authenticated delete" on public.album_memories
  for delete to authenticated
  using ((select get_partner_id((select auth.uid()))) is not null);

-- ─── availability ──────────────────────────────────────────────────────────
drop policy if exists "availability select partners" on public.availability;
create policy "availability select partners" on public.availability
  for select to authenticated
  using ((user_id = (select auth.uid())) or (user_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "availability upsert own" on public.availability;
create policy "availability upsert own" on public.availability
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "availability update own" on public.availability;
create policy "availability update own" on public.availability
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── bucket_items ──────────────────────────────────────────────────────────
-- Rôle PUBLIC (pas de `to authenticated`) : reproduit à l'identique. Les deux
-- sous-requêtes sur `profiles` sont déjà non corrélées ; on ne réécrit que
-- l'`auth.uid()` qu'elles contiennent.
drop policy if exists "Users can view couple bucket items" on public.bucket_items;
create policy "Users can view couple bucket items" on public.bucket_items
  for select
  using (
    (created_by = (select auth.uid()))
    or (created_by in (select profiles.id from profiles where (profiles.partner_id = (select auth.uid()))))
    or (created_by in (select profiles.partner_id from profiles where (profiles.id = (select auth.uid()))))
  );

drop policy if exists "Users can insert bucket items" on public.bucket_items;
create policy "Users can insert bucket items" on public.bucket_items
  for insert
  with check (created_by = (select auth.uid()));

-- UPDATE sans WITH CHECK à l'origine : on n'en ajoute pas (le USING fait office
-- de contrôle d'écriture — ajouter un WITH CHECK changerait la portée).
drop policy if exists "Users can update bucket items" on public.bucket_items;
create policy "Users can update bucket items" on public.bucket_items
  for update
  using (
    (created_by = (select auth.uid()))
    or (created_by in (select profiles.id from profiles where (profiles.partner_id = (select auth.uid()))))
    or (created_by in (select profiles.partner_id from profiles where (profiles.id = (select auth.uid()))))
  );

drop policy if exists "Users can delete own bucket items" on public.bucket_items;
create policy "Users can delete own bucket items" on public.bucket_items
  for delete
  using (created_by = (select auth.uid()));

-- ─── calendar_events ───────────────────────────────────────────────────────
-- Attention : le DELETE est `to authenticated`, les trois autres sont PUBLIC.
-- Asymétrie d'origine, conservée telle quelle.
drop policy if exists "Both partners can view events" on public.calendar_events;
create policy "Both partners can view events" on public.calendar_events
  for select
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can create events" on public.calendar_events;
create policy "Users can create events" on public.calendar_events
  for insert
  with check (created_by = (select auth.uid()));

drop policy if exists "Users can update events" on public.calendar_events;
create policy "Users can update events" on public.calendar_events
  for update
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Both partners can delete events" on public.calendar_events;
create policy "Both partners can delete events" on public.calendar_events
  for delete to authenticated
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

-- ─── capsules ──────────────────────────────────────────────────────────────
-- Le SELECT direct sur la table reste révoqué au niveau GRANT (correctif 4,
-- lecture via `get_capsules()`). La policy SELECT est conservée telle quelle :
-- la supprimer ou l'élargir sortirait du périmètre de cette migration perf.
drop policy if exists "Users can view own capsules when revealed" on public.capsules;
create policy "Users can view own capsules when revealed" on public.capsules
  for select
  using (
    (sender_id = (select auth.uid()))
    or ((receiver_id = (select auth.uid())) and (reveal_date <= CURRENT_DATE))
  );

drop policy if exists "Users can create capsules" on public.capsules;
create policy "Users can create capsules" on public.capsules
  for insert
  with check ((sender_id = (select auth.uid())) and (receiver_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "Sender can delete unopened capsule" on public.capsules;
create policy "Sender can delete unopened capsule" on public.capsules
  for delete to authenticated
  using ((sender_id = (select auth.uid())) and (is_opened = false));

drop policy if exists "Receiver can open capsule" on public.capsules;
create policy "Receiver can open capsule" on public.capsules
  for update to authenticated
  using ((receiver_id = (select auth.uid())) and (reveal_date <= CURRENT_DATE))
  with check ((receiver_id = (select auth.uid())) and (reveal_date <= CURRENT_DATE));

-- ─── countdowns ────────────────────────────────────────────────────────────
drop policy if exists "Both partners can view countdowns" on public.countdowns;
create policy "Both partners can view countdowns" on public.countdowns
  for select
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can create countdowns" on public.countdowns;
create policy "Users can create countdowns" on public.countdowns
  for insert
  with check (created_by = (select auth.uid()));

drop policy if exists "Users can update own countdowns" on public.countdowns;
create policy "Users can update own countdowns" on public.countdowns
  for update
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can delete own countdowns" on public.countdowns;
create policy "Users can delete own countdowns" on public.countdowns
  for delete
  using (created_by = (select auth.uid()));

-- ─── daily_questions ───────────────────────────────────────────────────────
drop policy if exists "daily_questions couple select" on public.daily_questions;
create policy "daily_questions couple select" on public.daily_questions
  for select to authenticated
  using (couple_id = (select get_couple_id((select auth.uid()))));

-- ─── gratitudes ────────────────────────────────────────────────────────────
-- SELECT/INSERT sont PUBLIC, UPDATE/DELETE sont `to authenticated` : conservé.
drop policy if exists "Both partners can view gratitudes" on public.gratitudes;
create policy "Both partners can view gratitudes" on public.gratitudes
  for select
  using ((user_id = (select auth.uid())) or (user_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can insert own gratitudes" on public.gratitudes;
create policy "Users can insert own gratitudes" on public.gratitudes
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own gratitudes" on public.gratitudes;
create policy "Users can update own gratitudes" on public.gratitudes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own gratitudes" on public.gratitudes;
create policy "Users can delete own gratitudes" on public.gratitudes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── locations ─────────────────────────────────────────────────────────────
-- Le EXISTS est CORRÉLÉ (`p.id = locations.user_id`) : il doit rester évalué
-- par ligne. On ne l'enveloppe pas — seul `get_partner_id(auth.uid())`, qui
-- lui ne dépend d'aucune colonne, est sorti en InitPlan. Le garde-fou
-- `p.share_location` est intact.
drop policy if exists "locations select partners" on public.locations;
create policy "locations select partners" on public.locations
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or (
      (user_id = (select get_partner_id((select auth.uid()))))
      and (exists (select 1 from profiles p where ((p.id = locations.user_id) and p.share_location)))
    )
  );

drop policy if exists "locations insert own" on public.locations;
create policy "locations insert own" on public.locations
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "locations delete own" on public.locations;
create policy "locations delete own" on public.locations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── love_notes ────────────────────────────────────────────────────────────
drop policy if exists "Users can view their own love notes" on public.love_notes;
create policy "Users can view their own love notes" on public.love_notes
  for select
  using ((sender_id = (select auth.uid())) or (receiver_id = (select auth.uid())));

drop policy if exists "Users can insert love notes for their partner" on public.love_notes;
create policy "Users can insert love notes for their partner" on public.love_notes
  for insert to authenticated
  with check ((sender_id = (select auth.uid())) and (receiver_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can update their own love notes" on public.love_notes;
create policy "Users can update their own love notes" on public.love_notes
  for update to authenticated
  using (sender_id = (select auth.uid()))
  with check (sender_id = (select auth.uid()));

-- ─── moods ─────────────────────────────────────────────────────────────────
-- Table la plus lue de l'app (AmbientMood recharge à chaque INSERT realtime)
-- et la plus grosse : c'est ici que l'InitPlan a le plus de sens à terme.
drop policy if exists "Users can view own and partner moods" on public.moods;
create policy "Users can view own and partner moods" on public.moods
  for select
  using ((user_id = (select auth.uid())) or (user_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can insert own moods" on public.moods;
create policy "Users can insert own moods" on public.moods
  for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own moods" on public.moods;
create policy "Users can delete own moods" on public.moods
  for delete
  using (user_id = (select auth.uid()));

-- ─── photo_albums ──────────────────────────────────────────────────────────
drop policy if exists "Both partners can view albums" on public.photo_albums;
create policy "Both partners can view albums" on public.photo_albums
  for select
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can create albums" on public.photo_albums;
create policy "Users can create albums" on public.photo_albums
  for insert
  with check (created_by = (select auth.uid()));

drop policy if exists "Both partners can update albums" on public.photo_albums;
create policy "Both partners can update albums" on public.photo_albums
  for update
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

-- ─── photos ────────────────────────────────────────────────────────────────
drop policy if exists "Both partners can view photos" on public.photos;
create policy "Both partners can view photos" on public.photos
  for select
  using ((uploaded_by = (select auth.uid())) or (uploaded_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can upload photos" on public.photos;
create policy "Users can upload photos" on public.photos
  for insert
  with check (uploaded_by = (select auth.uid()));

drop policy if exists "Both partners can update photos" on public.photos;
create policy "Both partners can update photos" on public.photos
  for update
  using ((uploaded_by = (select auth.uid())) or (uploaded_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can delete own photos" on public.photos;
create policy "Users can delete own photos" on public.photos
  for delete
  using (uploaded_by = (select auth.uid()));

-- ─── profiles ──────────────────────────────────────────────────────────────
-- `get_partner_id` est SECURITY DEFINER : elle lit `profiles` sans repasser par
-- la RLS, donc l'envelopper dans un `(select …)` ne crée aucune récursion
-- nouvelle. La visibilité reste : moi + mon partenaire, personne d'autre.
drop policy if exists "Users can view own and partner profile" on public.profiles;
create policy "Users can view own and partner profile" on public.profiles
  for select
  using ((id = (select auth.uid())) or (id = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert
  with check (id = (select auth.uid()));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update
  using (id = (select auth.uid()));

-- ─── question_answers ──────────────────────────────────────────────────────
-- ⚠ Le SELECT contient `has_answered(question_id, auth.uid())`, qui dépend de
-- la colonne `question_id` : NON enveloppé (sinon on figerait le résultat de la
-- première ligne pour toutes les autres — faille). Seul l'argument auth.uid()
-- est réécrit. C'est ce qui garantit qu'on ne voit la réponse du partenaire
-- qu'après avoir répondu soi-même : comportement inchangé.
drop policy if exists "question_answers_select" on public.question_answers;
create policy "question_answers_select" on public.question_answers
  for select to authenticated
  using (
    (user_id = (select auth.uid()))
    or ((user_id = (select get_partner_id((select auth.uid())))) and has_answered(question_id, (select auth.uid())))
  );

-- Idem : le EXISTS est corrélé à `question_answers.question_id`, on ne
-- l'enveloppe pas ; `get_couple_id(auth.uid())` à l'intérieur, si.
drop policy if exists "question_answers_insert" on public.question_answers;
create policy "question_answers_insert" on public.question_answers
  for insert to authenticated
  with check (
    ((select auth.uid()) = user_id)
    and (exists (
      select 1 from daily_questions d
      where ((d.id = question_answers.question_id) and (d.couple_id = (select get_couple_id((select auth.uid())))))
    ))
  );

drop policy if exists "question_answers_update" on public.question_answers;
create policy "question_answers_update" on public.question_answers
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "question_answers_delete" on public.question_answers;
create policy "question_answers_delete" on public.question_answers
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ─── schedule_slots ────────────────────────────────────────────────────────
drop policy if exists "schedule select partners" on public.schedule_slots;
create policy "schedule select partners" on public.schedule_slots
  for select to authenticated
  using ((user_id = (select auth.uid())) or (user_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "schedule insert own" on public.schedule_slots;
create policy "schedule insert own" on public.schedule_slots
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "schedule update own" on public.schedule_slots;
create policy "schedule update own" on public.schedule_slots
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "schedule delete own" on public.schedule_slots;
create policy "schedule delete own" on public.schedule_slots
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ─── streaks ───────────────────────────────────────────────────────────────
-- Scope « membre d'un couple lié » (correctif confidentialité 2) : conservé.
-- Pas de policy DELETE à l'origine : on n'en crée pas.
drop policy if exists "streaks authenticated select" on public.streaks;
create policy "streaks authenticated select" on public.streaks
  for select to authenticated
  using ((select get_partner_id((select auth.uid()))) is not null);

drop policy if exists "streaks authenticated insert" on public.streaks;
create policy "streaks authenticated insert" on public.streaks
  for insert to authenticated
  with check ((select get_partner_id((select auth.uid()))) is not null);

drop policy if exists "streaks authenticated update" on public.streaks;
create policy "streaks authenticated update" on public.streaks
  for update to authenticated
  using ((select get_partner_id((select auth.uid()))) is not null)
  with check ((select get_partner_id((select auth.uid()))) is not null);

-- ─── taps ──────────────────────────────────────────────────────────────────
drop policy if exists "Users can view sent and received taps" on public.taps;
create policy "Users can view sent and received taps" on public.taps
  for select
  using ((sender_id = (select auth.uid())) or (receiver_id = (select auth.uid())));

drop policy if exists "Users can send taps" on public.taps;
create policy "Users can send taps" on public.taps
  for insert
  with check ((sender_id = (select auth.uid())) and (receiver_id = (select get_partner_id((select auth.uid())))));

-- ─── thoughts ──────────────────────────────────────────────────────────────
drop policy if exists "Users can view sent and received thoughts" on public.thoughts;
create policy "Users can view sent and received thoughts" on public.thoughts
  for select
  using ((sender_id = (select auth.uid())) or (receiver_id = (select auth.uid())));

drop policy if exists "Users can send thoughts to partner" on public.thoughts;
create policy "Users can send thoughts to partner" on public.thoughts
  for insert
  with check ((sender_id = (select auth.uid())) and (receiver_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "Receiver can mark thoughts as read" on public.thoughts;
create policy "Receiver can mark thoughts as read" on public.thoughts
  for update
  using (receiver_id = (select auth.uid()));

-- ─── timeline_events ───────────────────────────────────────────────────────
drop policy if exists "Both partners can view timeline" on public.timeline_events;
create policy "Both partners can view timeline" on public.timeline_events
  for select
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can create timeline events" on public.timeline_events;
create policy "Users can create timeline events" on public.timeline_events
  for insert
  with check (created_by = (select auth.uid()));

drop policy if exists "Both partners can update timeline" on public.timeline_events;
create policy "Both partners can update timeline" on public.timeline_events
  for update
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Creator can delete timeline events" on public.timeline_events;
create policy "Creator can delete timeline events" on public.timeline_events
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- ─── todo_items ────────────────────────────────────────────────────────────
-- La sous-requête `list_id in (select … from todo_lists …)` n'est pas corrélée :
-- on peut y sortir `get_partner_id` en InitPlan sans rien changer au résultat.
drop policy if exists "Both partners can view todo items" on public.todo_items;
create policy "Both partners can view todo items" on public.todo_items
  for select
  using (list_id in (
    select todo_lists.id from todo_lists
    where ((todo_lists.created_by = (select auth.uid()))
        or (todo_lists.created_by = (select get_partner_id((select auth.uid())))))
  ));

drop policy if exists "Both partners can create todo items" on public.todo_items;
create policy "Both partners can create todo items" on public.todo_items
  for insert
  with check (list_id in (
    select todo_lists.id from todo_lists
    where ((todo_lists.created_by = (select auth.uid()))
        or (todo_lists.created_by = (select get_partner_id((select auth.uid())))))
  ));

drop policy if exists "Both partners can update todo items" on public.todo_items;
create policy "Both partners can update todo items" on public.todo_items
  for update
  using (list_id in (
    select todo_lists.id from todo_lists
    where ((todo_lists.created_by = (select auth.uid()))
        or (todo_lists.created_by = (select get_partner_id((select auth.uid())))))
  ));

drop policy if exists "Both partners can delete todo items" on public.todo_items;
create policy "Both partners can delete todo items" on public.todo_items
  for delete
  using (list_id in (
    select todo_lists.id from todo_lists
    where ((todo_lists.created_by = (select auth.uid()))
        or (todo_lists.created_by = (select get_partner_id((select auth.uid())))))
  ));

-- ─── todo_lists ────────────────────────────────────────────────────────────
drop policy if exists "Both partners can view todo lists" on public.todo_lists;
create policy "Both partners can view todo lists" on public.todo_lists
  for select
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can create todo lists" on public.todo_lists;
create policy "Users can create todo lists" on public.todo_lists
  for insert
  with check (created_by = (select auth.uid()));

drop policy if exists "Both partners can update todo lists" on public.todo_lists;
create policy "Both partners can update todo lists" on public.todo_lists
  for update
  using ((created_by = (select auth.uid())) or (created_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can delete own todo lists" on public.todo_lists;
create policy "Users can delete own todo lists" on public.todo_lists
  for delete
  using (created_by = (select auth.uid()));

-- ─── vlogs ─────────────────────────────────────────────────────────────────
drop policy if exists "vlogs select partners" on public.vlogs;
create policy "vlogs select partners" on public.vlogs
  for select to authenticated
  using ((author_id = (select auth.uid())) or (author_id = (select get_partner_id((select auth.uid())))));

drop policy if exists "vlogs insert own" on public.vlogs;
create policy "vlogs insert own" on public.vlogs
  for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "vlogs update own" on public.vlogs;
create policy "vlogs update own" on public.vlogs
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "vlogs delete own" on public.vlogs;
create policy "vlogs delete own" on public.vlogs
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- ─── watch_items ───────────────────────────────────────────────────────────
drop policy if exists "Both partners can view watch items" on public.watch_items;
create policy "Both partners can view watch items" on public.watch_items
  for select
  using ((added_by = (select auth.uid())) or (added_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can add watch items" on public.watch_items;
create policy "Users can add watch items" on public.watch_items
  for insert
  with check (added_by = (select auth.uid()));

drop policy if exists "Both partners can update watch items" on public.watch_items;
create policy "Both partners can update watch items" on public.watch_items
  for update
  using ((added_by = (select auth.uid())) or (added_by = (select get_partner_id((select auth.uid())))));

drop policy if exists "Users can delete own watch items" on public.watch_items;
create policy "Users can delete own watch items" on public.watch_items
  for delete
  using (added_by = (select auth.uid()));

-- `question_bank` n'est pas touchée : sa seule policy est `using (true)`,
-- sans appel à auth.*, donc rien à optimiser.


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — Avis VOLONTAIREMENT ignorés (rien n'est appliqué ici)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 3.1 — `unindexed_foreign_keys` (15 avis) : REFUSÉ, aucun index ajouté.
--   Concernés : bucket_items.created_by, calendar_events.created_by,
--   capsules.sender_id, countdowns.created_by, daily_questions.bank_id,
--   love_notes.receiver_id, photo_albums.created_by, photos.uploaded_by,
--   profiles.partner_id, question_answers.user_id, timeline_events.created_by,
--   todo_items.assigned_to, todo_items.list_id, todo_lists.created_by,
--   watch_items.added_by.
--
--   Pourquoi non : la plus grosse de ces tables fait 44 lignes, la plupart en
--   ont 0 à 5, et chacune tient dans une à deux pages. Sur une table d'une
--   page, le planificateur choisira de toute façon un Seq Scan : l'index ne
--   serait jamais emprunté, mais il serait maintenu à chaque écriture, occuperait
--   ~16 kB chacun (soit plus que certaines tables elles-mêmes) et allongerait
--   l'autovacuum. `profiles.partner_id` est le cas caricatural : 2 lignes.
--   Même argument pour les ON DELETE CASCADE (suppression de compte) : la
--   vérification des FK y balaie des tables d'une page — quelques millisecondes,
--   sur une opération qui arrive une fois dans la vie de l'app.
--
--   SEUIL DE RÉVISION : si un jour une de ces tables dépasse ~5 000 lignes
--   (réalistement : `photos`, `vlogs`, `timeline_events`, `todo_items`), créer
--   alors l'index sur la colonne utilisée par la policy, par exemple :
--     -- create index if not exists photos_uploaded_by_idx on public.photos (uploaded_by);
--     -- create index if not exists timeline_events_created_by_idx on public.timeline_events (created_by);
--     -- create index if not exists todo_items_list_id_idx on public.todo_items (list_id);
--   Laissés en commentaire à dessein : les créer aujourd'hui serait une perte nette.
--
-- 3.2 — `unused_index` (6 avis) : IGNORÉ, aucun index supprimé.
--   vlogs_milestone_idx, idx_thoughts_unread, idx_capsules_reveal,
--   idx_photos_album, idx_calendar_events_date, capsules_receiver_reveal_idx.
--   « Non utilisé » ne veut dire ici que « pg_stat n'a rien enregistré » : les
--   compteurs sont remis à zéro à chaque redémarrage de l'instance et les tables
--   concernées sont quasi vides (thoughts = 0, photos = 0, capsules = 0). Ces
--   index couvrent des requêtes réelles de l'app (pastilles non lues, capsules à
--   révéler, photos d'un album, jalons du vlog) : les supprimer sur la foi de
--   statistiques vides serait un faux positif.
--   Exception traitée en section 1 : `idx_calendar_events_date`, supprimé non
--   pas parce qu'il est inutilisé mais parce qu'il est un doublon exact.
--
-- 3.3 — `multiple_permissive_policies` : AUCUN avis remonté.
--   Vérifié dans pg_policies : chaque couple (table, commande) n'a qu'une seule
--   policy permissive. Rien à fusionner. (L'audit mentionnait ce point ; il
--   n'est pas confirmé par l'advisor ni par le catalogue.)
--
-- 3.4 — Avis de SÉCURITÉ restants, hors périmètre de cette migration perf :
--   * `authenticated_security_definer_function_executable` (8 fonctions) :
--     get_capsules, get_couple_id, get_partner_id, has_answered,
--     link_partner_by_code, unlink_partner, delete_my_account,
--     get_daily_question. Toutes sont appelées INTENTIONNELLEMENT par l'app
--     (RPC) ou par les policies ci-dessus, et le correctif 5 a déjà retiré les
--     droits d'exécution à `anon` là où il le fallait. Avis assumé, pas de
--     changement.
--   * `auth_leaked_password_protection` : se règle dans le Dashboard Supabase
--     (Auth → Password protection), pas par une migration SQL.
-- ═══════════════════════════════════════════════════════════════════════════
