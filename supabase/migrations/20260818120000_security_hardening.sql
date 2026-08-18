-- ============================================================================
-- Nous Deux — durcissement sécurité + correctifs fonctionnels (18/08/2026)
-- Idempotent : peut être rejoué sans casser.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

-- Identifiant stable du couple : le plus petit des deux uuid (ou le sien si seul)
create or replace function public.get_couple_id(user_uuid uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when p.partner_id is null then p.id
    else least(p.id, p.partner_id)
  end
  from profiles p where p.id = user_uuid
$$;

-- A-t-il déjà répondu à cette question ? (definer pour éviter la récursion RLS)
create or replace function public.has_answered(q_id uuid, user_uuid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from question_answers where question_id = q_id and user_id = user_uuid)
$$;

-- Fonctions SECURITY DEFINER : jamais exécutables par anon / public
revoke execute on function public.get_partner_id(uuid) from public, anon;
revoke execute on function public.link_partner_by_code(text) from public, anon;
revoke execute on function public.get_couple_id(uuid) from public, anon;
revoke execute on function public.has_answered(uuid, uuid) from public, anon;
grant  execute on function public.get_partner_id(uuid) to authenticated;
grant  execute on function public.link_partner_by_code(text) to authenticated;
grant  execute on function public.get_couple_id(uuid) to authenticated;
grant  execute on function public.has_answered(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. profiles : personne ne peut se lier tout seul à un partenaire
--    (avant : UPDATE profiles SET partner_id = <victime> était possible,
--     et donnait accès en lecture à toutes les données de la victime)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists relationship_start date;

revoke insert, update, delete on table public.profiles from anon, authenticated;
grant insert (id, display_name, timezone, location_city, location_country, location_lat, location_lng, relationship_start)
  on table public.profiles to authenticated;
grant update (display_name, avatar_url, timezone, location_city, location_country, location_lat, location_lng, relationship_start, updated_at)
  on table public.profiles to authenticated;

-- Ceinture + bretelles : trigger qui bloque tout changement de partner_id / partner_code
-- hors des fonctions SECURITY DEFINER (qui tournent en tant que propriétaire).
create or replace function public.protect_profile_link_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.partner_id is distinct from old.partner_id or new.partner_code is distinct from old.partner_code)
     and current_user in ('authenticated', 'anon') then
    raise exception 'partner_id / partner_code ne peuvent pas être modifiés directement';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_link_columns on public.profiles;
create trigger protect_profile_link_columns
  before update on public.profiles
  for each row execute function public.protect_profile_link_columns();

-- Le profil est créé automatiquement à l'inscription (plus de course client)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Suppression de compte : cascades manquantes
alter table public.profiles drop constraint if exists profiles_partner_id_fkey;
alter table public.profiles add constraint profiles_partner_id_fkey
  foreign key (partner_id) references public.profiles(id) on delete set null;
alter table public.love_notes drop constraint if exists love_notes_sender_id_fkey;
alter table public.love_notes add constraint love_notes_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete cascade;
alter table public.love_notes drop constraint if exists love_notes_receiver_id_fkey;
alter table public.love_notes add constraint love_notes_receiver_id_fkey
  foreign key (receiver_id) references public.profiles(id) on delete cascade;
alter table public.bucket_items drop constraint if exists bucket_items_created_by_fkey;
alter table public.bucket_items add constraint bucket_items_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete cascade;
alter table public.todo_items drop constraint if exists todo_items_assigned_to_fkey;
alter table public.todo_items add constraint todo_items_assigned_to_fkey
  foreign key (assigned_to) references public.profiles(id) on delete set null;

-- Se délier / supprimer son compte
create or replace function public.unlink_partner()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  my_uuid uuid := auth.uid();
  partner_uuid uuid;
begin
  if my_uuid is null then raise exception 'Non authentifié'; end if;
  select partner_id into partner_uuid from profiles where id = my_uuid;
  update profiles set partner_id = null where id = my_uuid;
  if partner_uuid is not null then
    update profiles set partner_id = null where id = partner_uuid and partner_id = my_uuid;
  end if;
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  my_uuid uuid := auth.uid();
begin
  if my_uuid is null then raise exception 'Non authentifié'; end if;
  perform public.unlink_partner();
  delete from auth.users where id = my_uuid;
end;
$$;

revoke execute on function public.unlink_partner() from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.unlink_partner() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- link_partner_by_code : refuser si JE suis déjà lié (l'ancienne version ne vérifiait
-- que le partenaire), et normaliser le code.
create or replace function public.link_partner_by_code(invite_code text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  partner_uuid uuid;
  my_uuid uuid := auth.uid();
begin
  if my_uuid is null then raise exception 'Non authentifié'; end if;
  if (select partner_id from profiles where id = my_uuid) is not null then
    raise exception 'Tu es déjà lié(e) à un(e) partenaire';
  end if;
  select id into partner_uuid from profiles
   where partner_code = upper(trim(invite_code)) and id <> my_uuid;
  if partner_uuid is null then
    raise exception 'Code invalide ou introuvable';
  end if;
  if (select partner_id from profiles where id = partner_uuid) is not null then
    raise exception 'Ce compte est déjà lié à un(e) partenaire';
  end if;
  update profiles set partner_id = partner_uuid where id = my_uuid;
  update profiles set partner_id = my_uuid where id = partner_uuid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Question du jour : par couple, aléatoire, sans répétition, révélation serveur
-- ---------------------------------------------------------------------------
alter table public.daily_questions add column if not exists couple_id uuid;
alter table public.daily_questions add column if not exists bank_id uuid references public.question_bank(id) on delete set null;

-- Les anciennes lignes étaient globales et dupliquées (StrictMode) → on repart propre
delete from public.daily_questions where couple_id is null
  and not exists (select 1 from public.question_answers qa where qa.question_id = daily_questions.id);

create unique index if not exists daily_questions_couple_date_key
  on public.daily_questions (couple_id, date);

drop policy if exists "daily_questions authenticated insert" on public.daily_questions;
drop policy if exists "daily_questions authenticated select" on public.daily_questions;
drop policy if exists "daily_questions couple select" on public.daily_questions;
create policy "daily_questions couple select" on public.daily_questions
  for select to authenticated
  using (couple_id = public.get_couple_id(auth.uid()));
revoke insert, update, delete, truncate, references, trigger on table public.daily_questions from anon, authenticated;
revoke all on table public.daily_questions from anon;

-- Banque de questions : lecture seule pour les connectés
revoke all on table public.question_bank from anon;
revoke insert, update, delete, truncate, references, trigger on table public.question_bank from authenticated;

create or replace function public.get_daily_question()
returns public.daily_questions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  my_uuid uuid := auth.uid();
  cid uuid;
  today date := current_date;
  q public.daily_questions;
  picked public.question_bank;
begin
  if my_uuid is null then raise exception 'Non authentifié'; end if;
  cid := public.get_couple_id(my_uuid);

  select * into q from daily_questions where couple_id = cid and date = today;
  if found then return q; end if;

  -- Question jamais posée à ce couple, au hasard ; sinon n'importe laquelle
  select * into picked from question_bank qb
   where not exists (select 1 from daily_questions d where d.couple_id = cid and d.bank_id = qb.id)
   order by random() limit 1;
  if not found then
    select * into picked from question_bank order by random() limit 1;
  end if;
  if not found then return null; end if;

  insert into daily_questions (question, category, date, couple_id, bank_id)
  values (picked.question, picked.category, today, cid, picked.id)
  on conflict (couple_id, date) do nothing;

  select * into q from daily_questions where couple_id = cid and date = today;
  return q;
end;
$$;
revoke execute on function public.get_daily_question() from public, anon;
grant execute on function public.get_daily_question() to authenticated;

-- Réponses : je vois la mienne ; celle du/de la partenaire seulement après avoir répondu
drop policy if exists "question_answers_select" on public.question_answers;
create policy "question_answers_select" on public.question_answers
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      user_id = public.get_partner_id(auth.uid())
      and public.has_answered(question_id, auth.uid())
    )
  );
drop policy if exists "question_answers_insert" on public.question_answers;
create policy "question_answers_insert" on public.question_answers
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from daily_questions d where d.id = question_id and d.couple_id = public.get_couple_id(auth.uid()))
  );
drop policy if exists "question_answers_update" on public.question_answers;
create policy "question_answers_update" on public.question_answers
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "question_answers_delete" on public.question_answers;
create policy "question_answers_delete" on public.question_answers
  for delete to authenticated using (auth.uid() = user_id);
revoke all on table public.question_answers from anon;

-- ---------------------------------------------------------------------------
-- 3. Gratitudes : upsert possible (UNIQUE(user_id,date) existait déjà, pas de DELETE)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can delete own gratitudes" on public.gratitudes;
create policy "Users can delete own gratitudes" on public.gratitudes
  for delete to authenticated using (user_id = auth.uid());
drop policy if exists "Users can update own gratitudes" on public.gratitudes;
create policy "Users can update own gratitudes" on public.gratitudes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Timeline / capsules / calendrier : suppressions qui étaient silencieusement refusées
-- ---------------------------------------------------------------------------
drop policy if exists "Creator can delete timeline events" on public.timeline_events;
create policy "Creator can delete timeline events" on public.timeline_events
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists "Sender can delete unopened capsule" on public.capsules;
create policy "Sender can delete unopened capsule" on public.capsules
  for delete to authenticated using (sender_id = auth.uid() and is_opened = false);
-- Le/la destinataire ne peut modifier que l'état d'ouverture, pas le contenu
drop policy if exists "Receiver can open capsule" on public.capsules;
create policy "Receiver can open capsule" on public.capsules
  for update to authenticated
  using (receiver_id = auth.uid() and reveal_date <= current_date)
  with check (receiver_id = auth.uid() and reveal_date <= current_date);
revoke update on table public.capsules from authenticated, anon;
grant update (is_opened, opened_at) on table public.capsules to authenticated;

-- Événements : le/la partenaire peut aussi supprimer (agenda partagé)
drop policy if exists "Users can delete own events" on public.calendar_events;
drop policy if exists "Both partners can delete events" on public.calendar_events;
create policy "Both partners can delete events" on public.calendar_events
  for delete to authenticated
  using (created_by = auth.uid() or created_by = public.get_partner_id(auth.uid()));
alter table public.calendar_events drop constraint if exists calendar_events_dates_check;
alter table public.calendar_events add constraint calendar_events_dates_check check (end_at > start_at);

-- ---------------------------------------------------------------------------
-- 5. love_notes / thoughts / taps : le destinataire doit être MON partenaire
-- ---------------------------------------------------------------------------
drop policy if exists "Users can insert love notes for their partner" on public.love_notes;
create policy "Users can insert love notes for their partner" on public.love_notes
  for insert to authenticated
  with check (sender_id = auth.uid() and receiver_id = public.get_partner_id(auth.uid()));
drop policy if exists "Users can update their own love notes" on public.love_notes;
create policy "Users can update their own love notes" on public.love_notes
  for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- Anti-spam taps : 30 / jour / expéditeur
create or replace function public.limit_taps_per_day()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from taps where sender_id = new.sender_id and created_at >= date_trunc('day', now())) >= 30 then
    raise exception 'Trop de "je pense à toi" aujourd''hui — garde-en pour demain 💛';
  end if;
  return new;
end;
$$;
drop trigger if exists limit_taps_per_day on public.taps;
create trigger limit_taps_per_day before insert on public.taps
  for each row execute function public.limit_taps_per_day();

-- Longueur des contenus texte (défense en profondeur)
alter table public.thoughts    drop constraint if exists thoughts_content_len;
alter table public.thoughts    add  constraint thoughts_content_len    check (content is null or char_length(content) <= 2000);
alter table public.love_notes  drop constraint if exists love_notes_content_len;
alter table public.love_notes  add  constraint love_notes_content_len  check (char_length(content) <= 500);
alter table public.capsules    drop constraint if exists capsules_content_len;
alter table public.capsules    add  constraint capsules_content_len    check (char_length(content) <= 5000);
alter table public.question_answers drop constraint if exists question_answers_len;
alter table public.question_answers add  constraint question_answers_len check (char_length(answer) <= 2000);

-- ---------------------------------------------------------------------------
-- 6. Tables non utilisées par l'app : plus d'accès public
-- ---------------------------------------------------------------------------
revoke all on table public.streaks from anon;
revoke all on table public.photos from anon;
revoke all on table public.photo_albums from anon;
revoke all on table public.album_memories from anon;

-- ---------------------------------------------------------------------------
-- 7. Index utiles (realtime + requêtes fréquentes)
-- ---------------------------------------------------------------------------
create index if not exists thoughts_receiver_created_idx on public.thoughts (receiver_id, created_at desc);
create index if not exists thoughts_sender_created_idx   on public.thoughts (sender_id, created_at desc);
create index if not exists taps_sender_created_idx       on public.taps (sender_id, created_at desc);
create index if not exists moods_user_created_idx        on public.moods (user_id, created_at desc);
create index if not exists love_notes_pair_idx           on public.love_notes (sender_id, receiver_id, is_active, created_at desc);
create index if not exists calendar_events_start_idx     on public.calendar_events (start_at);
create index if not exists capsules_receiver_reveal_idx  on public.capsules (receiver_id, reveal_date);

-- Fonctions trigger : jamais exposées via /rpc
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_link_columns() from public, anon, authenticated;
revoke execute on function public.limit_taps_per_day() from public, anon, authenticated;
